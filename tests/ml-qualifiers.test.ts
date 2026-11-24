import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileQualifierCheck } from '../src/ml-qualifiers.ts';

function checkFor(query: string) {
  const check = compileQualifierCheck(query);
  assert.ok(check, query);
  return check;
}

test('a named technology accepts its ATS aliases and rejects substitutions and denied use', () => {
  const postgres = checkFor('Experience administering PostgreSQL.');
  assert.equal(postgres('Administered Postgres replicas and verified nightly backups.', 'experience'), true);
  assert.equal(postgres('Administered MySQL replicas and verified nightly backups.', 'experience'), false);
  assert.equal(postgres('Did not use Postgres in this role.', 'experience'), false);

  const platform = checkFor('Deploy production Kubernetes clusters on Amazon EKS.');
  assert.equal(platform('Deployed workloads on Amazon Elastic Kubernetes Service.', 'experience'), true);
  assert.equal(platform('Deployed workloads on Google Kubernetes Engine.', 'experience'), false);
});

test('ordinary uses of catalog words and explicit alternatives stay with semantic retrieval', () => {
  for (const query of [
    'Excel at customer communication.',
    'React to live incidents and document the response.',
    'Sketch product options for the design team.',
    'Use PostgreSQL or equivalent database technology.',
    'Translate complex concepts into plain language.',
  ]) assert.equal(compileQualifierCheck(query), undefined, query);

  assert.equal(checkFor('Required skills: Excel')('Built monthly workbooks in Microsoft Excel.', 'experience'), true);
  const react = checkFor('Build accessible interfaces using React.');
  assert.equal(react('Built accessible components with React.js.', 'projects'), true);
  assert.equal(react('React to customer feedback when triaging incidents.', 'experience'), false);
});

test('minimum durations require an explicit measurement tied to the same tool', () => {
  const sql = checkFor('At least five years of professional SQL experience.');
  assert.equal(sql('6 years of experience using SQL in financial reporting.', 'experience'), true);
  assert.equal(sql('I maintained SQL reports for sixty months.', 'experience'), true);
  assert.equal(sql('Used SQL for four years; built Excel dashboards for a decade.', 'experience'), false);
  assert.equal(sql('Developed SQL reports and managed payroll for 8 years.', 'experience'), false);
  assert.equal(sql('SQL, Excel. Five years of financial reporting experience.', 'summary'), false);
  assert.equal(sql('Nearly 5 years of SQL experience.', 'summary'), false);
  assert.equal(compileQualifierCheck('SQL: up to 5 years.'), undefined);

  const threeYears = checkFor('At least three years of Snowflake administration.');
  const evidence = 'Administered Snowflake warehouses and access roles for two years after four years managing PostgreSQL.';
  assert.equal(threeYears(evidence, 'experience'), false);
  assert.equal(checkFor('At least two years of Snowflake administration.')(evidence, 'experience'), true);
});

test('active licensing evidence must identify the licensee and explicit current status', () => {
  const rn = checkFor('Hold an active Registered Nurse license.');
  assert.equal(rn('RN license issued by the state board. Status: active.', 'certifications'), true);
  assert.equal(rn('RN license. Credential expired in 2019.', 'certifications'), false);
  assert.equal(rn('Current RN license, expires in 2019.', 'certifications'), false);
  assert.equal(rn('RN license issued by the state board.', 'certifications'), false);
  assert.equal(rn('Verified active registered nurse licenses for staff.', 'experience'), false);
  assert.equal(rn('Licensed Practical Nurse (LPN), license active.', 'certifications'), false);
  assert.equal(rn('I currently hold an active RN license.', 'summary'), true);
});

test('credential names and levels do not substitute for one another', () => {
  const exam = checkFor('CFA Level II.');
  assert.equal(exam('Passed CFA Level II.', 'certifications'), true);
  assert.equal(exam('Passed CFA Level I.', 'certifications'), false);
  assert.equal(exam('CFA Level II candidate.', 'certifications'), false);

  const architect = checkFor('Current Google Cloud Professional Cloud Architect certification.');
  assert.equal(architect('Google Cloud Certified Professional Cloud Architect. Credential is currently active.', 'certifications'), true);
  assert.equal(architect('Google Cloud Professional Cloud Developer certification, currently active.', 'certifications'), false);
  assert.equal(architect('Audited active Google Cloud Professional Cloud Architect certifications for subcontractors.', 'experience'), false);
  assert.equal(compileQualifierCheck('Hold a valid industry certification.'), undefined);
});
