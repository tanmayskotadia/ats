import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseResume } from '../src/resume.ts';
import type { ResumeMetadata } from '../src/resume.ts';
import { scoreResume } from '../src/score.ts';
import type { ScoreResult } from '../src/score.ts';

function check(report: ScoreResult, id: string) {
  const check = report.categories.flatMap(category => category.checks).find(item => item.id === id);
  assert.ok(check, 'Expected the score check to exist');
  return check;
}

const role = (dates: string, body = '• Built reporting services using Python for regional operations teams.') =>
  `Experience\nData Engineer | Acme\n${dates}\n${body}`;
const scored = (text: string, job = '', metadata?: ResumeMetadata) => scoreResume(parseResume(text, metadata), job);

test('role date credit requires valid ranges and considers every detected role', () => {
  const valid = scored(role('Jan 2020 - Dec 2023'));
  for (const date of ['Dec 2025 - Jan 2020', 'Jan 2030 - Dec 2035', '']) {
    assert.ok(check(scored(role(date)), 'experience').points < check(valid, 'experience').points);
  }
  const incomplete = scored(role('Jan 2020 - Dec 2023') + '\nAnalyst | Second Company\n• Built Tableau dashboards for delivery performance reviews.');
  assert.ok(check(incomplete, 'experience').points < 9);
  assert.equal(check(scored(role('2020 - 2023')), 'experience').points, 9);
});

test('bare section labels and vague words earn no qualification or skill detail points', () => {
  const report = scored('Experience\nAnalyst\nEducation\nUniversity\nSkills\nExcellent');
  assert.equal(check(report, 'education').points, 0);
  assert.equal(check(report, 'skills').points, 0);
  assert.equal(check(report, 'skill-detail').points, 0);
  assert.ok(report.score < 25);
});

test('skills listed under Skills receive structure credit even when their strongest citation is in a role', () => {
  const report = scored(role('Jan 2020 - Dec 2023', '• Built reporting services using Python and SQL for operations teams.') + '\nSkills\nPython, SQL');
  assert.equal(check(report, 'skills').points, 4);
});

test('task counts have limited outcome credit, numeric duplicates count once, and qualitative outcomes count', () => {
  const repeated = scored('Experience\n' + [10, 20, 30, 40].map(number => `• Built ${number} reports for monthly delivery operations reviews.`).join('\n'));
  assert.ok(check(repeated, 'metrics').points <= 2);
  assert.ok(check(repeated, 'accomplishments').points < 10);
  const qualitative = scored('Experience\n• Simplified the review workflow so that managers could resolve delivery exceptions.\n• Standardized the handoff process across teams to prevent missing inventory records.\n• Resolved recurring access failures that prevented support teams from serving customers.');
  assert.ok(check(qualitative, 'metrics').points > check(repeated, 'metrics').points);
  const measured = scored('Experience\n• Reduced latency by 30% using an optimized request cache.\n• Automated weekly reporting, saving 6 hours each week.');
  assert.equal(check(measured, 'metrics').points, 12);
  const dates = scored('Experience\n• Improved annual reporting practices from 2020 to 2023 across regional teams.');
  assert.ok(check(dates, 'metrics').points < 6);
  const plain = scored('Experience\nSimplified the review workflow so that managers could resolve delivery exceptions.');
  assert.ok(check(plain, 'metrics').points > 0);
});

test('repeating extracted work text cannot earn additional readability points', () => {
  const text = role('Jan 2020 - Dec 2023');
  const repeated = text + '\n' + Array(10).fill('• Built reporting services using Python for regional operations teams.').join('\n');
  assert.equal(check(scored(repeated), 'text').points, check(scored(text), 'text').points);
});

test('work descriptions provide context without a mandatory summary and irrelevant padding adds no detail credit', () => {
  const text = role('Jan 2020 - Dec 2023', '• Built Python reporting services for regional operations teams.\n• Designed Tableau dashboards for weekly performance reviews.');
  const report = scored(text);
  assert.equal(check(report, 'profile').points, 5);
  const padded = scored(text + '\nInterests\n' + 'Reading hiking travel games cooking gardening music. '.repeat(30));
  assert.equal(check(padded, 'detail').points, check(report, 'detail').points);
  const projects = scored('Projects\nDelivery Monitor\n• Built a dashboard to investigate delayed orders by region.\nEducation\nB.Sc in Analytics | Acme College\nSkills\nPython, SQL');
  assert.equal(check(projects, 'experience').points, 9);
});

test('clear OCR and layout uncertainty trigger review notes while actual low-quality extraction reduces credit', () => {
  const text = role('Jan 2020 - Dec 2023') + '\nEducation\nB.Sc in Analytics | Acme College\nSkills\nPython, SQL';
  const plain = scored(text);
  const ocr = scored(text, '', { ocrPages: 1 });
  const layout = scored(text, '', { layoutWarning: 'Possible multi-column layout detected' });
  assert.equal(ocr.score, plain.score);
  assert.equal(layout.score, plain.score);
  assert.ok(ocr.notes.length);
  const poor = scored(text, '', { ocrPages: 1, warnings: ['Low OCR confidence on page 1'] });
  assert.ok(poor.score < ocr.score);
});

test('job scoring distinguishes listed skills from actual context and ignores benefits and prospective claims', () => {
  const job = 'Required skills: Python, SQL\nBenefits\nFree Tableau training and a generous pension.';
  const listed = scored('Skills\nPython, SQL, Tableau', job);
  const contextual = scored(role('Jan 2020 - Dec 2023', '• Built Python services and SQL queries for daily operations reporting.'), job);
  assert.equal(listed.keywords.total, 2);
  assert.equal(listed.keywords.ratio, 1);
  assert.equal(contextual.keywords.ratio, 1);
  assert.equal(check(listed, 'job-evidence').points, 5);
  assert.equal(check(contextual, 'job-evidence').points, 10);
  const planned = scored('Skills\nPlanning to learn Python and SQL.', job);
  assert.equal(planned.keywords.matched.length, 0);
  assert.equal(check(planned, 'skills').points, 0);
});

test('local matching checks named skill duration and cannot use tenure when a shorter explicit duration is stated', () => {
  const job = 'Required: 5 years Python experience';
  assert.equal(scored(role('Jan 2020 - Dec 2025', '• Used Python for 2 years to build reporting pipelines.'), job).keywords.matched.length, 0);
  assert.equal(scored(role('Jan 2020 - Dec 2025'), job).keywords.matched.length, 1);
  assert.equal(scored('Skills\nUsed Python for 2 years.', job).keywords.matched.length, 0);
  const unrelated = parseResume('Experience\nUsed Python for 6 years to build forecasting services.');
  const tableau = scoreResume(unrelated, '5 years Tableau', [{ label: '5 years Tableau', evidence: 'Used Python for 6 years to build forecasting services.' }]);
  assert.equal(tableau.keywords.matched.length, 0);
  const mixed = parseResume('Experience\nUsed SQL for 2 years and Python for 6 years to maintain business reports.');
  assert.equal(scoreResume(mixed, 'Required: 5 years SQL').keywords.matched.length, 0);
  assert.equal(scoreResume(mixed, '5 years SQL', [{ label: '5 years SQL', evidence: mixed.sections[0].lines[0] }]).keywords.matched.length, 0);
});

test('an incomplete AI result cannot remove uncovered local criteria from the scoring denominator', () => {
  const resume = parseResume('Experience\nBuilt Python services for daily delivery operations reporting.');
  const job = 'Required skills: Python, SQL, Docker';
  const report = scoreResume(resume, job, [{ label: 'Python', jobEvidence: job, evidence: 'Built Python services for daily delivery operations reporting.' }]);
  assert.equal(report.keywords.total, 3);
  assert.equal(report.keywords.matched.length, 1);
  const category = report.categories.find(category => category.id === 'keywords');
  assert.ok(category && category.points < 25);
  assert.equal(report.categories.reduce((total, category) => total + category.max, 0), 100);
  assert.equal(report.score, report.categories.reduce((total, category) => total + category.points, 0));
  assert.equal(report.rubricVersion, '2.0');
});
