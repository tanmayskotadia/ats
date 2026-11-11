import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseResume } from '../src/resume.js';
import { compareKeywords, scoreResume } from '../src/score.js';
import { sampleText, sampleJob } from './fixtures/resume.js';

test('extracts contact details, sections, skills, dates, and measurable statements', () => {
  const resume = parseResume(sampleText);
  assert.equal(resume.contact.name, 'Avery Morgan');
  assert.equal(resume.contact.email[0], 'avery.morgan@example.com');
  assert.equal(resume.contact.phone[0], '+1 (415) 555-0142');
  assert.equal(resume.contact.location, 'Oakland, CA');
  assert.deepEqual(resume.skills, ['SQL', 'Python', 'Tableau', 'Excel']);
  assert.equal(resume.dates.length, 2);
  assert.equal(resume.quantifiedStatements.length, 2);
  assert.equal(resume.sections.some(section => section.key === 'projects'), true);
});

test('matches aliases and explicit skills while respecting word boundaries and preferred weights', () => {
  const resume = parseResume('Skills: PostgreSQL, React, C++\nExperience\nDeveloped dashboards.');
  const comparison = compareKeywords(resume, 'Required skills: SQL, Postgres, React.js, C++, C, Cerner\nPreferred skills: Power BI');
  assert.deepEqual(comparison.matched.map(term => term.label).sort(), ['C++', 'PostgreSQL', 'React']);
  assert.deepEqual(comparison.missing.map(term => term.label).sort(), ['C', 'Cerner', 'Power BI', 'SQL']);
  assert.equal(comparison.ratio, 6 / 13);
  assert.equal(comparison.missing.at(-1).preferred, true);
});

test('score equals the sum of category checks and the rubric always totals 100', () => {
  for (const resume of [parseResume('Hi'), parseResume(sampleText), parseResume(sampleText, { ocrPages: 2 })]) {
    for (const job of ['', sampleJob, 'Please contact us for details.']) {
      const result = scoreResume(resume, job);
      assert.equal(result.categories.reduce((sum, category) => sum + category.max, 0), 100);
      assert.equal(result.score, result.categories.reduce((sum, category) => sum + category.points, 0));
      assert.ok(Number.isInteger(result.score) && result.score >= 0 && result.score <= 100);
      const gaps = result.improvements.map(check => check.max - check.points);
      assert.deepEqual(gaps, [...gaps].sort((first, second) => second - first));
    }
  }
});

test('compares custom terms in multiline job skill lists', () => {
  const resume = parseResume('Skills: Cerner');
  const result = compareKeywords(resume, 'Required skills:\n- Cerner\n- Epic Systems\nPreferred skills:\n- MEDITECH');
  assert.deepEqual(result.matched.map(term => term.label), ['Cerner']);
  assert.deepEqual(result.missing.map(term => term.label), ['Epic Systems', 'MEDITECH']);
  assert.equal(result.ratio, 2 / 5);
});
