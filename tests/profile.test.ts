import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseResume } from '../src/resume.ts';
import { summarizeExperience } from '../src/profile.ts';

const employment = `JANE DOE | Software Engineer
jane@example.com | +91 98765 43210
Experience
SENIOR SOFTWARE ENGINEER | NORTHWIND SYSTEMS
Jan 2020 - Dec 2022
• Built services that processed 2000 requests per second.
SOFTWARE ENGINEER | RIVER LABS
Jun 2022 - Dec 2023
• Reduced batch processing time by 30%.
Education
B.Tech in Computer Science | Example Institute | 2019
Skills
Languages: JavaScript, Python, SQL
Projects
Service Monitor
• Developed monitoring tooling for 4 production services.`;

test('reads uppercase role and employer headers without losing their experience section', () => {
  const resume = parseResume(employment);
  assert.equal(resume.contact.name, 'JANE DOE');
  assert.equal(resume.contact.title, 'Software Engineer');
  const roles = resume.profile.entries.filter(entry => entry.kind === 'experience');
  assert.equal(roles.length, 2);
  assert.equal(roles[0].title, 'SENIOR SOFTWARE ENGINEER');
  assert.equal(roles[0].organization, 'NORTHWIND SYSTEMS');
  assert.equal(roles[1].organization, 'RIVER LABS');
  for (const entry of resume.profile.entries) {
    assert.ok(entry.evidence.every(line => resume.text.includes(line)));
    assert.ok(entry.evidence.some(line => line.includes(entry.title)));
  }
  assert.deepEqual(resume.profile.skills.map(item => item.label), ['JavaScript', 'Python', 'SQL']);
  assert.ok(resume.profile.skills.every(item => item.evidence.includes(item.label)));
  assert.equal(resume.profile.entries.find(entry => entry.kind === 'project')?.title, 'Service Monitor');
});

test('merges overlapping work periods and excludes uncertain or invalid dates', () => {
  const entry = (dates: string) => ({ kind: 'experience' as const, dates });
  const result = summarizeExperience([
    entry('Jan 2020 - Dec 2022'), entry('Jun 2022 - Dec 2023'), entry('2024 - 2025'),
    entry(''), entry('Jan 2027 - Present'), entry('Feb 2020 - Jan 2019'),
    { kind: 'education', dates: 'Jan 2010 - Dec 2015' },
  ], new Date(2026, 10, 23));
  assert.equal(result.months, 48);
  assert.equal(result.datedRoles, 2);
  assert.equal(result.uncertainDates, 1);
  assert.equal(result.undatedRoles, 1);
  assert.equal(result.invalidDates, 2);
  assert.match(result.notes.join(' '), /year-only/);
});

test('handles numeric dates and ISO month dates without inventing missing fields', () => {
  const resume = parseResume('Name: Asha Patel\nExperience\nData Engineer\n05/2023 - 2024-08\n• Built a daily reporting pipeline.\nEducation\nDiploma in Analytics\nSkills: SQL, Python');
  assert.equal(resume.contact.name, 'Asha Patel');
  const role = resume.profile.entries.find(entry => entry.kind === 'experience');
  assert.ok(role);
  assert.equal(role.organization, '');
  assert.equal(role.dates, '05/2023 - 2024-08');
  assert.equal(resume.profile.experience.months, 16);
  assert.equal(resume.profile.entries.find(entry => entry.kind === 'education')?.organization, '');
});

test('identical accomplishment statements do not create additional impact evidence', () => {
  const resume = parseResume('Experience\nAnalyst | Acme\n2020 - 2022\n• Built 10 reports\n• Built 10 reports\n• BUILT 10 REPORTS');
  assert.deepEqual(resume.statements, ['Built 10 reports']);
  assert.equal(resume.quantifiedStatements.length, 1);
});

test('keeps multi-line education and certification headers together with their completion dates', () => {
  const resume = parseResume(`Education
Example University
B.Tech in Computer Science
2019
M.Sc in Data Science
River College
May 2022
Certifications
Cloud Practitioner
Example Cloud Training
Issued Jan 2024
Security Foundations
2025
Skills
SQL, Tableau; No experience with Python`);
  const education = resume.profile.entries.filter(entry => entry.kind === 'education');
  assert.equal(education.length, 2);
  assert.deepEqual(education.map(entry => [entry.title, entry.organization, entry.dates]), [
    ['B.Tech in Computer Science', 'Example University', '2019'],
    ['M.Sc in Data Science', 'River College', 'May 2022'],
  ]);
  const credentials = resume.profile.entries.filter(entry => entry.kind === 'credential');
  assert.deepEqual(credentials.map(entry => [entry.title, entry.organization, entry.dates]), [
    ['Cloud Practitioner', 'Example Cloud Training', 'Jan 2024'],
    ['Security Foundations', '', '2025'],
  ]);
  assert.deepEqual(resume.profile.skills.map(item => item.label), ['SQL', 'Tableau']);
  assert.ok(resume.profile.entries.every(entry => entry.evidence.every(line => resume.text.includes(line))));
});
