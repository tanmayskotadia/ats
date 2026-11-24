import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeText, reviseScan } from '../src/scan.ts';

const original = 'Alex Rivera\nalex@example.com\nExperience\nAnalyst | Acme\nJan 2020 - Dec 2022\n• Helped with monthly business reports.\nSkills\nSQL, Tableau';
const settings = { job: 'Required skills: Python, SQL', useML: false, useAI: false };

test('reanalysis updates evidence and score while preserving original extraction and prior scan', async () => {
  const scan = await analyzeText(original, { fileName: 'resume.txt' }, settings);
  const edited = original.replace('SQL, Tableau', 'SQL, Tableau, Python');
  const next = await reviseScan(scan, edited, settings);
  assert.equal(next.originalText, original);
  assert.equal(next.resume.metadata.textEdited, true);
  assert.equal(next.revision, 1);
  assert.ok(next.previous);
  assert.equal(next.previous.score, scan.result.score);
  assert.equal(next.previous.jobChanged, false);
  assert.ok(next.result.score > scan.result.score);
  assert.ok(next.result.keywords.matched.some(item => item.label === 'Python'));
  assert.ok(!scan.result.keywords.matched.some(item => item.label === 'Python'));
  assert.equal(scan.resume.extractedText, original);
  const restored = await reviseScan(next, next.originalText, { ...settings, job: '' });
  assert.equal(restored.revision, 2);
  assert.equal(restored.resume.metadata.textEdited, false);
  assert.equal(restored.originalText, original);
  assert.ok(restored.previous);
  assert.equal(restored.previous.jobChanged, true);
  assert.equal(restored.result.keywords.provided, false);
});

test('invalid edits reject without mutating a completed report', async () => {
  const scan = await analyzeText(original, { fileName: 'resume.txt', ocrPages: 1 }, settings);
  await assert.rejects(reviseScan(scan, 'bad', settings), /readable resume text/);
  await assert.rejects(reviseScan(scan, original, { ...settings, job: 'x'.repeat(30001) }), /30,000/);
  assert.equal(scan.revision, 0);
  assert.equal(scan.resume.metadata.ocrPages, 1);
  assert.equal(scan.originalText, original);
});
