import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retrieveCandidates } from '../src/ml-match.ts';
import { assembleEvidenceFindings, planEvidenceReview } from '../src/ml-review.ts';
import { retrievalLimits } from '../src/ml-config.ts';

test('reviews separate duties once and keeps the report attached to the original requirement', () => {
  const requirement = 'Design delivery dashboards and present monthly forecasts.';
  const plan = planEvidenceReview([{ text: requirement }, { text: 'Design delivery dashboards.' }]);
  assert.deepEqual(plan.checks.map(({ text, candidateLimit }) => [text, candidateLimit]), [
    ['Design delivery dashboards.', retrievalLimits.candidates],
    ['Present monthly forecasts.', retrievalLimits.candidatesPerPart],
  ]);
  const quote = { text: 'Built interactive charts for dispatch.', section: 'experience' as const, similarity: 0.9 };
  const checks = plan.checks.map((check, index) => ({ requirement: check.text, evidence: index ? [] : [quote] }));
  const [partial, standalone] = assembleEvidenceFindings(plan, checks, true);
  assert.equal(partial.requirement, requirement);
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.parts, checks);
  assert.deepEqual(partial.evidence, [quote]);
  assert.equal(standalone.status, 'supported');
  assert.equal(standalone.parts, undefined);
  assert.equal(assembleEvidenceFindings(plan, checks, false)[0].status, 'related');
  assert.equal(assembleEvidenceFindings(plan, checks.map(check => ({ ...check, evidence: [] })), true)[0].status, 'absent');
});

test('rejects delegated work before the nearest candidate can take the only slot', () => {
  const plan = planEvidenceReview([{ text: 'Approve enterprise refunds.' }]);
  const evidence = [
    { text: 'Prepared refund paperwork for formal sign-off.', section: 'experience' as const },
    { text: 'Authorized account credits for enterprise customers.', section: 'experience' as const },
  ];
  const requirements = plan.checks.map(check => ({ ...check, candidateLimit: 1 }));
  const [candidate] = retrieveCandidates({ requirements, evidence }, [[1, 0], [1, 0], [0.8, 0.2]]);
  assert.deepEqual(candidate.evidence.map(item => item.text), ['Authorized account credits for enterprise customers.']);
});

test('accepts an independently supported alternative without requiring both options', () => {
  const query = 'Create staffing forecasts or lead shift allocation for overnight operations.';
  const plan = planEvidenceReview([{ text: query }]);
  assert.equal(plan.checks.length, 2);
  const quote = { text: 'Led the nightly crew assignments for distribution.', section: 'experience' as const, similarity: 0.9 };
  const checks = plan.checks.map((check, index) => ({ requirement: check.text, evidence: index ? [quote] : [] }));
  const [finding] = assembleEvidenceFindings(plan, checks, true);
  assert.equal(finding.status, 'supported');
  assert.equal(finding.alternatives, true);
  assert.equal(finding.requirement, query);
  assert.deepEqual(finding.parts, checks);
});
