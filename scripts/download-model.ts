import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { baselineModel, embeddingModel, rerankingModel } from '../src/ml-config.ts';
import type { ModelArtifact } from '../src/ml-config.ts';

const metadataFiles = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json'];

async function readJson(file: URL): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function hashFile(file: URL) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function installFile<T>(destination: URL, writeTemporary: (file: URL) => Promise<T>) {
  const temporary = new URL(destination.href + '.' + randomUUID() + '.tmp');
  try {
    const result = await writeTemporary(temporary);
    await rename(temporary, destination);
    return result;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function installModel(model: ModelArtifact) {
  const root = new URL('../public/models/' + model.folder + '/', import.meta.url);
  const manifest = new URL('ready.json', root);
  const previous = await readJson(manifest).catch(() => null);
  const current = previous !== null && typeof previous === 'object' &&
    'id' in previous && previous.id === model.id && 'revision' in previous && previous.revision === model.revision;
  const recorded: Record<string, unknown> = current && 'files' in previous && typeof previous.files === 'object' && previous.files !== null
    ? Object.fromEntries(Object.entries(previous.files))
    : {};
  const verified: Record<string, string> = {};
  const missing = [];
  for (const file of [...metadataFiles, model.weights]) {
    const destination = new URL(file, root);
    const expected = file === model.weights ? model.sha256 : recorded[file];
    if (typeof expected === 'string' && await hashFile(destination).catch(() => '') === expected) {
      verified[file] = expected;
    } else {
      missing.push({ file, destination });
    }
  }
  if (!missing.length && current) {
    console.log(model.name + ' already verified.');
    return;
  }

  await rm(manifest, { force: true });
  await mkdir(new URL('./', new URL(model.weights, root)), { recursive: true });
  for (const { file, destination } of missing) {
    console.log(`Downloading ${model.name} / ${file}…`);
    const url = `https://huggingface.co/${model.id}/resolve/${model.revision}/${file}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw new Error(`Download failed for ${model.name} / ${file} (HTTP ${response.status}).`);
    const body = response.body;
    verified[file] = await installFile(destination, async temporary => {
      await body.pipeTo(Writable.toWeb(createWriteStream(temporary, { flags: 'wx' })));
      const digest = await hashFile(temporary);
      if (file === model.weights && digest !== model.sha256) {
        throw new Error(`SHA-256 verification failed for ${model.name} / ${file}.`);
      }
      if (file.endsWith('.json')) {
        const metadata = await readJson(temporary);
        if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
          throw new Error(`Invalid metadata for ${model.name} / ${file}.`);
        }
      }
      return digest;
    });
  }
  await installFile(manifest, temporary => writeFile(temporary, JSON.stringify({ ...model, files: verified }) + '\n', { flag: 'wx' }));
  console.log(model.name + ' is ready for browser inference.');
}

const models = process.argv.includes('--baseline')
  ? [embeddingModel, rerankingModel, baselineModel]
  : [embeddingModel, rerankingModel];
for (const model of models) await installModel(model);
