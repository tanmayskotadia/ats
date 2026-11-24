import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseResume } from '../src/resume.ts';
import { cosine, prepareMatches, retrieveCandidates, selectMatches } from '../src/ml-match.ts';
import { retrievalLimits } from '../src/ml-config.ts';

test('ML input excludes contact and denied experience and preserves source excerpts', () => {
  const resume = parseResume('Alex Rivera\nalex@example.com\nExperience\nAnalyst | Acme\nBuilt monthly dashboards for operations teams.\nNo experience with patient care.\nSkills\nSQL, Tableau\nInterests\nI enjoy reviewing medical terminology.');
  const input = prepareMatches(resume, 'Create visual dashboards to explain delivery trends.');
  assert.equal(input.requirements.length, 1);
  assert.ok(input.evidence.some(item => item.text.includes('dashboards')));
  assert.ok(input.evidence.every(item => resume.text.includes(item.text)));
  assert.ok(input.evidence.every(item => !/alex@|patient care|medical terminology/.test(item.text)));
});

test('retrieval bounds input size and exposes how much source text was compared', () => {
  const resume = {
    sections: [{
      key: 'experience',
      lines: Array.from({ length: 200 }, (_, index) => 'Built and maintained operations dashboard number ' + index),
    }],
  } satisfies Parameters<typeof prepareMatches>[0];
  const job = Array.from({ length: 50 }, (_, index) => 'Maintain service dashboard for department ' + index).join('\n');
  const input = prepareMatches(resume, job);
  assert.equal(input.evidence.length, retrievalLimits.resumeChunks);
  assert.equal(input.requirements.length, retrievalLimits.jobChunks);
  assert.equal(input.totalEvidence, 200);
  assert.equal(input.totalRequirements, 50);
});

test('job selection skips company and benefits sections and resumes at explicit qualifications', () => {
  const resume = parseResume('Experience\nBuilt operations dashboards for service teams.');
  const job = `About us
We operate a worldwide network of delivery depots.
Benefits
Enjoy paid holidays and a generous pension plan.
## Required skills:
SQL
PMP
Build dashboards for operations teams.
What we offer
Receive travel benefits and paid training allowances.
Qualifications & Experience
Maintain service reporting for regional directors.
Preferred skills: Tableau`;
  const input = prepareMatches(resume, job);
  assert.deepEqual(input.requirements.map(item => item.text), [
    'SQL', 'PMP', 'Build dashboards for operations teams.',
    'Maintain service reporting for regional directors.', 'Preferred skills: Tableau',
  ]);
  assert.ok(input.requirements.every(item => job.includes(item.text)));
});

test('explicit criteria preserve short technical names, credential levels and meaningful duration wording', () => {
  const job = [
    'Platform engineer',
    'Our team builds products for a growing portfolio of clients.',
    'Job title: Senior Engineer',
    'About the company',
    'We have used Java for 20 years.',
    '### Responsibilities',
    '1. Maintain the site’s Linux services.',
    '2. 3–5 years of cloud operations.',
    'Required skills: R, C++, .NET, CI/CD',
    'Nice to have:',
    'PMP',
    'CFA Level II',
    'B.S. Computer Science',
    'No degree required.',
    'We offer a competitive salary and paid holidays.',
  ].join('\n');
  const { requirements } = prepareMatches({ sections: [] }, job);
  assert.deepEqual(requirements.map(item => item.text), [
    'Maintain the site’s Linux services.', '3–5 years of cloud operations.',
    'R', 'C++', '.NET', 'CI/CD', 'PMP', 'CFA Level II', 'B.S. Computer Science',
  ]);
  assert.ok(requirements.every(item => job.includes(item.text)));
  assert.deepEqual(prepareMatches({ sections: [] }, '.NET').requirements, [{ text: '.NET' }]);
  const alternatives = 'Required skills: Oracle, PostgreSQL, or comparable database experience';
  assert.deepEqual(prepareMatches({ sections: [] }, alternatives).requirements, [{ text: alternatives }]);
});

test('keeps the credential and its current-status sentence together', () => {
  const line = 'Project Management Professional, awarded by PMI. Credential renewed and currently active.';
  const { evidence } = prepareMatches({ sections: [{ key: 'certifications', lines: [line] }] }, 'Active PMP certification');
  assert.deepEqual(evidence, [{ text: line, section: 'certifications' }]);
});

test('resume retrieval omits denied, prospective, and copied claims while keeping positive source clauses', () => {
  const denial = 'No hands-on experience with ' + 'configuring production Kubernetes clusters for regional operations teams '.repeat(15);
  const resume = { sections: [
    { key: 'experience', label: 'Experience', lines: [
      denial,
      '• No experience with AWS, but migrated PostgreSQL services to Google Cloud.',
      'I haven’t used Azure. Led incident follow-up and recovery reviews.',
      'Not yet certified in Snowflake administration.',
      'Plans to learn Rust for future projects.',
      'You must have experience maintaining SQL Server.',
    ] },
    { key: 'skills', lines: ['C++', 'R', 'Learning and development', 'Candidate sourcing', 'Currently learning Terraform.'] },
    { key: 'education', lines: ['B.S. Computer Science', 'M.S. Cybersecurity (in progress)'] },
    { key: 'certifications', lines: ['PMP', 'Expired BLS certification'] },
    { key: 'other', label: 'References', lines: ['Jane Doe, team lead for Elasticsearch operations.'] },
  ] } satisfies Parameters<typeof prepareMatches>[0];
  const { evidence } = prepareMatches(resume, 'Cloud operations and BLS certification.');
  assert.deepEqual(evidence.map(item => item.text), [
    'migrated PostgreSQL services to Google Cloud.',
    'Led incident follow-up and recovery reviews.',
    'C++', 'R', 'Learning and development', 'Candidate sourcing', 'B.S. Computer Science', 'PMP',
  ]);
  assert.ok(evidence.every(item => resume.sections.some(section => section.lines.some(line => line.includes(item.text)))));
});

test('limited evidence includes later sections instead of exhausting the budget on early roles', () => {
  const experience = Array.from({ length: 200 }, (_, index) => 'Maintained operations dashboard number ' + index);
  const resume = { sections: [
    { key: 'experience', lines: experience },
    { key: 'education', lines: ['Diploma in Information Systems from River College'] },
    { key: 'projects', lines: ['Built a forecasting service to estimate warehouse demand.'] },
    { key: 'skills', lines: ['Python, PostgreSQL, Tableau'] },
  ] } satisfies Parameters<typeof prepareMatches>[0];
  const input = prepareMatches(resume, 'Build demand forecasting services for warehouses.');
  assert.equal(input.totalEvidence, 203);
  assert.equal(input.evidence.length, retrievalLimits.resumeChunks);
  assert.deepEqual([...new Set(input.evidence.map(item => item.section))], ['experience', 'education', 'projects', 'skills']);
  assert.equal(input.evidence.filter(item => item.section === 'experience').length, 157);
});

test('section sampling preserves approximate source proportions and later passages', () => {
  const experience = Array.from({ length: 240 }, (_, index) => 'Maintained dashboard for delivery station ' + index);
  const projects = Array.from({ length: 80 }, (_, index) => 'Built procurement model for distribution project ' + index);
  const resume = { sections: [
    { key: 'experience', lines: experience },
    { key: 'projects', lines: projects },
    { key: 'certifications', lines: ['PMP'] },
  ] } satisfies Parameters<typeof prepareMatches>[0];
  const input = prepareMatches(resume, 'Design dashboards to track warehouse inventory.');
  assert.equal(input.totalEvidence, 321);
  assert.equal(input.evidence.length, retrievalLimits.resumeChunks);
  const selected = input.evidence.filter(item => item.section === 'experience');
  assert.ok(Math.abs(selected.length - retrievalLimits.resumeChunks * 240 / 321) < 2);
  assert.ok(input.evidence.some(item => item.text === 'PMP'));
  assert.ok(input.evidence.some(item => item.text === experience.at(-1)));
  assert.ok(input.evidence.some(item => item.text === projects.at(-1)));
});

test('long requirements and evidence remain bounded contiguous source excerpts', () => {
  const evidence = 'Built a reporting service. ' + 'Maintained detailed delivery records for regional operations teams. '.repeat(18);
  const job = 'Required skills: ' + 'Maintain delivery forecasts and explain warehouse trends. '.repeat(18);
  const input = prepareMatches({ sections: [{ key: 'experience', lines: [evidence] }] }, job);
  assert.ok(input.evidence.length > 1);
  assert.ok(input.evidence.every(item => item.text.length <= retrievalLimits.chunkCharacters && evidence.includes(item.text)));
  assert.ok(input.requirements.every(item => item.text.length <= retrievalLimits.chunkCharacters && job.includes(item.text)));
});

test('shortlists by cosine similarity and filters weak embedding-only matches', () => {
  const input = {
    requirements: [{ text: 'Maintain dashboards' }],
    evidence: [
      { text: 'Relevant', section: 'experience' },
      { text: 'Unrelated', section: 'experience' },
    ],
  } satisfies Parameters<typeof retrieveCandidates>[0];
  const vectors = [[1, 0], [0.9, 0.1], [0, 1]];
  assert.equal(retrieveCandidates(input, vectors, 1)[0].evidence.length, 1);
  const matches = selectMatches(retrieveCandidates(input, vectors));
  assert.equal(matches[0].evidence.length, 1);
  assert.equal(matches[0].evidence[0].text, 'Relevant');
  assert.ok(matches[0].evidence[0].similarity > 0.99);
  assert.equal(cosine([0, 0], [1, 0]), 0);
  assert.throws(() => retrieveCandidates(input, [[1, 0]]), /Incomplete/);
  assert.throws(() => cosine([1], [1, 0]), /dimensions/);
  assert.throws(() => cosine([NaN], [1]), /Invalid/);
});

test('checks an explicitly named tool before taking the closest passages', () => {
  const input = {
    requirements: [{ text: 'Experience with PostgreSQL' }],
    evidence: [
      { text: 'Implemented audit queries for MySQL.', section: 'experience' },
      { text: 'Migrated reporting jobs to Postgres.', section: 'experience' },
    ],
  } satisfies Parameters<typeof retrieveCandidates>[0];
  const [match] = retrieveCandidates(input, [[1, 0], [1, 0], [0.8, 0.2]], 1);
  assert.deepEqual(match.evidence.map(passage => passage.text), ['Migrated reporting jobs to Postgres.']);
});

test('reranks each criterion independently and withholds candidates below the relevance cutoff', () => {
  const item = (text: string, similarity: number) => ({ text, similarity, section: 'experience' as const });
  const candidates = [
    { requirement: 'First criterion', evidence: [item('Close wording', 0.9), item('Supporting passage', 0.7)] },
    { requirement: 'Second criterion', evidence: [item('Only a distractor', 0.95)] },
  ];
  const matches = selectMatches(candidates, [0.65, 0.9, 0.1]);
  assert.deepEqual(matches.map(match => match.evidence.map(passage => passage.text)), [['Supporting passage', 'Close wording'], []]);
  assert.throws(() => selectMatches(candidates, [0.9, 0.1]), /Invalid reranker output/);
  assert.throws(() => selectMatches(candidates, [0.9, NaN, 0.1]), /Invalid reranker output/);
});
