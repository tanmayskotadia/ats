import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseResume } from '../src/resume.ts';
import { resumeFeedback } from '../src/feedback.ts';

test('repeated source bullets are detected despite statement deduplication', () => {
  const resume = parseResume('Experience\nAnalyst | Acme\nJan 2021 - Dec 2022\n• Built dashboards for operations managers across regional teams.\n• BUILT dashboards for operations managers across regional teams.');
  assert.equal(resume.statements.length, 1);
  const findings = resumeFeedback(resume);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /appears 2 times/);
  assert.equal(findings[0].priority, 'high');
  assert.ok(resume.text.includes(findings[0].evidence));
  assert.ok(!('points' in findings[0]));
});

test('weak and short statements get specific feedback anchored to the source', () => {
  const resume = parseResume('Experience\nAnalyst | Acme\nJan 2021 - Dec 2022\n• Responsible for preparing reports.\n• Built dashboards.');
  const findings = resumeFeedback(resume);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].title, 'Make your contribution specific');
  assert.equal(findings[1].title, 'Explain what this work involved');
  assert.ok(findings.every(item => resume.text.includes(item.evidence)));
  assert.ok(findings.every(item => !/\d/.test(item.detail)));
});

test('dated roles and substantive action bullets produce no filler feedback', () => {
  const resume = parseResume('Experience\nAnalyst | Acme\nJan 2021 - Dec 2022\n• Built dashboards for operations managers to track delivery performance.');
  assert.deepEqual(resumeFeedback(resume), []);
  assert.deepEqual(resumeFeedback(parseResume('Nothing to parse.')), []);
});

test('long statements and missing role dates cite exact excerpts', () => {
  const longStatement = 'Developed operational reports for regional delivery teams by combining customer requests with warehouse records and carefully documenting the source of each field while coordinating review with team leaders and updating the report definitions after each review to improve consistency across departments.';
  const resume = parseResume('Experience\nOperations Analyst | Acme\n• ' + longStatement);
  const findings = resumeFeedback(resume);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].title, 'Clarify this role’s dates');
  assert.equal(findings[0].evidence, 'Operations Analyst | Acme');
  assert.equal(findings[1].evidence, '• ' + longStatement);
});

test('feedback stays bounded and ignores bullets outside experience sections', () => {
  const weakBullets = Array.from({ length: 15 }, (_, index) => '• Helped with department report ' + String.fromCharCode(65 + index)).join('\n');
  const resume = parseResume('Experience\nAnalyst | Acme\nJan 2021 - Dec 2022\n' + weakBullets + '\nEducation\n• Responsible for studying every day.');
  const findings = resumeFeedback(resume);
  assert.equal(findings.length, 8);
  assert.ok(findings.every(item => item.section === 'experience'));
  assert.equal(new Set(findings.map(item => item.evidence)).size, findings.length);
});
