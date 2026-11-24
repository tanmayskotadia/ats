interface ModelArtifact {
  id: string;
  revision: string;
  folder: string;
  name: string;
  dtype: 'int8' | 'q8';
  weights: string;
  sha256: string;
  card: string;
}

export interface EmbeddingArtifact extends ModelArtifact {
  pooling: 'cls' | 'mean';
  queryPrefix: string;
}

export const baselineEmbeddingModel: EmbeddingArtifact = {
  id: 'Xenova/bge-base-en-v1.5',
  revision: '2e0d90d9066a78297ae13c032b05699b42a9cc17',
  folder: 'bge-base',
  name: 'BGE Base v1.5',
  dtype: 'int8',
  weights: 'onnx/model_int8.onnx',
  sha256: 'b83dfe249580ff1c2d0dcebe61ee565b1f6dcd5c2469632773d4508b9efd0889',
  card: 'https://huggingface.co/BAAI/bge-base-en-v1.5',
  pooling: 'cls',
  queryPrefix: 'Represent this sentence for searching relevant passages: ',
};

export const embeddingModel: EmbeddingArtifact = {
  id: 'Xenova/bge-large-en-v1.5',
  revision: 'dfeef6070b90658e1b391a6940efdb0925c1de6f',
  folder: 'bge-large',
  name: 'BGE Large v1.5',
  dtype: 'int8',
  weights: 'onnx/model_int8.onnx',
  sha256: '81862c1d889c334792a0e71b9d7eb6687a623acadfc81875c9590141996abf0d',
  card: 'https://huggingface.co/BAAI/bge-large-en-v1.5',
  pooling: 'cls',
  queryPrefix: 'Represent this sentence for searching relevant passages: ',
};

export const rerankingModel: ModelArtifact = {
  id: 'Xenova/nli-deberta-v3-xsmall',
  revision: 'cb1431274b5fccbbbc3bb19811413610d56dca28',
  folder: 'nli-deberta',
  name: 'DeBERTa-v3 NLI',
  dtype: 'int8',
  weights: 'onnx/model_int8.onnx',
  sha256: 'e1878da6c3a689d7e7beb9703395880016c3585cd127f875be0acad02405737b',
  card: 'https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall',
};

export const baselineModel: EmbeddingArtifact = {
  id: 'Xenova/all-MiniLM-L6-v2',
  revision: '751bff37182d3f1213fa05d7196b954e230abad9',
  folder: 'minilm',
  name: 'MiniLM-L6-v2',
  dtype: 'q8',
  weights: 'onnx/model_quantized.onnx',
  sha256: 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
  card: 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2',
  pooling: 'mean',
  queryPrefix: '',
};

export type { ModelArtifact };

export const retrievalLimits = {
  resumeChunks: 160, jobChunks: 36, chunkCharacters: 420, candidates: 8, candidatesPerPart: 4,
  minimumEntailment: 0.5, minimumSimilarity: 0.6,
};
