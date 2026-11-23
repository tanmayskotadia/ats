import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('real MiniLM inference retrieves a paraphrase, preserves scores, and stays on the app origin', async ({ page }) => {
  test.skip(!existsSync('public/models/minilm/ready.json'), 'Run npm run models:download before testing actual model inference.');
  const external = [];
  await page.route('**/*', route => {
    if (!route.request().url().startsWith('http://127.0.0.1:4173')) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/');
  await page.locator('#job-panel summary').click();
  await page.locator('#job').fill('Design dashboards to visualize sales performance and business trends.');
  const text = 'Sam Rivera\nsam@example.com\nExperience\nBusiness Analyst | Acme\nJan 2020 - Dec 2022\n• Built interactive charts and executive reports showing quarterly revenue and sales trends.\n• Scheduled field irrigation and planted seasonal crops on a farm.\nSkills\nTableau, SQL';
  const upload = () => page.locator('#file').setInputFiles({ name: 'profile.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await upload();
  await page.locator('#scan').click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible();
  const mlScore = await page.locator('.report-banner .ring strong').textContent();
  await page.getByRole('tab', { name: 'Job match' }).click();
  const matches = page.locator('.model-matches');
  await expect(matches.getByRole('heading', { name: 'Related experience' })).toBeVisible();
  await expect(matches.locator('blockquote').first()).toContainText('Built interactive charts');
  await expect(matches.getByText(/Similarity 0\./)).toBeVisible();
  await expect(page.locator('.report-warnings')).toHaveCount(0);
  expect(external).toEqual([]);
  await page.getByRole('button', { name: 'New scan' }).click();
  await page.locator('#use-ml').uncheck();
  await upload();
  await page.locator('#scan').click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible();
  expect(await page.locator('.report-banner .ring strong').textContent()).toBe(mlScore);
});

test('failed model loads preserve the profile and explain ML availability', async ({ page }) => {
  await page.route('**/ml-runtime/**', route => route.abort());
  await page.goto('/');
  await page.locator('#job-panel summary').click();
  await page.locator('#job').fill('Design dashboards to explain operations performance.');
  await page.locator('#file').setInputFiles({ name: 'profile.txt', mimeType: 'text/plain', buffer: Buffer.from('Sam Rivera\nExperience\nAnalyst | Acme\nBuilt dashboards for operations managers.\nSkills\nSQL, Tableau') });
  await page.locator('#scan').click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible();
  await expect(page.locator('.report-warnings')).toContainText('Keyword matching is still available.');
  await page.getByRole('tab', { name: 'Parsed resume' }).click();
  await expect(page.locator('pre')).toContainText('Built dashboards');
});

test('uses the pinned model download path when the app has no hosted weights', async ({ page }) => {
  test.skip(!existsSync('public/models/minilm/ready.json'), 'Run npm run models:download before testing model loading.');
  await page.route('**/models/minilm/ready.json', route => route.fulfill({ status: 404, body: '' }));
  const downloads = [];
  await page.route('https://huggingface.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const match = path.match(/^\/Xenova\/all-MiniLM-L6-v2\/resolve\/([^/]+)\/(config.json|tokenizer.json|tokenizer_config.json|onnx\/model_quantized.onnx)$/);
    if (!match) return route.abort();
    downloads.push(match[1] + '/' + match[2]);
    const contentType = match[2].endsWith('.json') ? 'application/json' : 'application/octet-stream';
    const body = await readFile('public/models/minilm/' + match[2]);
    await route.fulfill({ body, contentType });
  });
  await page.goto('/');
  await page.locator('#job-panel summary').click();
  await page.locator('#job').fill('Build data dashboards for business operations.');
  await page.locator('#file').setInputFiles({ name: 'profile.txt', mimeType: 'text/plain', buffer: Buffer.from('Sam Rivera\nExperience\nAnalyst | Acme\nBuilt data dashboards for business operations.\nSkills\nSQL, Tableau') });
  await page.locator('#scan').click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible();
  await page.getByRole('tab', { name: 'Job match' }).click();
  await expect(page.getByRole('heading', { name: 'Related experience' })).toBeVisible();
  expect(downloads.some(path => path === '751bff37182d3f1213fa05d7196b954e230abad9/onnx/model_quantized.onnx')).toBe(true);
});
