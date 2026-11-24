import { copyFile, mkdir } from 'node:fs/promises';

const publicDirectory = new URL('../public/', import.meta.url);
await mkdir(publicDirectory, { recursive: true });
await copyFile(
  new URL('../node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', import.meta.url),
  new URL('eng.traineddata.gz', publicDirectory),
);
const runtimeDirectory = new URL('ml-runtime/', publicDirectory);
await mkdir(runtimeDirectory, { recursive: true });
for (const extension of ['mjs', 'wasm']) {
  const file = 'ort-wasm-simd-threaded.' + extension;
  await copyFile(
    new URL('../node_modules/onnxruntime-web/dist/' + file, import.meta.url),
    new URL(file, runtimeDirectory),
  );
}
