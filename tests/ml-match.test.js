import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseResume } from '../src/resume.js';
import { cosine, prepareMatches, rankMatches } from '../src/ml-match.js';
import { retrievalLimits } from '../src/ml-config.js';

test('ML input excludes contact and denied experience and preserves source excerpts', () => {
  const resume = parseResume('Alex Rivera\nalex@example.com\nExperience\nAnalyst | Acme\nBuilt monthly dashboards for operations teams.\nNo experience with patient care.\nSkills\nSQL, Tableau\nInterests\nI enjoy reviewing medical terminology.');
  const input = prepareMatches(resume, 'Create visual dashboards to explain delivery trends.');
  assert.equal(input.requirements.length, 1);
  assert.ok(input.evidence.some(item => item.text.includes('dashboards')));
  assert.ok(input.evidence.every(item => resume.text.includes(item.text)));
  assert.ok(input.evidence.every(item => !/alex@|patient care|medical terminology/.test(item.text)));
});

test('retrieval bounds input size and exposes how much source text was compared', () => {
  const resume = { sections: [{ key: 'experience', lines: Array.from({ length: 200 }, (_, index) => 'Built and maintained operations dashboard number ' + index) }] };
  const job = Array.from({ length: 50 }, (_, index) => 'Maintain service dashboard for department ' + index).join('\n');
  const input = prepareMatches(resume, job);
  assert.equal(input.evidence.length, retrievalLimits.resumeChunks);
  assert.equal(input.requirements.length, retrievalLimits.jobChunks);
  assert.equal(input.totalEvidence, 200);
  assert.equal(input.totalRequirements, 50);
});

test('ranks semantic evidence by cosine distance and discards weak or invalid vectors', () => {
  const input = { requirements: [{ text: 'Maintain dashboards' }], evidence: [{ text: 'Relevant', section: 'experience' }, { text: 'Unrelated', section: 'experience' }] };
  const matches = rankMatches(input, [[1, 0], [0.9, 0.1], [0, 1]]);
  assert.equal(matches[0].evidence.length, 1);
  assert.equal(matches[0].evidence[0].text, 'Relevant');
  assert.ok(matches[0].evidence[0].similarity > 0.99);
  assert.equal(cosine([0, 0], [1, 0]), 0);
  assert.throws(() => rankMatches(input, [[1, 0]]), /Incomplete/);
  assert.throws(() => cosine([1], [1, 0]), /dimensions/);
  assert.throws(() => cosine([NaN], [1]), /Invalid/);
});
