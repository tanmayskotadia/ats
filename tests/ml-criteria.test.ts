import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requirementParts } from '../src/ml-criteria.ts';

test('copies a shared object and its modifiers onto each independently verifiable verb', () => {
  assert.deepEqual(requirementParts('Design and run randomized A/B experiments for customer onboarding'), [
    'Design randomized A/B experiments for customer onboarding',
    'Run randomized A/B experiments for customer onboarding',
  ]);
  assert.deepEqual(requirementParts('You will calculate and submit payroll for employees in multiple regions.'), [
    'You will calculate payroll for employees in multiple regions.',
    'You will submit payroll for employees in multiple regions.',
  ]);
  assert.deepEqual(requirementParts('Approve and sign off on structural calculations.'), [
    'Approve structural calculations.',
    'Sign off on structural calculations.',
  ]);
});

test('keeps the original object and scope with each of the two complete duties', () => {
  assert.deepEqual(requirementParts('Draft collective bargaining agreements and lead negotiations with unions'), [
    'Draft collective bargaining agreements',
    'Lead negotiations with unions',
  ]);
  assert.deepEqual(requirementParts('Prepare import customs declarations and coordinate clearance with customs brokers.'), [
    'Prepare import customs declarations.',
    'Coordinate clearance with customs brokers.',
  ]);
  assert.deepEqual(requirementParts('administer Salesforce user permissions and configure production access controls'), [
    'administer Salesforce user permissions',
    'configure production access controls',
  ]);
});

test('keeps alternatives, noun phrases, qualification lists and ambiguous verb scopes intact', () => {
  for (const query of [
    'Design or run randomized service tests.',
    'Design and run tests using SQL or Python.',
    'Required skills: SQL and Tableau',
    'Experience drafting and reviewing contracts.',
    'Review both account balances and payment histories.',
    'Write test plans and test results.',
    'Build tools to validate input and update records.',
    'Draft a plan and carry out',
    'Design and run experiments and write reports.',
    'Design and run.',
  ]) assert.deepEqual(requirementParts(query), [query], query);
});

test('preserves dependent references and potentially shared conditions verbatim', () => {
  for (const query of [
    '  Draft reports and send them to the board.  ',
    'Reconcile accounts and submit reports when auditors request them.',
    'Lead production incident response and run root-cause reviews after service outages.',
    'Design and run tests without collecting personal information.',
    'Review and coordinate with vendors.',
    'Approve and approve product plans.',
  ]) assert.deepEqual(requirementParts(query), [query], query);
});

test('carries a common domain or training topic into the individual checks', () => {
  assert.deepEqual(requirementParts('Write test plans and lead pre-release validation for medical device software.'), [
    'Write test plans for medical device software.', 'Lead pre-release validation for medical device software.',
  ]);
  assert.deepEqual(requirementParts('Design safety training materials and deliver sessions to new warehouse associates.'), [
    'Design safety training materials for new warehouse associates.', 'Deliver safety training sessions to new warehouse associates.',
  ]);
});
