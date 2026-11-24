import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env } from '@huggingface/transformers';
import { baselineModel, embeddingModel, rerankingModel, retrievalLimits } from '../src/ml-config.ts';
import type { EmbeddingArtifact, ModelArtifact } from '../src/ml-config.ts';
import { loadEmbedder, loadReranker } from '../src/ml-inference.ts';
import type { ModelLocation } from '../src/ml-inference.ts';
import { cosine, selectMatches } from '../src/ml-match.ts';
import { retrievalCases } from '../tests/fixtures/ml-retrieval.ts';
import type { RetrievalPassage } from '../tests/fixtures/ml-retrieval.ts';

interface RankedPassage extends RetrievalPassage {
  index: number;
  similarity: number;
}

interface RerankedPassage extends RankedPassage {
  entailment: number;
}

const modelsDirectory = new URL('../public/models/', import.meta.url);
const outputCount = 2;

function localLocation(artifact: ModelArtifact): ModelLocation {
  return { id: artifact.folder, options: { device: 'cpu', dtype: artifact.dtype, local_files_only: true } };
}

async function verifyAssets(artifact: ModelArtifact) {
  try {
    const folder = new URL(artifact.folder + '/', modelsDirectory);
    const manifest: unknown = JSON.parse(await readFile(new URL('ready.json', folder), 'utf8'));
    if (typeof manifest !== 'object' || manifest === null || !('id' in manifest) || manifest.id !== artifact.id ||
        !('revision' in manifest) || manifest.revision !== artifact.revision) {
      throw new Error('The local model revision does not match the benchmark.');
    }
    await access(new URL(artifact.weights, folder));
  } catch (cause) {
    throw new Error(`${artifact.name} is missing or out of date. Run npm run models:download -- --baseline first.`, { cause });
  }
}

async function rankByEmbedding(artifact: EmbeddingArtifact): Promise<RankedPassage[][]> {
  console.log(`Embedding with ${artifact.name} (${artifact.revision})`);
  const embedder = await loadEmbedder(localLocation(artifact), artifact);
  try {
    const rankings: RankedPassage[][] = [];
    for (const item of retrievalCases) {
      const [query] = await embedder.embed([item.query], true);
      const vectors = await embedder.embed(item.passages.map(passage => passage.text));
      rankings.push(item.passages.map((passage, index) => ({ ...passage, index, similarity: cosine(query, vectors[index]) }))
        .sort((first, second) => second.similarity - first.similarity || first.index - second.index));
    }
    return rankings;
  } finally {
    await embedder.dispose();
  }
}

async function rerank(rankings: RankedPassage[][]) {
  console.log(`Reranking with ${rerankingModel.name} (${rerankingModel.revision})`);
  const reranker = await loadReranker(localLocation(rerankingModel));
  try {
    const reranked: RerankedPassage[][] = [];
    const selected: RankedPassage[][] = [];
    for (const [index, item] of retrievalCases.entries()) {
      const candidates = rankings[index].slice(0, retrievalLimits.candidates);
      const scores = await reranker.score(candidates.map(passage => ({ query: item.query, passage: passage.text })));
      const evidence = candidates.map(({ text, section, similarity }) => ({ text, section, similarity }));
      const [shown] = selectMatches([{ requirement: item.query, evidence }], scores);
      const labeled = new Map(candidates.map(passage => [passage.text, passage]));
      selected.push(shown.evidence.map(({ text }) => {
        const passage = labeled.get(text);
        if (!passage) throw new Error('The reranker selected an unknown passage.');
        return passage;
      }));
      reranked.push(candidates.map((passage, candidate) => ({ ...passage, entailment: scores[candidate] }))
        .sort((first, second) => second.entailment - first.entailment || second.similarity - first.similarity));
    }
    return { reranked, selected };
  } finally {
    await reranker.dispose();
  }
}

function firstRelevant(ranking: readonly RetrievalPassage[]) {
  return ranking.findIndex(passage => passage.relevance === 1) + 1;
}

const answerableCount = retrievalCases.filter(item => firstRelevant(item.passages)).length;

function rankMetrics(rankings: RankedPassage[][]) {
  let top1 = 0;
  let reciprocalRanks = 0;
  let normalizedGain = 0;
  for (const [index, ranking] of rankings.entries()) {
    const idealGain = retrievalCases[index].passages.filter(passage => passage.relevance)
      .slice(0, outputCount).reduce((sum, _, offset) => sum + 1 / Math.log2(offset + 2), 0);
    if (!idealGain) continue;
    const rank = firstRelevant(ranking);
    if (rank === 1) top1 += 1;
    if (rank) reciprocalRanks += 1 / rank;
    normalizedGain += ranking.slice(0, outputCount)
      .reduce((sum, passage, offset) => sum + passage.relevance / Math.log2(offset + 2), 0) / idealGain;
  }
  return {
    'Top 1': `${top1}/${answerableCount}`,
    MRR: (reciprocalRanks / answerableCount).toFixed(3),
    'nDCG@2': (normalizedGain / answerableCount).toFixed(3),
  };
}

function evidenceMetrics(selections: RankedPassage[][]) {
  let supportedQueries = 0;
  let unsupportedHits = 0;
  let relevant = 0;
  let shown = 0;
  for (const [index, selected] of selections.entries()) {
    const supported = selected.filter(passage => passage.relevance).length;
    if (supported) supportedQueries += 1;
    if (selected.length && !firstRelevant(retrievalCases[index].passages)) unsupportedHits += 1;
    relevant += supported;
    shown += selected.length;
  }
  return {
    'Queries with relevant evidence': `${supportedQueries}/${answerableCount}`,
    'Unsupported queries with hits': `${unsupportedHits}/${selections.length - answerableCount}`,
    'Relevant / shown': `${relevant}/${shown}`,
  };
}

function cosineSelections(rankings: RankedPassage[][], minimum: number) {
  return rankings.map(ranking => ranking.filter(passage => passage.similarity >= minimum).slice(0, outputCount));
}

function bestEntailment(ranking: RerankedPassage[], relevance: RetrievalPassage['relevance']) {
  return ranking.find(passage => passage.relevance === relevance)?.entailment.toFixed(3) ?? '-';
}

await Promise.all([baselineModel, embeddingModel, rerankingModel].map(verifyAssets));
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = fileURLToPath(modelsDirectory);
env.useFSCache = false;

const baseline = await rankByEmbedding(baselineModel);
const embedded = await rankByEmbedding(embeddingModel);
const { reranked, selected } = await rerank(embedded);

console.log(`\n${retrievalCases.length} synthetic queries with preselected passages. Ranking metrics use the ${answerableCount} with labeled evidence and apply no threshold.`);
console.table({
  [baselineModel.name]: rankMetrics(baseline),
  [embeddingModel.name]: rankMetrics(embedded),
  [`BGE + NLI (top ${retrievalLimits.candidates})`]: rankMetrics(reranked),
});
console.log('Rank of the first relevant passage (0 means it was absent).');
console.table(retrievalCases.map((item, index) => ({
  Requirement: item.id,
  Answerable: Boolean(firstRelevant(item.passages)),
  MiniLM: firstRelevant(baseline[index]),
  BGE: firstRelevant(embedded[index]),
  Reranked: firstRelevant(reranked[index]),
  Shown: selected[index].length,
  'Best relevant entailment': bestEntailment(reranked[index], 1),
  'Best other entailment': bestEntailment(reranked[index], 0),
})));
console.log('Evidence shown after filtering. Hits on unsupported queries are false positives.');
console.table({
  'MiniLM cosine ≥ 0.35': evidenceMetrics(cosineSelections(baseline, 0.35)),
  [`BGE cosine ≥ ${retrievalLimits.minimumSimilarity}`]: evidenceMetrics(cosineSelections(embedded, retrievalLimits.minimumSimilarity)),
  [`BGE + NLI (production, entailment ≥ ${retrievalLimits.minimumEntailment})`]: evidenceMetrics(selected),
});
