import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env } from '@huggingface/transformers';
import { baselineEmbeddingModel, baselineModel, embeddingModel, rerankingModel, retrievalLimits } from '../src/ml-config.ts';
import type { EmbeddingArtifact, ModelArtifact } from '../src/ml-config.ts';
import { loadEmbedder, loadReranker } from '../src/ml-inference.ts';
import type { ModelLocation } from '../src/ml-inference.ts';
import { cosine, retrieveCandidates, selectMatches } from '../src/ml-match.ts';
import { holdoutCases, retrievalCases } from '../tests/fixtures/ml-retrieval.ts';
import type { RetrievalCase, RetrievalPassage } from '../tests/fixtures/ml-retrieval.ts';

interface RankedPassage extends RetrievalPassage {
  index: number;
  similarity: number;
}

interface RerankedPassage extends RankedPassage {
  entailment: number;
}

const modelsDirectory = new URL('../public/models/', import.meta.url);
const outputCount = 2;
const baselineCandidates = 6;
const baselineEntailment = 0.5;
const batchSize = 4;
const distractors: RetrievalPassage[] = [
  'Cataloged donated photographs, repaired descriptive records, and prepared archival boxes for museum storage.',
  'Coached junior swimmers on stroke mechanics and coordinated lane assignments across evening sessions.',
  'Documented stream turbidity and water sample collection times during surveys of municipal park wetlands.',
  'Planned daily floor displays for a bookstore and arranged author events with the community outreach team.',
  'Processed interlibrary loan requests and investigated overdue items with partner branches.',
  'Retouched photographs for a museum catalog and standardized color profiles for print production.',
  'Recorded field instrument readings and checked that battery packs and radios were ready for survey crews.',
  'Created route cards and safety briefings for guided walks through protected public gardens.',
  'Sorted laboratory sample tubes by intake time and prepared tracking sheets for environmental analysts.',
  'Organized election-day equipment and audited the return of voting materials from assigned polling stations.',
  'Recorded audio interviews for a regional history archive and synchronized transcripts with timestamps.',
  'Restored damaged musical instruments and documented repair work in the studio service log.',
  'Maintained tree planting records and scheduled seasonal volunteer events for a neighborhood association.',
  'Wrote exhibit labels and directed installation teams on the placement of borrowed sculpture works.',
].map(text => ({ text, section: 'experience', relevance: 0 }));
const cases = [...retrievalCases, ...holdoutCases]
  .map(item => ({ ...item, passages: [...item.passages, ...distractors] }));

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

async function embedCases(artifact: EmbeddingArtifact) {
  console.log(`Embedding with ${artifact.name} (${artifact.revision})`);
  const embedder = await loadEmbedder(localLocation(artifact), artifact);
  try {
    const queries: Float32Array[] = [];
    for (let index = 0; index < cases.length; index += batchSize) {
      queries.push(...await embedder.embed(cases.slice(index, index + batchSize).map(item => item.query), true));
    }
    const passages = [...new Set(cases.flatMap(item => item.passages.map(passage => passage.text)))];
    const passageVectors = new Map<string, Float32Array>();
    for (let index = 0; index < passages.length; index += batchSize) {
      const batch = passages.slice(index, index + batchSize);
      const vectors = await embedder.embed(batch);
      batch.forEach((text, offset) => passageVectors.set(text, vectors[offset]));
    }
    return cases.map((item, index) => [queries[index], ...item.passages.map(({ text }) => {
      const vector = passageVectors.get(text);
      if (!vector) throw new Error('Missing passage embedding.');
      return vector;
    })]);
  } finally {
    await embedder.dispose();
  }
}

function rankByEmbedding(embeddings: Float32Array[][]): RankedPassage[][] {
  return embeddings.map(([query, ...vectors], caseIndex) =>
    cases[caseIndex].passages.map((passage, index) => ({ ...passage, index, similarity: cosine(query, vectors[index]) }))
      .sort((first, second) => second.similarity - first.similarity || first.index - second.index));
}

async function verifyPassages(...shortlists: RankedPassage[][][]) {
  console.log(`Verifying with ${rerankingModel.name} (${rerankingModel.revision})`);
  const reranker = await loadReranker(localLocation(rerankingModel));
  try {
    const verified: Map<string, number>[] = [];
    for (const [index, item] of cases.entries()) {
      const candidates = [...new Set(shortlists.flatMap(rankings => rankings[index].map(passage => passage.text)))];
      const scores = new Map<string, number>();
      for (let offset = 0; offset < candidates.length; offset += batchSize) {
        const batch = candidates.slice(offset, offset + batchSize);
        const entailments = await reranker.score(batch.map(passage => ({ query: item.query, passage })));
        batch.forEach((text, index) => scores.set(text, entailments[index]));
      }
      verified.push(scores);
    }
    return verified;
  } finally {
    await reranker.dispose();
  }
}

function withEntailment(rankings: RankedPassage[][], verified: Map<string, number>[]): RerankedPassage[][] {
  return rankings.map((ranking, index) => ranking.map(passage => {
    const entailment = verified[index].get(passage.text);
    if (entailment === undefined) throw new Error('Missing passage verification score.');
    return { ...passage, entailment };
  }));
}

function rankByEntailment(verified: RerankedPassage[][]) {
  return verified.map(ranking => [...ranking].sort((first, second) =>
    second.entailment - first.entailment || second.similarity - first.similarity));
}

function productionSelections(verified: RerankedPassage[][]) {
  return verified.map((ranking, index) => {
    const evidence = ranking.map(({ text, section, similarity }) => ({ text, section, similarity }));
    const [shown] = selectMatches([{ requirement: cases[index].query, evidence }], ranking.map(passage => passage.entailment));
    const labeled = new Map(ranking.map(passage => [passage.text, passage]));
    return shown.evidence.map(({ text }) => {
      const passage = labeled.get(text);
      if (!passage) throw new Error('Verification selected a passage outside the shortlist.');
      return passage;
    });
  });
}

function guardedShortlist(embeddings: Float32Array[][], rankings: RankedPassage[][]) {
  return cases.map((item, index) => {
    const evidence = item.passages.map(({ text, section }) => ({ text, section }));
    const [shortlist] = retrieveCandidates({ requirements: [{ text: item.query }], evidence }, embeddings[index]);
    const allowed = new Set(shortlist.evidence.map(passage => passage.text));
    return rankings[index].filter(passage => allowed.has(passage.text));
  });
}

function firstRelevant(ranking: readonly RetrievalPassage[]) {
  return ranking.findIndex(passage => passage.relevance === 1) + 1;
}

function rankMetrics(suite: readonly RetrievalCase[], rankings: RankedPassage[][]) {
  let answerableCount = 0;
  let top1 = 0;
  let reciprocalRanks = 0;
  let normalizedGain = 0;
  let retrieved = 0;
  let available = 0;
  for (const [index, ranking] of rankings.entries()) {
    const relevant = suite[index].passages.filter(passage => passage.relevance);
    const idealGain = relevant.slice(0, outputCount).reduce((sum, _, offset) => sum + 1 / Math.log2(offset + 2), 0);
    if (!idealGain) continue;
    available += relevant.length;
    retrieved += ranking.filter(passage => passage.relevance).length;
    answerableCount += 1;
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
    'Relevant retrieved / available': `${retrieved}/${available}`,
  };
}

function evidenceMetrics(suite: readonly RetrievalCase[], selections: RankedPassage[][]) {
  const answerableCount = suite.filter(item => firstRelevant(item.passages)).length;
  const relevantCount = suite.reduce((total, item) => total + item.passages.filter(passage => passage.relevance).length, 0);
  let supportedQueries = 0;
  let unsupportedHits = 0;
  let relevant = 0;
  let shown = 0;
  for (const [index, selected] of selections.entries()) {
    const supported = selected.filter(passage => passage.relevance).length;
    if (supported) supportedQueries += 1;
    if (selected.length && !firstRelevant(suite[index].passages)) unsupportedHits += 1;
    relevant += supported;
    shown += selected.length;
  }
  return {
    'Queries with relevant evidence': `${supportedQueries}/${answerableCount}`,
    'Unsupported queries with hits': `${unsupportedHits}/${selections.length - answerableCount}`,
    'Relevant / shown': `${relevant}/${shown}`,
    'Relevant / available': `${relevant}/${relevantCount}`,
  };
}

function cosineSelections(rankings: RankedPassage[][], minimum: number) {
  return rankings.map(ranking => ranking.filter(passage => passage.similarity >= minimum).slice(0, outputCount));
}

function entailmentSelections(rankings: RerankedPassage[][], minimum: number) {
  return rankings.map(ranking => ranking.filter(passage => passage.entailment >= minimum).slice(0, outputCount));
}

function bestEntailment(ranking: RerankedPassage[]) {
  const relevant = ranking.find(passage => passage.relevance)?.entailment.toFixed(3) ?? '-';
  const other = ranking.find(passage => !passage.relevance)?.entailment.toFixed(3) ?? '-';
  return `${relevant} / ${other}`;
}

await Promise.all([baselineModel, baselineEmbeddingModel, embeddingModel, rerankingModel].map(verifyAssets));
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = fileURLToPath(modelsDirectory);
env.useFSCache = false;

const baseline = rankByEmbedding(await embedCases(baselineModel));
const baselineEmbeddings = await embedCases(baselineEmbeddingModel);
const baseRank = rankByEmbedding(baselineEmbeddings);
const embeddings = await embedCases(embeddingModel);
const embedded = rankByEmbedding(embeddings);
const baselineShortlist = baseRank.map(ranking => ranking.slice(0, baselineCandidates));
const guardedBase = guardedShortlist(baselineEmbeddings, baseRank);
const guardedProduction = guardedShortlist(embeddings, embedded);
const verified = await verifyPassages(baselineShortlist, guardedBase, guardedProduction);
const previous = rankByEntailment(withEntailment(baselineShortlist, verified));
const previousShortlisted = withEntailment(guardedBase, verified);
const previousGuardedRanks = rankByEntailment(previousShortlisted);
const previousGuardedShown = productionSelections(previousShortlisted);
const shortlisted = withEntailment(guardedProduction, verified);
const productionRanks = rankByEntailment(shortlisted);
const productionShown = productionSelections(shortlisted);
const previousName = `${baselineEmbeddingModel.name} + NLI`;
const productionName = `${embeddingModel.name} + NLI`;
const guardLabel = `up to ${retrievalLimits.candidates}, guarded`;
const rawRankings = {
  [baselineModel.name]: baseline,
  [baselineEmbeddingModel.name]: baseRank,
  [embeddingModel.name]: embedded,
  [`${previousName} (top ${baselineCandidates})`]: previous,
  [`${previousName} (${guardLabel})`]: previousGuardedRanks,
  [`${productionName} (${guardLabel})`]: productionRanks,
};
const productionGate = retrievalLimits.minimumEntailment;
const displaySelections = {
  'MiniLM cosine ≥ 0.35': cosineSelections(baseline, 0.35),
  [`${baselineEmbeddingModel.name} cosine ≥ ${retrievalLimits.minimumSimilarity}`]: cosineSelections(baseRank, retrievalLimits.minimumSimilarity),
  [`${previousName} ≥ ${baselineEntailment} (prior policy)`]: entailmentSelections(previous, baselineEntailment),
  [`${previousName} ≥ ${productionGate} (guarded)`]: previousGuardedShown,
  [`${productionName} ≥ ${productionGate} (production)`]: productionShown,
};

function reportSuite(name: string, suite: readonly RetrievalCase[], start: number) {
  const end = start + suite.length;
  console.log(`\n${name} (${suite.length} synthetic queries, ${distractors.length} additional distractors per query)`);
  console.log('Ranking metrics use queries with labeled evidence and apply no threshold.');
  console.table(Object.fromEntries(Object.entries(rawRankings).map(([label, rankings]) =>
    [label, rankMetrics(suite, rankings.slice(start, end))])));
  console.log('Hits on unsupported queries are false positives.');
  console.table(Object.fromEntries(Object.entries(displaySelections).map(([label, selections]) =>
    [label, evidenceMetrics(suite, selections.slice(start, end))])));
  console.log('Best entailment values within the guarded shortlist, relevant passage first.');
  console.table(suite.map((item, index) => {
    const position = start + index;
    const shown = productionShown[position];
    return {
      Requirement: item.id,
      Answerable: Boolean(firstRelevant(item.passages)),
      'Prior rank': firstRelevant(previous[position]),
      'Prior guarded rank': firstRelevant(previousGuardedRanks[position]),
      'Production rank': firstRelevant(productionRanks[position]),
      'Prior best': bestEntailment(previousGuardedRanks[position]),
      'Production best': bestEntailment(productionRanks[position]),
      'Production relevant / shown': `${shown.filter(passage => passage.relevance).length}/${shown.length}`,
    };
  }));
}

reportSuite('Development set', retrievalCases, 0);
reportSuite('Holdout set', holdoutCases, retrievalCases.length);
