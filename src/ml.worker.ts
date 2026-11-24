import { env } from '@huggingface/transformers';
import { embeddingModel, rerankingModel } from './ml-config.ts';
import type { ModelArtifact } from './ml-config.ts';
import { loadEmbedder, loadReranker } from './ml-inference.ts';
import type { ModelLocation } from './ml-inference.ts';
import { retrieveCandidates, selectMatches } from './ml-match.ts';
import type { ModelRequest, ModelResponse } from './ml-match.ts';
import type { ProgressCallback } from './resume.ts';

declare const self: DedicatedWorkerGlobalScope;

const appBase = new URL(import.meta.env.BASE_URL, self.location.origin);
const models = new URL('models/', appBase);
env.localModelPath = models.pathname;
const wasm = env.backends.onnx.wasm;
if (!wasm) throw new Error('The ONNX WebAssembly backend is unavailable.');
wasm.numThreads = 1;
wasm.proxy = false;
const runtime = new URL('ml-runtime/', appBase);
wasm.wasmPaths = {
  mjs: new URL('ort-wasm-simd-threaded.mjs', runtime).href,
  wasm: new URL('ort-wasm-simd-threaded.wasm', runtime).href,
};

async function locateModel(artifact: ModelArtifact, progress: ProgressCallback): Promise<ModelLocation> {
  let hosted = false;
  try {
    const manifestUrl = new URL(`${artifact.folder}/ready.json`, models);
    const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(3000) });
    const manifest: unknown = response.ok ? await response.json() : null;
    hosted = typeof manifest === 'object' && manifest !== null && 'id' in manifest && manifest.id === artifact.id &&
      'revision' in manifest && manifest.revision === artifact.revision;
  } catch { /* Download the pinned public weights when they are not hosted. */ }

  // These models load sequentially. The SDK's tokenizer metadata probe does not forward the revision option.
  env.remotePathTemplate = `{model}/resolve/${artifact.revision}/`;
  env.allowLocalModels = hosted;
  env.allowRemoteModels = !hosted;
  env.useBrowserCache = !hosted;
  return {
    id: hosted ? artifact.folder : artifact.id,
    options: {
      dtype: artifact.dtype,
      device: 'wasm',
      revision: hosted ? 'main' : artifact.revision,
      local_files_only: hosted,
      progress_callback: event => {
        if (event.status === 'progress' && event.file?.endsWith('.onnx')) {
          progress(`Loading ${artifact.name}… ${Math.round(event.progress)}%`);
        }
      },
    },
  };
}

let embedder: Promise<Awaited<ReturnType<typeof loadEmbedder>>> | undefined;
let reranker: Promise<Awaited<ReturnType<typeof loadReranker>>> | undefined;
let lastQueries: { key: string; vectors: Float32Array[] } | undefined;

self.onmessage = async (event: MessageEvent<ModelRequest>) => {
  const { id, input } = event.data;
  const progress: ProgressCallback = status => self.postMessage({ id, status } satisfies ModelResponse);
  try {
    progress(`Loading ${embeddingModel.name}…`);
    const encoder = await (embedder ??= locateModel(embeddingModel, progress)
      .then(location => loadEmbedder(location, embeddingModel))
      .catch(error => { embedder = undefined; throw error; }));

    const queries = input.requirements.map(requirement => requirement.text);
    const queryKey = JSON.stringify(queries);
    if (lastQueries?.key !== queryKey) {
      const vectors: Float32Array[] = [];
      for (let index = 0; index < queries.length; index += 4) {
        progress(`Encoding job criteria… ${Math.round(100 * index / queries.length)}%`);
        vectors.push(...await encoder.embed(queries.slice(index, index + 4), true));
      }
      lastQueries = { key: queryKey, vectors };
    }
    const passages = input.evidence.map(item => item.text);
    const vectors = [...lastQueries.vectors];
    for (let index = 0; index < passages.length; index += 4) {
      progress(`Encoding resume passages… ${Math.round(100 * index / passages.length)}%`);
      vectors.push(...await encoder.embed(passages.slice(index, index + 4)));
    }

    const candidates = retrieveCandidates(input, vectors);
    let matches;
    let secondModel;
    try {
      progress(`Loading ${rerankingModel.name}…`);
      const ranker = await (reranker ??= locateModel(rerankingModel, progress)
        .then(loadReranker).catch(error => { reranker = undefined; throw error; }));
      const pairs = candidates.flatMap(match => match.evidence.map(item => ({ query: match.requirement, passage: item.text })));
      const scores: number[] = [];
      for (let index = 0; index < pairs.length; index += 8) {
        progress(`Reranking related evidence… ${Math.round(100 * index / pairs.length)}%`);
        scores.push(...await ranker.score(pairs.slice(index, index + 8)));
      }
      matches = selectMatches(candidates, scores);
      secondModel = { model: rerankingModel.name, revision: rerankingModel.revision };
    } catch {
      matches = selectMatches(candidates);
    }

    self.postMessage({ id, result: {
      model: embeddingModel.name, revision: embeddingModel.revision, reranker: secondModel, matches,
      evidenceCount: input.evidence.length, requirementCount: input.requirements.length,
      totalEvidence: input.totalEvidence, totalRequirements: input.totalRequirements,
    } } satisfies ModelResponse);
  } catch {
    self.postMessage({ id, error: 'The local ML model could not run. Check model downloads or try a current browser.' } satisfies ModelResponse);
  }
};
