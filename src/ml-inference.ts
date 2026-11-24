import { AutoModel, AutoModelForSequenceClassification, AutoTokenizer, FeatureExtractionPipeline } from '@huggingface/transformers';
import type { PretrainedModelOptions } from '@huggingface/transformers';
import type { EmbeddingArtifact } from './ml-config.ts';

export interface ModelLocation {
  id: string;
  options: PretrainedModelOptions;
}

export async function loadEmbedder(location: ModelLocation, settings: EmbeddingArtifact) {
  const tokenizer = await AutoTokenizer.from_pretrained(location.id, location.options);
  tokenizer.config.model_max_length = 192;
  const model = await AutoModel.from_pretrained(location.id, location.options);
  const extract = new FeatureExtractionPipeline({ task: 'feature-extraction', tokenizer, model });

  return {
    async embed(texts: string[], query = false) {
      const input = query && settings.queryPrefix ? texts.map(text => settings.queryPrefix + text) : texts;
      const tensor = await extract(input, { pooling: settings.pooling, normalize: true });
      try {
        const { data, dims } = tensor;
        if (!(data instanceof Float32Array) || dims.length !== 2 || dims[0] !== texts.length || dims[0] * dims[1] !== data.length) {
          throw new Error('The embedding model returned an invalid batch.');
        }
        const [rows, width] = dims;
        return Array.from({ length: rows }, (_, row) => data.slice(row * width, (row + 1) * width));
      } finally { tensor.dispose(); }
    },
    dispose: () => extract.dispose(),
  };
}

export interface RelevancePair {
  query: string;
  passage: string;
}

function hypothesis(query: string) {
  const criterion = query.replace(/^(?:required|preferred|technical|core|key)?\s*(?:skills|experience|qualifications|requirements|tools)?\s*:\s*/i, '')
    .replace(/^(?:(?:you|the applicant|candidates?)\s+(?:will|must|should)\s+|must\s+|ability to\s+)/i, '')
    .replace(/\s+(?:is|are) (?:required|preferred|mandatory|essential)[.!?]?$/i, '')
    .replace(/[.!?]+$/, '').trim();
  const credential = criterion.match(/^(?:hold |have )?(?:an? )?(?:(active|current|valid) )?(.+\b(?:certification|licen[cs]e|credential))$/i);
  if (credential) return `The applicant ${credential[1] ? 'currently ' : ''}holds ${credential[2]}.`;
  const body = criterion.replace(/^[A-Z](?=[a-z])/, first => first.toLowerCase());
  if (/^(?:experience (?:with|in|using)|knowledge of|proficiency (?:in|with)|\d+\s*\+?\s*(?:years?|months?)\b)/i.test(criterion)) {
    return `The applicant has ${body}.`;
  }
  if (!/\s/.test(criterion)) return `The applicant has experience with ${criterion}.`;
  return `The applicant can ${body}.`;
}

export async function loadReranker(location: ModelLocation) {
  const tokenizer = await AutoTokenizer.from_pretrained(location.id, location.options);
  const model = await AutoModelForSequenceClassification.from_pretrained(location.id, location.options);
  const labels = 'label2id' in model.config ? model.config.label2id : undefined;
  const entailment = typeof labels === 'object' && labels !== null && 'entailment' in labels ? labels.entailment : undefined;
  if (typeof entailment !== 'number' || !Number.isInteger(entailment) || entailment < 0 || entailment >= 3) {
    await model.dispose();
    throw new Error('The reranker does not expose an entailment label.');
  }

  return {
    async score(pairs: RelevancePair[]) {
      const inputs = tokenizer(pairs.map(pair => pair.passage), {
        text_pair: pairs.map(pair => hypothesis(pair.query)), padding: true, truncation: true, max_length: 192,
      });
      try {
        const { logits } = await model(inputs);
        try {
          const data: unknown = logits.data;
          if (!(data instanceof Float32Array) || logits.dims.length !== 2 || logits.dims[0] !== pairs.length || logits.dims[1] !== 3) {
            throw new Error('The reranker returned an invalid batch.');
          }
          return pairs.map((_, row) => {
            const [first, second, third] = data.subarray(3 * row, 3 * row + 3);
            const peak = Math.max(first, second, third);
            const sum = Math.exp(first - peak) + Math.exp(second - peak) + Math.exp(third - peak);
            return Math.exp(data[3 * row + entailment] - peak) / sum;
          });
        } finally { logits.dispose(); }
      } finally {
        for (const tensor of Object.values(inputs)) tensor.dispose();
      }
    },
    dispose: () => model.dispose(),
  };
}
