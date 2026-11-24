import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env } from '@huggingface/transformers';
import { embeddingModel, rerankingModel } from '../src/ml-config.ts';
import type { ModelArtifact } from '../src/ml-config.ts';
import { loadEmbedder, loadReranker } from '../src/ml-inference.ts';
import type { ModelLocation } from '../src/ml-inference.ts';
import { retrieveCandidates, selectMatches } from '../src/ml-match.ts';
import type { ModelMatch } from '../src/ml-match.ts';
import { assembleEvidenceFindings, planEvidenceReview } from '../src/ml-review.ts';
import type { EvidenceFinding } from '../src/ml-review.ts';
import { evidenceAuditCases } from '../tests/fixtures/ml-evidence-audit.ts';
import type { EvidenceAuditCase, EvidenceAuditStatus } from '../tests/fixtures/ml-evidence-audit.ts';

const modelsDirectory = new URL('../public/models/', import.meta.url);
const batchSize = 4;

async function localModel(artifact: ModelArtifact): Promise<ModelLocation> {
  try {
    const manifestUrl = new URL(`${artifact.folder}/ready.json`, modelsDirectory);
    const manifest: unknown = JSON.parse(await readFile(manifestUrl, 'utf8'));
    if (typeof manifest !== 'object' || manifest === null ||
        !('id' in manifest) || manifest.id !== artifact.id ||
        !('revision' in manifest) || manifest.revision !== artifact.revision) {
      throw new Error('Local model revision does not match the audit.');
    }
  } catch (cause) {
    throw new Error(`${artifact.name} must be installed locally. Run npm run models:download first.`, { cause });
  }
  return { id: artifact.folder, options: { device: 'cpu', dtype: artifact.dtype, local_files_only: true } };
}

async function collectCandidates(location: ModelLocation) {
  const encoder = await loadEmbedder(location, embeddingModel);
  try {
    const prepared = [];
    for (const item of evidenceAuditCases) {
      const requirement = { text: item.requirement };
      const plan = planEvidenceReview([requirement]);
      const requirements = [requirement, ...plan.checks];
      const evidence = item.passages.map(({ text, section }) => ({ text, section }));
      const vectors: Float32Array[] = [];
      for (let index = 0; index < requirements.length; index += batchSize) {
        vectors.push(...await encoder.embed(requirements.slice(index, index + batchSize).map(({ text }) => text), true));
      }
      for (let index = 0; index < evidence.length; index += batchSize) {
        vectors.push(...await encoder.embed(evidence.slice(index, index + batchSize).map(({ text }) => text)));
      }
      const candidates = retrieveCandidates({ requirements, evidence }, vectors);
      prepared.push({ item, plan, candidates });
    }
    return prepared;
  } finally {
    await encoder.dispose();
  }
}

async function auditCases(prepared: Awaited<ReturnType<typeof collectCandidates>>, location: ModelLocation) {
  const verifier = await loadReranker(location);
  try {
    const results: { item: EvidenceAuditCase; whole: ModelMatch; review: EvidenceFinding }[] = [];
    for (const { item, plan, candidates } of prepared) {
      const pairs = candidates.flatMap(({ requirement: query, evidence }) =>
        evidence.map(({ text: passage }) => ({ query, passage })));
      const keyFor = ({ query, passage }: (typeof pairs)[number]) => JSON.stringify([query, passage]);
      const unique = [...new Map(pairs.map(pair => [keyFor(pair), pair])).values()];
      const scores = new Map<string, number>();
      for (let index = 0; index < unique.length; index += batchSize) {
        const batch = unique.slice(index, index + batchSize);
        const output = await verifier.score(batch);
        batch.forEach((pair, offset) => scores.set(keyFor(pair), output[offset]));
      }
      const [whole, ...parts] = selectMatches(candidates, pairs.map(pair => {
        const score = scores.get(keyFor(pair));
        if (score === undefined) throw new Error('Missing passage verification score.');
        return score;
      }));
      const [review] = assembleEvidenceFindings(plan, parts, true);
      results.push({ item, whole, review });
    }
    return results;
  } finally {
    await verifier.dispose();
  }
}

function sourceIds(item: EvidenceAuditCase, match: ModelMatch) {
  return new Set(match.evidence.map(({ text }) => {
    const source = item.passages.find(passage => passage.text === text);
    if (!source) throw new Error('An evidence excerpt is outside the audit passages.');
    return source.id;
  }));
}

function summarize(
  results: Awaited<ReturnType<typeof auditCases>>,
  evidenceFor: (result: (typeof results)[number]) => ModelMatch,
  predictsFullSupport: (result: (typeof results)[number]) => boolean,
) {
  let fullClaims = 0;
  let trueFullClaims = 0;
  let groundedFullClaims = 0;
  let availableComponents = 0;
  let componentsCovered = 0;
  let citedSources = 0;
  let correctSources = 0;
  for (const result of results) {
    const { item } = result;
    const shown = sourceIds(item, evidenceFor(result));
    const supportedComponents = item.components.filter(component => component.sourceIds.length);
    const gold = new Set(supportedComponents.flatMap(component => component.sourceIds));
    const covered = supportedComponents.filter(component => component.sourceIds.some(id => shown.has(id))).length;
    if (predictsFullSupport(result)) {
      fullClaims += 1;
      if (item.expected === 'supported') {
        trueFullClaims += 1;
        if (covered === item.components.length) groundedFullClaims += 1;
      }
    }
    availableComponents += supportedComponents.length;
    componentsCovered += covered;
    citedSources += shown.size;
    correctSources += [...shown].filter(id => gold.has(id)).length;
  }
  const expectedFull = results.filter(({ item }) => item.expected === 'supported').length;
  return {
    'Full support precision': `${trueFullClaims}/${fullClaims}`,
    'Full support recall': `${trueFullClaims}/${expectedFull}`,
    'Fully cited / full support claims': `${groundedFullClaims}/${fullClaims}`,
    'Correct sources / shown': `${correctSources}/${citedSources}`,
    'Supported components with a correct source': `${componentsCovered}/${availableComponents}`,
  };
}

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = fileURLToPath(modelsDirectory);
env.useFSCache = false;
const [encoder, verifier] = await Promise.all([localModel(embeddingModel), localModel(rerankingModel)]);
console.log(`Auditing ${evidenceAuditCases.length} synthetic requirements using ${embeddingModel.name} and ${rerankingModel.name}.`);
const results = await auditCases(await collectCandidates(encoder), verifier);

console.log('Whole-criterion evidence counts as a full-support claim. Each method uses its production excerpt budget.');
console.table({
  'Whole criterion': summarize(results, result => result.whole, result => Boolean(result.whole.evidence.length)),
  'Per-component review': summarize(results, result => result.review, result => result.review.status === 'supported'),
});
const statuses: EvidenceAuditStatus[] = ['supported', 'partial', 'absent'];
console.log(`Exact review statuses: ${results.filter(({ item, review }) => item.expected === review.status).length}/${results.length}.`);
console.table(statuses.map(expected => ({
  Expected: expected,
  ...Object.fromEntries(statuses.map(predicted => [predicted, results.filter(({ item, review }) =>
    item.expected === expected && review.status === predicted).length])),
})));
console.log('Review source groups follow the order of the extracted components.');
console.table(results.map(({ item, whole, review }) => ({
  Requirement: item.id,
  Expected: item.expected,
  'Whole criterion': whole.evidence.length ? 'supported' : 'absent',
  Review: review.status,
  'Whole sources': [...sourceIds(item, whole)].join(', '),
  'Review source groups': (review.parts ?? [review]).map(part => [...sourceIds(item, part)].join(', ') || '-').join(' | '),
})));
