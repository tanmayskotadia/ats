import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jobCriteriaLines, evidenceLevel, quoteEvidenceLevel } from '../src/job-match.js';
import { positiveTermMatch } from '../src/score.js';

const section = (key, ...lines) => ({ key, label: key, lines });
const evidence = (sections, label = 'Python', aliases = []) => evidenceLevel({ sections }, label, aliases, positiveTermMatch);

test('company and benefits mentions do not become job criteria and preferred scope resets', () => {
  const job = `About us
Our teams use Java and Salesforce to run our business.
Required skills: Python, SQL
Preferred qualifications
Docker
Responsibilities
Build data pipelines using SQL.
Benefits
Free Excel training and a generous pension plan.
Qualifications & Experience
Experience maintaining Linux services.
Tableau is preferred.
Python experience is required.`;
  assert.deepEqual(jobCriteriaLines(job), [
    { text: 'Required skills: Python, SQL', preferred: false },
    { text: 'Docker', preferred: true },
    { text: 'Build data pipelines using SQL.', preferred: false },
    { text: 'Experience maintaining Linux services.', preferred: false },
    { text: 'Tableau is preferred.', preferred: true },
    { text: 'Python experience is required.', preferred: false },
  ]);
});

test('required lists following inline preferred lists keep their own priority', () => {
  assert.deepEqual(jobCriteriaLines('Preferred skills: Go\nRequired skills: Java\nSQL\nNice to have:\nRust\nMinimum qualifications:\nPMP'), [
    { text: 'Preferred skills: Go', preferred: true },
    { text: 'Required skills: Java', preferred: false },
    { text: 'SQL', preferred: false },
    { text: 'Rust', preferred: true },
    { text: 'PMP', preferred: false },
  ]);
});

test('separate required and preferred sentences on one line retain their own priority', () => {
  assert.deepEqual(jobCriteriaLines('SQL is required. Docker is preferred.'), [
    { text: 'SQL is required.', preferred: false },
    { text: 'Docker is preferred.', preferred: true },
  ]);
});

test('relevant work context earns stronger supporting credit than a list or summary', () => {
  assert.deepEqual(evidence([section('skills', 'Python, SQL, Docker')]), { evidence: 'Python, SQL, Docker', kind: 'listed', credit: 0.5 });
  assert.equal(evidence([section('summary', 'Built Python services for delivery operations teams.')]).credit, 0.5);
  const statement = 'Built Python services that automated delivery reporting for regional operations teams.';
  const result = evidence([section('skills', 'Python'), section('experience', statement)]);
  assert.deepEqual(result, { evidence: statement, kind: 'demonstrated', credit: 1 });
  assert.equal(evidence([section('experience', 'Python, SQL, Docker, Java, JavaScript, Excel')]).kind, 'listed');
  assert.equal(evidence([section('experience', 'Python; Built Java services for delivery reporting teams.')]).kind, 'listed');
});

test('headers, interests, references, prospective claims and copied requirement wording earn no evidence credit', () => {
  for (const sections of [
    [section('contact', 'Python Developer')],
    [section('interests', 'Python and machine learning')],
    [{ key: 'experience', label: 'Job description', lines: ['Built Python services for delivery operations teams.'] }],
    [section('skills', 'Currently learning Python and SQL.')],
    [section('summary', 'Interested in Python for future projects.')],
    [section('experience', 'You will build Python services for business reporting.')],
    [section('experience', 'No experience with Python.')],
  ]) assert.equal(evidence(sections).kind, 'missing');
});

test('aliases and positive independent clauses preserve literal source evidence', () => {
  const source = 'No knowledge of Rust. Built PostgreSQL services for delivery reporting teams.';
  const result = evidence([section('projects', source)], 'Postgres', ['PostgreSQL']);
  assert.equal(result.evidence, source);
  assert.equal(result.credit, 1);
  assert.equal(evidence([section('education', 'Completed coursework using Python to analyze local weather records.')]).credit, 1);
});

test('learning domain terms remain valid while prospective statements are excluded', () => {
  assert.equal(evidence([section('skills', 'Machine learning, Python')]).credit, 0.5);
  assert.equal(evidence([section('projects', 'Trained a deep learning model using Python for sales forecasting.')]).credit, 1);
  assert.equal(evidence([section('experience', 'Led learning and development programs using Python for staff analytics.')]).credit, 1);
  assert.equal(evidence([section('skills', 'Learning and development, Python')]).credit, 0.5);
  assert.equal(evidence([section('skills', 'Currently learning Python')]).credit, 0);
  assert.equal(evidence([section('summary', 'I plan to use Python in future work.')]).credit, 0);
});

test('grounded quote grading handles dotted degrees and multiple source lines without matching an alias', () => {
  const degree = 'B.S. in Computer Science.';
  const coursework = 'Built reporting services using Python.\nAutomated weekly operations reports for regional managers.';
  const resume = { sections: [section('education', degree), section('experience', ...coursework.split('\n'))] };
  assert.deepEqual(quoteEvidenceLevel(resume, degree), { evidence: degree, kind: 'demonstrated', credit: 1 });
  assert.equal(quoteEvidenceLevel(resume, coursework).credit, 1);
  assert.equal(quoteEvidenceLevel(resume, 'Built reporting services using Python. Automated weekly operations reports for regional managers.').credit, 1);
  assert.equal(quoteEvidenceLevel(resume, 'Invented source text.').credit, 0);
});

test('quote grades use only quoted context and reject prospective or requirement claims', () => {
  const resume = { sections: [
    section('experience', 'Python; Built Java services for delivery reporting teams.'),
    section('summary', 'Built Python services for delivery reporting teams.'),
    section('skills', 'Currently learning Python.'),
    section('experience', 'You will build Python services for business reporting.'),
    section('interests', 'Python for weather modeling'),
  ] };
  assert.equal(quoteEvidenceLevel(resume, 'Python').credit, 0.5);
  assert.equal(quoteEvidenceLevel(resume, 'Built Python services for delivery reporting teams.').kind, 'summary');
  assert.equal(quoteEvidenceLevel(resume, 'Currently learning Python.').credit, 0);
  assert.equal(quoteEvidenceLevel(resume, 'You will build Python services for business reporting.').credit, 0);
  assert.equal(quoteEvidenceLevel(resume, 'Python for weather modeling').credit, 0);
});
