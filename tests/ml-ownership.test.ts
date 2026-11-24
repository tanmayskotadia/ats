import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileWorkOwnershipCheck } from '../src/ml-ownership.ts';

test('gates requirements that ask the applicant to perform work', () => {
  assert.equal(compileWorkOwnershipCheck('Preference for an active safety credential.'), undefined);
  assert.equal(compileWorkOwnershipCheck('Support project engineers who lead design reviews.'), undefined);
  assert.equal(compileWorkOwnershipCheck('Lead or assist with weekly workshops.'), undefined);
  assert.ok(compileWorkOwnershipCheck('Responsibilities: You will conduct quarterly equipment inspections.'));
  assert.ok(compileWorkOwnershipCheck('At least three years of hands-on database administration.'));
});

test('rejects explicit support-only or third-party execution for hands-on work', () => {
  const check = compileWorkOwnershipCheck('Build reporting tools for delivery teams.');
  assert.ok(check);
  assert.equal(check('Supervised three analysts who built dashboards for delivery teams.', 'experience'), false);
  assert.equal(check('The analytics department designed reporting tools for delivery teams.', 'experience'), false);
  assert.equal(check('Forwarded reporting requests to the vendor who developed the dashboards.', 'experience'), false);
  assert.equal(check('Shadowed the team during the reporting rollout.', 'experience'), false);
  assert.equal(check('Built interactive delivery charts from scanner data.', 'projects'), true);
  assert.equal(check('Helped build a prototype and then wrote its data filters.', 'experience'), true);
  assert.equal(check('Supported the rollout by designing delivery reports.', 'experience'), true);
  assert.equal(check('Managed to develop delivery charts with a limited data feed.', 'experience'), true);
  assert.equal(check('Built reporting tools (validated by the vendor).', 'experience'), true);
});

test('distinguishes applicant approvals from external or independent sign-off', () => {
  const check = compileWorkOwnershipCheck('Review and sign off electrical test calculations.');
  assert.ok(check);
  assert.equal(check('Prepared calculations (signatures were provided by the senior engineer).', 'experience'), false);
  assert.equal(check('Reviewed the measurements and sent them for formal sign-off.', 'experience'), false);
  assert.equal(check('Reviewed calculations and jointly signed the final test packet.', 'experience'), true);
  assert.equal(check('Signed off on test calculations developed by another engineer.', 'experience'), true);
});

test('approval by another party does not invalidate work performed after that approval', () => {
  const approve = compileWorkOwnershipCheck('Approve enterprise refunds.');
  const process = compileWorkOwnershipCheck('Process enterprise refunds.');
  assert.ok(approve);
  assert.ok(process);
  for (const passage of [
    'Processed the enterprise refunds after the finance controller granted approval.',
    'Processed approved refunds once the review committee had authorized the payments.',
    'Processed the payments when leadership issued formal approval.',
  ]) {
    assert.equal(approve(passage, 'experience'), false);
    assert.equal(process(passage, 'experience'), true);
  }
  assert.equal(approve('Personally granted formal approval for refunds after management reviewed the claims.', 'experience'), true);
});

test('retains evidence of leading a team and work performed alongside others', () => {
  const lead = compileWorkOwnershipCheck('Lead testing and verification teams.');
  assert.ok(lead);
  assert.equal(lead('Led a verification team that performed fixture testing.', 'experience'), true);
  assert.equal(lead('Scheduled meetings for the lead who directed fixture testing.', 'experience'), false);
  assert.equal(lead('Co-led testing reviews with the engineering manager.', 'experience'), true);

  const operate = compileWorkOwnershipCheck('Operate equipment during performances.');
  assert.ok(operate);
  assert.equal(operate('Operated the console under the direction of the stage manager.', 'experience'), true);
  assert.equal(operate('Adapted show timing and retimed lighting transitions.', 'experience'), true);
  assert.equal(operate('The console was operated by the stage manager; I shadowed the team.', 'experience'), false);
});

test('distinguishes workshop preparation and the wrong audience from delivery', () => {
  const check = compileWorkOwnershipCheck('Deliver safety workshops to new warehouse associates.');
  assert.ok(check);
  assert.equal(check('Wrote induction handouts for incoming warehouse associates.', 'experience'), false);
  assert.equal(check('Briefed the shift leads so they could teach the workshop.', 'experience'), false);
  assert.equal(check('Delivered sessions to office staff using a handbook.', 'experience'), false);
  assert.equal(check('Presented the safety material to incoming warehouse employees.', 'experience'), true);
  assert.equal(check('Prepared slides and delivered the briefing to warehouse associates.', 'experience'), true);
});
