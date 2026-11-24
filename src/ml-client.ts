import { prepareMatches } from './ml-match.ts';
import type { MLResult, MatchableResume, ModelRequest, ModelResponse } from './ml-match.ts';
import type { ProgressCallback } from './resume.ts';

export type { MLResult } from './ml-match.ts';

let worker: Worker | undefined;
let tail: Promise<unknown> = Promise.resolve();
let nextId = 0;

export function matchWithModel(resume: MatchableResume, job: string, progress: ProgressCallback = () => {}): Promise<MLResult | null> {
  const input = prepareMatches(resume, job);
  if (!input.evidence.length || !input.requirements.length) return Promise.resolve(null);
  const run = () => new Promise<MLResult>((resolve, reject) => {
    const id = ++nextId;
    worker ??= new Worker(new URL('./ml.worker.ts', import.meta.url), { type: 'module' });
    const active = worker;
    function cleanup() {
      clearTimeout(timer);
      active.removeEventListener('message', onMessage);
      active.removeEventListener('error', onError);
    }
    function fail(message: string) {
      cleanup();
      active.terminate();
      if (worker === active) worker = undefined;
      reject(new Error(message));
    }
    function onMessage({ data }: MessageEvent<ModelResponse>) {
      if (data.id !== id) return;
      if ('status' in data) return progress(data.status);
      if ('error' in data) return fail(data.error);
      cleanup();
      resolve(data.result);
    }
    function onError() { fail('The local ML worker stopped. Try again.'); }
    const timer = setTimeout(() => fail('The local ML scan timed out. Try a shorter document or scan again.'), 120000);
    active.addEventListener('message', onMessage);
    active.addEventListener('error', onError);
    active.postMessage({ id, input } satisfies ModelRequest);
  });
  progress('Waiting for local ML analysis…');
  const result = tail.then(run);
  tail = result.catch(() => {});
  return result;
}
