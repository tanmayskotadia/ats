import { env, AutoModel, AutoTokenizer, FeatureExtractionPipeline } from '@huggingface/transformers';
import type { PretrainedModelOptions } from '@huggingface/transformers';
import { embeddingModel } from './ml-config.ts';
import { rankMatches } from './ml-match.ts';
import type { ModelRequest, ModelResponse } from './ml-match.ts';
import type { ProgressCallback } from './resume.ts';

declare const self: DedicatedWorkerGlobalScope;

env.allowLocalModels = false;
env.useBrowserCache = true;
const wasm = env.backends.onnx.wasm;
if (!wasm) throw new Error('The ONNX WebAssembly backend is unavailable.');
wasm.numThreads = 1;
wasm.proxy = false;
const runtime = new URL('ml-runtime/', new URL(import.meta.env.BASE_URL, self.location.origin));
wasm.wasmPaths = {
  mjs: new URL('ort-wasm-simd-threaded.mjs', runtime).href,
  wasm: new URL('ort-wasm-simd-threaded.wasm', runtime).href,
};

let extractor: Promise<FeatureExtractionPipeline> | undefined;
async function getExtractor(progress: ProgressCallback) {
  if (!extractor) {
    extractor = (async () => {
      const local = new URL('models/minilm/', new URL(import.meta.env.BASE_URL, self.location.origin)).href;
      let hosted = false;
      try {
        const response = await fetch(local + 'ready.json', { signal: AbortSignal.timeout(3000) });
        const manifest: unknown = response.ok ? await response.json() : null;
        hosted = typeof manifest === 'object' && manifest !== null && 'revision' in manifest &&
          manifest.revision === embeddingModel.revision;
      } catch { /* Use the pinned public model if the host has no model assets. */ }
      env.allowLocalModels = hosted;
      env.allowRemoteModels = !hosted;
      env.localModelPath = new URL('../', local).pathname;
      const options: PretrainedModelOptions = {
        dtype: embeddingModel.dtype,
        device: 'wasm',
        revision: hosted ? 'main' : embeddingModel.revision,
        progress_callback: event => {
          if (event.status === 'progress' && event.file?.endsWith('.onnx')) {
            progress('Loading local ML model… ' + Math.round(event.progress) + '%');
          }
        },
      };
      const id = hosted ? 'minilm' : embeddingModel.id;
      const [model, tokenizer] = await Promise.all([
        AutoModel.from_pretrained(id, options),
        AutoTokenizer.from_pretrained(id, options),
      ]);
      tokenizer.config.model_max_length = 192;
      return new FeatureExtractionPipeline({ task: 'feature-extraction', model, tokenizer });
    })().catch(error => { extractor = undefined; throw error; });
  }
  return extractor;
}

self.onmessage = async (event: MessageEvent<ModelRequest>) => {
  const { id, input } = event.data;
  const progress: ProgressCallback = status => self.postMessage({ id, status } satisfies ModelResponse);
  try {
    progress('Loading local ML model…');
    const model = await getExtractor(progress);
    const texts = [...input.requirements, ...input.evidence].map(item => item.text);
    const vectors: Float32Array[] = [];
    for (let index = 0; index < texts.length; index += 8) {
      progress('Comparing resume evidence… ' + Math.round(100 * index / texts.length) + '%');
      const tensor = await model(texts.slice(index, index + 8), { pooling: 'mean', normalize: true });
      try {
        const { data, dims } = tensor;
        if (!(data instanceof Float32Array) || dims.length !== 2 || dims[0] * dims[1] !== data.length) {
          throw new Error('The model returned an invalid embedding batch.');
        }
        const [batchSize, dimensions] = dims;
        for (let row = 0; row < batchSize; row += 1) {
          vectors.push(data.slice(row * dimensions, (row + 1) * dimensions));
        }
      } finally { tensor.dispose(); }
    }
    self.postMessage({ id, result: { model: embeddingModel.name, revision: embeddingModel.revision,
      matches: rankMatches(input, vectors),
      evidenceCount: input.evidence.length, requirementCount: input.requirements.length,
      totalEvidence: input.totalEvidence, totalRequirements: input.totalRequirements,
    } } satisfies ModelResponse);
  } catch {
    self.postMessage({ id, error: 'The local ML model could not run. Check model downloads or try a current browser.' } satisfies ModelResponse);
  }
};
