import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { sampleJob, sampleText } from '../src/sample.js';

const pdfText = ['Avery Morgan', 'Data Analyst', 'avery.morgan@example.com', 'Experience', 'Built 12 dashboards for operations teams.', 'Skills', 'SQL, Tableau, Excel'];

function makePdf(lines, image) {
  const stream = image ? 'q 600 0 0 330 0 435 cm /Scan Do Q' :
    'BT /F1 12 Tf 48 750 Td 18 TL ' + lines.map((line, index) => (index ? 'T* ' : '') + '(' + line + ') Tj').join(' ') + ' ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${image ? '<< /XObject << /Scan 5 0 R >> >>' : '<< /Font << /F1 5 0 R >> >>'} /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    image ? `<< /Type /XObject /Subtype /Image /Width 1000 /Height 550 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n${image.toString('latin1')}\nendstream` :
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let document = '%PDF-1.4\n';
  const offsets = ['0000000000 65535 f \n'];
  for (const [index, object] of objects.entries()) {
    offsets.push(String(document.length).padStart(10, '0') + ' 00000 n \n');
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = document.length;
  return Buffer.from(document + `xref\n0 ${offsets.length}\n${offsets.join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`, 'latin1');
}

async function analyze(page, name, mimeType, buffer) {
  await page.locator('#file').setInputFiles({ name, mimeType, buffer });
  await page.getByRole('button', { name: 'Analyze resume' }).click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible({ timeout: 45000 });
  await page.getByRole('tab', { name: 'Parsed resume' }).click();
}

test('demo, keyboard tabs, scoring dialog, and report download', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How scoring works' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'View sample report' }).click();
  await expect(page.getByRole('heading', { name: 'What to improve' })).toBeVisible();
  await page.getByRole('tab', { name: 'Overview' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Extracted text' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: /Missing keywords/ })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('shortlist-resume-report.txt');
  expect(await download.failure()).toBeNull();
});

test('TXT upload, job comparison, safe text rendering, and reset', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Analyze resume' }).click();
  await expect(page.getByRole('alert')).toHaveText('Choose a resume to analyze.');
  await page.locator('#file').setInputFiles({ name: 'resume.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toContainText('Choose a PDF');
  await page.getByText('Job description', { exact: false }).filter({ hasText: 'Optional' }).last().click();
  await page.getByRole('textbox', { name: 'Job description' }).fill(sampleJob);
  await analyze(page, 'sample.txt', 'text/plain', Buffer.from(sampleText + '\n<img src=x onerror=alert(1)>'));
  await expect(page.locator('pre')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#report img')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Keywords' }).click();
  await expect(page.getByText('Power BI', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New scan' }).click();
  await expect(page.getByRole('button', { name: 'Choose a file' })).toBeVisible();
});

test('extracts selectable PDF text', async ({ page }) => {
  await page.goto('/');
  await analyze(page, 'sample.pdf', 'application/pdf', makePdf(pdfText));
  await expect(page.locator('pre')).toContainText('Built 12 dashboards for operations teams.');
  await expect(page.locator('pre')).toContainText('avery.morgan@example.com');
});

test('extracts DOCX body, header, table cells, and hyperlinks', async ({ page }) => {
  await page.goto('/');
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paragraph = value => `<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`;
  const file = zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${namespace}"><w:body>${paragraph('Experience')}<w:tbl><w:tr><w:tc>${paragraph('Built 12 dashboards for operations teams.')}</w:tc></w:tr></w:tbl></w:body></w:document>`),
    'word/header1.xml': strToU8(`<w:hdr xmlns:w="${namespace}">${paragraph('Avery Morgan')}${paragraph('avery.morgan@example.com')}</w:hdr>`),
    'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" TargetMode="External" Target="https://example.com/portfolio"/></Relationships>'),
  });
  await analyze(page, 'sample.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from(file));
  await expect(page.locator('pre')).toContainText('Built 12 dashboards');
  await expect(page.getByText('https://example.com/portfolio', { exact: true })).toBeVisible();
  await expect(page.getByText('Word tables or text boxes detected')).toBeVisible();
});

async function makeScan(page) {
  return Buffer.from(await page.evaluate(lines => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 550;
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, 1000, 550);
    context.fillStyle = 'black';
    context.font = '32px Arial';
    lines.forEach((line, index) => context.fillText(line, 65, 65 + 63 * index));
    return canvas.toDataURL('image/jpeg', 0.93).split(',')[1];
  }, pdfText), 'base64');
}

test('recognizes a scanned PDF without an external request', async ({ page }) => {
  const external = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173')) external.push(request.url());
  });
  await page.goto('/');
  await analyze(page, 'scan.pdf', 'application/pdf', makePdf([], await makeScan(page)));
  await expect(page.getByText(/English OCR applied/)).toBeVisible();
  await expect(page.locator('pre')).toContainText('Built 12 dashboards');
  expect(external).toEqual([]);
});

test('recognizes an image at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await analyze(page, 'scan.jpg', 'image/jpeg', await makeScan(page));
  await expect(page.locator('pre')).toContainText('Avery Morgan');
  const fits = await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth);
  expect(fits).toBe(true);
});
