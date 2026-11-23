import { env, AutoModel, AutoTokenizer, FeatureExtractionPipeline } from '@huggingface/transformers';
import { embeddingModel } from './ml-config.js';
import { rankMatches } from './ml-match.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
const runtime = new URL('ml-runtime/', new URL(import.meta.env.BASE_URL, self.location.origin));
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('ort-wasm-simd-threaded.mjs', runtime).href,
  wasm: new URL('ort-wasm-simd-threaded.wasm', runtime).href,
};

let extractor;
async function getExtractor(progress) {
  if (!extractor) {
    extractor = (async () => {
      const local = new URL('models/minilm/', new URL(import.meta.env.BASE_URL, self.location.origin)).href;
      let hosted = false;
      try {
        const response = await fetch(local + 'ready.json', { signal: AbortSignal.timeout(3000) });
        const manifest = response.ok ? await response.json() : null;
        hosted = manifest?.revision === embeddingModel.revision;
      } catch { /* Use the pinned public model if the host has no model assets. */ }
      env.allowLocalModels = hosted;
      env.allowRemoteModels = !hosted;
      env.localModelPath = new URL('../', local).pathname;
      const options = {
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

self.onmessage = async event => {
  const { id, input } = event.data;
  const progress = status => self.postMessage({ id, status });
  try {
    progress('Loading local ML model…');
    const model = await getExtractor(progress);
    const texts = [...input.requirements, ...input.evidence].map(item => item.text);
    const vectors = [];
    for (let index = 0; index < texts.length; index += 8) {
      progress('Comparing resume evidence… ' + Math.round(100 * index / texts.length) + '%');
      const tensor = await model(texts.slice(index, index + 8), { pooling: 'mean', normalize: true });
      try { vectors.push(...tensor.tolist()); } finally { tensor.dispose(); }
    }
    self.postMessage({ id, result: { model: embeddingModel.name, revision: embeddingModel.revision,
      matches: rankMatches(input, vectors),
      evidenceCount: input.evidence.length, requirementCount: input.requirements.length,
      totalEvidence: input.totalEvidence, totalRequirements: input.totalRequirements,
    } });
  } catch {
    self.postMessage({ id, error: 'The local ML model could not run. Check model downloads or try a current browser.' });
  }
};
