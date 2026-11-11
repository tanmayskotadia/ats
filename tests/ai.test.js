import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { groundAnalysis } from '../server/analysis.js';
import { createApi } from '../server/api.js';
import { createAnalyzer } from '../server/provider.js';
import { parseResume } from '../src/resume.js';
import { scoreResume } from '../src/score.js';

const input = {
  resume: 'Avery Morgan\navery@example.com\nExperience\nData Analyst | Northwind Logistics\nMay 2023 – Present\nBuilt Tableau dashboards.',
  job: 'Required: data visualization. Preferred: Power BI.',
};
const output = {
  entries: [
    { kind: 'experience', title: 'Data Analyst', organization: 'Northwind Logistics', dates: 'May 2023 - Present',
      evidence: ['Data Analyst | Northwind Logistics', 'May 2023 - Present'] },
    { kind: 'credential', title: 'Invented credential', organization: '', dates: '', evidence: ['Made up evidence'] },
  ],
  skills: [{ label: 'Tableau', evidence: 'Built Tableau dashboards.' }],
  requirements: [
    { label: 'data visualization', priority: 'required', jobEvidence: 'Required: data visualization.', resumeEvidence: 'Built Tableau dashboards.' },
    { label: 'Power BI', priority: 'preferred', jobEvidence: 'Preferred: Power BI.', resumeEvidence: 'Used Power BI.' },
    { label: 'Kubernetes', priority: 'required', jobEvidence: 'Required: Kubernetes.', resumeEvidence: 'Built Tableau dashboards.' },
  ],
  improvements: [{ title: 'Clarify impact', action: 'Add a verified outcome.', evidence: 'Built Tableau dashboards.' }],
};

test('grounds fields, discards invented text, and scores weighted semantic matches', () => {
  const result = groundAnalysis(output, input);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].organization, 'Northwind Logistics');
  assert.equal(result.entries[0].dates, 'May 2023 - Present');
  assert.equal(result.requirements.length, 2);
  assert.equal(result.requirements[0].evidence, 'Built Tableau dashboards.');
  assert.equal(result.requirements[1].evidence, '');
  const report = scoreResume(parseResume(input.resume), input.job, result.requirements);
  assert.equal(report.keywords.ratio, 2 / 3);
  assert.equal(report.categories.find(category => category.id === 'keywords').points, 17);
});

test('uses the OpenAI Responses protocol with strict schema and storage disabled', async () => {
  const analyze = createAnalyzer({ OPENAI_API_KEY: 'test-key' }, async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    return Response.json({
      id: 'resp_test', created_at: 0, model: body.model, status: 'completed',
      usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 200,
        output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 300 },
      output: [{ type: 'message', id: 'msg_test', status: 'completed', role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }] }],
    });
  });
  const result = await analyze(input, AbortSignal.timeout(5000));
  assert.equal(result.skills[0].label, 'Tableau');
});

async function testServer(context, env, analyze) {
  const { app, close } = createApi(env, { analyze, log: { info() {}, warn() {} } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => { server.close(); close(); });
  const url = 'http://127.0.0.1:' + server.address().port;
  const post = (body, headers = {}) => fetch(url + '/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { url, post };
}

test('reports unavailable AI without credentials', async context => {
  const { url, post } = await testServer(context, {}, null);
  const response = await fetch(url + '/api/status');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { aiEnabled: false });
  assert.equal((await post(input)).status, 503);
});

test('bounds concurrent requests, validates input, and masks contact data', async context => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const { post } = await testServer(context, { AI_CONCURRENCY: '1' }, async data => {
    entered(data);
    await wait;
    return groundAnalysis(output, data);
  });
  assert.equal((await post({ resume: 'no', job: '' })).status, 400);
  assert.equal((await post(input, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const first = post(input);
  const data = await started;
  try {
    assert.ok(data.resume.includes('[email removed]'));
    assert.ok(!data.resume.includes('avery@example.com'));
    const response = await post(input);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '3');
  } finally {
    release();
  }
  assert.equal((await first).status, 200);
});

test('applies a per-client quota before calling the model again', async context => {
  const { post } = await testServer(context, { AI_REQUESTS_PER_CLIENT: '1' }, async () => ({}));
  assert.equal((await post(input)).status, 200);
  assert.equal((await post(input)).status, 429);
});
