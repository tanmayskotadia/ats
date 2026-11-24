import { mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { embeddingModel } from '../src/ml-config.ts';

const root = new URL('../public/models/minilm/', import.meta.url);
await mkdir(new URL('onnx/', root), { recursive: true });
const files = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx'];
for (const file of files) {
  const url = `https://huggingface.co/${embeddingModel.id}/resolve/${embeddingModel.revision}/${file}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Model download failed for ${file} (${response.status}).`);
  const destination = new URL(file, root);
  const temporary = new URL(file + '.tmp', root);
  try {
    await writeFile(temporary, new Uint8Array(await response.arrayBuffer()));
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log('Downloaded ' + file);
}
await writeFile(new URL('ready.json', root), JSON.stringify(embeddingModel));
console.log('MiniLM is ready for browser inference from this app.');
