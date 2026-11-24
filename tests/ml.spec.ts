import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { embeddingModel, rerankingModel } from '../src/ml-config.ts';

const primaryAssets = `public/models/${embeddingModel.folder}`;
const rerankerAssets = `public/models/${rerankingModel.folder}`;

test('real local inference retrieves a paraphrase, preserves scores, and stays on the app origin', async ({ page }) => {
  test.skip(!existsSync(`${primaryAssets}/ready.json`) || !existsSync(`${rerankerAssets}/ready.json`), 'Run npm run models:download before testing actual model inference.');
  const external: string[] = [];
  await page.route('**/*', route => {
    if (!route.request().url().startsWith('http://127.0.0.1:4173')) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/');
  await expect(page.locator('#use-ml')).not.toBeChecked();
  await page.locator('#use-ml').check();
  await page.locator('#job-panel summary').click();
  await page.locator('#job').fill('Design dashboards to visualize sales performance and business trends.');
  const text = 'Sam Rivera\nsam@example.com\nExperience\nBusiness Analyst | Acme\nJan 2020 - Dec 2022\n• Built interactive charts and executive reports showing quarterly revenue and sales trends.\n• Scheduled field irrigation and planted seasonal crops on a farm.\nSkills\nTableau, SQL';
  const upload = () => page.locator('#file').setInputFiles({ name: 'profile.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await upload();
  await page.locator('#scan').click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible({ timeout: 45000 });
  const mlScore = await page.locator('.report-banner .ring strong').textContent();
  await page.getByRole('tab', { name: 'Job match' }).click();
  const matches = page.locator('.model-matches');
  await expect(matches.getByRole('heading', { name: 'Related experience' })).toBeVisible();
  await expect(matches.getByText(`${embeddingModel.name} · Local ML`, { exact: true })).toBeVisible();
  await expect(matches.locator('blockquote').first()).toContainText('Built interactive charts');
  await expect(matches.getByText(/field irrigation/)).toHaveCount(0);
  await matches.getByText('About local evidence search').click();
  await expect(matches.getByRole('link', { name: 'Reranker model card' })).toHaveAttribute('href', rerankingModel.card);
  await expect(page.locator('.report-warnings')).toHaveCount(0);
  expect(external).toEqual([]);
  await page.getByRole('button', { name: 'New scan' }).click();
  await page.locator('#use-ml').uncheck();
  await upload();
  await page.locator('#scan').click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible({ timeout: 45000 });
  expect(await page.locator('.report-banner .ring strong').textContent()).toBe(mlScore);
});

test('shows the supported and missing duties of a compound criterion with an exact resume excerpt', async ({ page }) => {
  test.skip(!existsSync(`${primaryAssets}/ready.json`) || !existsSync(`${rerankerAssets}/ready.json`), 'Run npm run models:download before testing actual model inference.');
  await page.route('https://huggingface.co/**', route => route.abort());
  await page.goto('/');
  await page.locator('#use-ml').check();
  await page.locator('#job-panel summary').click();
  const requirement = 'Process and approve refunds for enterprise accounts.';
  await page.locator('#job').fill(requirement);
  const quote = 'Processed enterprise customer refunds in the billing system after the finance controller granted approval.';
  const text = `Sam Rivera\nExperience\nBilling Analyst | Acme\nJan 2020 - Dec 2022\n• ${quote}\n• Approved refunds at the retail service desk for individual customers after checking receipts.\n• Reconciled enterprise subscription invoices against signed order forms at month end.`;
  await page.locator('#file').setInputFiles({ name: 'profile.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await page.locator('#scan').click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible({ timeout: 45000 });
  await page.getByRole('tab', { name: 'Job match' }).click();
  const review = page.locator('.model-matches');
  await expect(review.getByText('Partial evidence', { exact: true })).toBeVisible();
  const duties = review.locator('.model-parts > li');
  await expect(duties).toHaveCount(2);
  const citation = duties.nth(0).locator('.model-evidence').filter({ hasText: quote });
  await expect(citation.locator('blockquote')).toHaveText(quote);
  await expect(citation.getByText(/Experience · section line \d+/)).toBeVisible();
  await expect(duties.nth(1)).toContainText('Approve refunds for enterprise accounts.');
  await expect(duties.nth(1)).toContainText('No passage met the evidence checks.');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const report = await readFile(await (await pending).path(), 'utf8');
  expect(report).toContain(`Partial evidence · ${requirement}`);
  expect(report).toContain(quote);
});

test('failed model loads preserve the profile and explain ML availability', async ({ page }) => {
  await page.route('**/ml-runtime/**', route => route.abort());
  await page.route('https://huggingface.co/**', route => route.abort());
  await page.goto('/');
  await page.locator('#use-ml').check();
  await page.locator('#job-panel summary').click();
  await page.locator('#job').fill('Design dashboards to explain operations performance.');
  await page.locator('#file').setInputFiles({ name: 'profile.txt', mimeType: 'text/plain', buffer: Buffer.from('Sam Rivera\nExperience\nAnalyst | Acme\nBuilt dashboards for operations managers.\nSkills\nSQL, Tableau') });
  await page.locator('#scan').click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.report-warnings')).toContainText('Keyword matching is still available.');
  await page.getByRole('tab', { name: 'Parsed resume' }).click();
  await expect(page.locator('pre')).toContainText('Built dashboards');
});

test('uses BGE results when the local DeBERTa assets cannot load', async ({ page }) => {
  test.skip(!existsSync(`${primaryAssets}/ready.json`) || !existsSync(`${rerankerAssets}/ready.json`), 'Run npm run models:download before testing inference fallback.');
  await page.route(`**/models/${rerankingModel.folder}/config.json`, route => route.abort());
  await page.route('https://huggingface.co/**', route => route.abort());
  await page.goto('/');
  await page.locator('#use-ml').check();
  await page.locator('#job-panel summary').click();
  await page.locator('#job').fill('Build data dashboards for business operations.');
  const text = 'Sam Rivera\nExperience\nAnalyst | Acme\nBuilt data dashboards for business operations.\nSkills\nSQL, Tableau';
  await page.locator('#file').setInputFiles({ name: 'profile.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await page.locator('#scan').click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible({ timeout: 45000 });
  await page.getByRole('tab', { name: 'Job match' }).click();
  const matches = page.locator('.model-matches');
  await expect(matches.locator('blockquote').first()).toContainText('Built data dashboards');
  await matches.getByText('About local evidence search').click();
  await expect(matches.getByText(/reranker was unavailable/)).toBeVisible();
});

test('withholds shorter experience and skips the reranker when qualification checks leave no candidates', async ({ page }) => {
  test.skip(!existsSync(`${primaryAssets}/ready.json`), 'Run npm run models:download before testing real evidence selection.');
  const rerankerRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes(`/models/${rerankingModel.folder}/`)) rerankerRequests.push(request.url());
  });
  await page.route('https://huggingface.co/**', route => route.abort());
  await page.goto('/');
  await page.locator('#use-ml').check();
  await page.locator('#job-panel summary').click();
  await page.locator('#job').fill('5+ years of Python experience is required.');
  const text = 'Sam Rivera\nExperience\nEngineer | Acme\nBuilt Python integrations for 2 years and developed Java services for 8 years.';
  await page.locator('#file').setInputFiles({ name: 'profile.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await page.locator('#scan').click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible({ timeout: 45000 });
  await page.getByRole('tab', { name: 'Job match' }).click();
  const matches = page.locator('.model-matches');
  await expect(matches.getByText('No passage met the evidence checks.')).toBeVisible();
  await expect(matches.locator('blockquote')).toHaveCount(0);
  expect(rerankerRequests).toEqual([]);
});

test('requests only pinned model assets when hosted weights are unavailable', async ({ page }) => {
  test.skip(!existsSync(`${primaryAssets}/ready.json`), 'Run npm run models:download before testing model loading.');
  await page.route(`**/models/${embeddingModel.folder}/ready.json`, route => route.fulfill({ status: 404, body: '' }));
  const downloads: string[] = [];
  const base = `/${embeddingModel.id}/resolve/${embeddingModel.revision}/`;
  const metadata = new Set(['config.json', 'tokenizer.json', 'tokenizer_config.json']);
  await page.route('https://huggingface.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    downloads.push(path);
    const file = path.slice(base.length);
    if (!path.startsWith(base) || !metadata.has(file)) return route.abort();
    await route.fulfill({ path: `${primaryAssets}/${file}`, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto('/');
  await page.locator('#use-ml').check();
  await page.locator('#job-panel summary').click();
  await page.locator('#job').fill('Build data dashboards for business operations.');
  await page.locator('#file').setInputFiles({ name: 'profile.txt', mimeType: 'text/plain', buffer: Buffer.from('Sam Rivera\nExperience\nAnalyst | Acme\nBuilt data dashboards for business operations.\nSkills\nSQL, Tableau') });
  await page.locator('#scan').click();
  await expect(page.getByRole('heading', { name: 'Resume report' })).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.report-warnings')).toContainText('Keyword matching is still available.');
  expect(downloads).toContain(base + embeddingModel.weights);
  expect(downloads.every(path => path.startsWith(base))).toBe(true);
});
