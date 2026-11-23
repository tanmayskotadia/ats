import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseResume } from '../src/resume.js';
import { compareKeywords, positiveTermMatch, scoreResume, skillEvidence } from '../src/score.js';

const impact = result => result.categories.find(category => category.id === 'impact').points;

test('explicitly denied skills do not count as keyword evidence', () => {
  const resume = parseResume('Skills\nNo experience with Python or SQL.\nJava: no experience\nNot proficient in Docker\nNever used Tableau');
  const match = compareKeywords(resume, 'Required skills: Python, SQL, Java, Docker, Tableau');
  assert.equal(match.matched.length, 0);
  assert.equal(match.missing.length, 5);
  assert.equal(positiveTermMatch('Not only Python but also SQL', 'Python'), true);
  assert.equal(positiveTermMatch('No experience with Java, but built Python services.', 'Python'), true);
  assert.equal(positiveTermMatch('No knowledge of Python. Built a service with Python.', 'Python'), true);
});

test('skills in role descriptions have evidence even without a Skills heading', () => {
  const resume = parseResume('Experience\nAnalyst | Acme\nBuilt dashboards in Tableau and queried PostgreSQL for delivery reporting.\nNo experience with Python, Java.');
  const skills = skillEvidence(resume);
  assert.ok(skills.some(item => item.label === 'PostgreSQL' && item.evidence.includes('queried PostgreSQL')));
  assert.ok(skills.some(item => item.label === 'Tableau'));
  assert.ok(!skills.some(item => item.label === 'Python' || item.label === 'Java'));
  const denied = parseResume('Skills\nNo experience with Python, Java.');
  assert.equal(denied.profile.skills.length, 0);
});

test('an explicit exemption in a job posting is excluded from keyword coverage', () => {
  const match = compareKeywords(parseResume('Skills\nPython'), 'Java experience not required.\nRequired skills: Python');
  assert.equal(match.total, 1);
  assert.equal(match.matched[0].label, 'Python');
});

test('repeating an accomplishment cannot add impact points', () => {
  const line = 'Built Tableau dashboards for 12 operations managers across regional teams.';
  const one = scoreResume(parseResume('Experience\n• ' + line));
  const repeated = scoreResume(parseResume('Experience\n' + Array(8).fill('• ' + line).join('\n')));
  assert.equal(impact(one), impact(repeated));
  assert.ok(impact(repeated) < 30);
  assert.equal(impact(scoreResume(parseResume('Experience\n• Python\n• Built\n• SQL\n• Built 10 reports'))), 0);
});

test('missing, invented, negated and underqualified model excerpts earn no requirement credit', () => {
  const resume = parseResume('Skills\nNo experience with SQL.\nUsed Python for 2 years.\nPreparing for PMP.\nAWS experience.\nAWS Certified Developer.');
  const requirements = [
    { label: 'SQL', evidence: 'No experience with SQL.' },
    { label: '5 years Python', evidence: 'Used Python for 2 years.' },
    { label: 'PMP', evidence: 'Preparing for PMP.' },
    { label: 'AWS certification', evidence: 'AWS experience.' },
    { label: 'AWS Certified Solutions Architect', evidence: 'AWS Certified Developer.' },
    { label: 'Tableau', evidence: 'Built Tableau dashboards.' },
  ];
  const report = scoreResume(resume, requirements.map(item => item.label).join('\n'), requirements);
  assert.equal(report.keywords.matched.length, 0);
  assert.equal(report.categories.find(category => category.id === 'keywords').points, 0);
});

test('explicit durations, credential aliases, and semantic evidence can support separate requirements', () => {
  const resume = parseResume('Experience\nUsed Python for 6 years.\nBuilt Tableau dashboards.\nEducation\nBSc in Computer Science.\nCredentials\nPMP certified.');
  const requirements = [
    { label: '5 years Python', evidence: 'Used Python for 6 years.' },
    { label: 'Bachelor degree', evidence: 'BSc in Computer Science.' },
    { label: 'PMP', evidence: 'PMP certified.' },
    { label: 'data visualization', evidence: 'Built Tableau dashboards.' },
  ];
  const report = scoreResume(resume, requirements.map(item => item.label).join('\n'), requirements);
  assert.equal(report.keywords.matched.length, 4);
  assert.equal(scoreResume(parseResume('Hi')).score, 0);
});

test('duration evidence for one named technology cannot qualify a different one', () => {
  const resume = parseResume('Experience\nUsed Python for 6 years.\nUsed PostgreSQL for 6 years.\nBuilt Tableau dashboards.');
  const requirements = [
    { label: '5 years SQL', evidence: 'Used Python for 6 years.' },
    { label: '5 years Postgres', evidence: 'Used PostgreSQL for 6 years.' },
    { label: 'data visualization', evidence: 'Built Tableau dashboards.' },
  ];
  const result = scoreResume(resume, requirements.map(item => item.label).join('\n'), requirements);
  assert.deepEqual(result.keywords.matched.map(item => item.label), ['5 years Postgres', 'data visualization']);
  assert.equal(result.keywords.missing[0].label, '5 years SQL');
});

test('CFA requirements distinguish passed levels and prospective credentials', () => {
  const job = 'CFA Level III';
  for (const evidence of ['Passed CFA Level I.', 'CFA Level III candidate.']) {
    const result = scoreResume(parseResume('Credentials\n' + evidence), job, [{ label: job, evidence }]);
    assert.equal(result.keywords.matched.length, 0);
  }
  const evidence = 'Passed CFA Level III.';
  const result = scoreResume(parseResume('Credentials\n' + evidence), job, [{ label: job, evidence }]);
  assert.equal(result.keywords.matched.length, 1);
});
