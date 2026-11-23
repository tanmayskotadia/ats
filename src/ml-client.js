import { prepareMatches } from './ml-match.js';

let worker;
let tail = Promise.resolve();
let nextId = 0;

export function matchWithModel(resume, job, progress = () => {}) {
  const input = prepareMatches(resume, job);
  if (!input.evidence.length || !input.requirements.length) return Promise.resolve(null);
  const run = () => new Promise((resolve, reject) => {
    const id = ++nextId;
    worker ??= new Worker(new URL('./ml.worker.js', import.meta.url), { type: 'module' });
    const active = worker;
    function cleanup() {
      clearTimeout(timer);
      active.removeEventListener('message', onMessage);
      active.removeEventListener('error', onError);
    }
    function fail(message) {
      cleanup();
      active.terminate();
      if (worker === active) worker = undefined;
      reject(new Error(message));
    }
    function onMessage(event) {
      if (event.data.id !== id) return;
      if (event.data.status) return progress(event.data.status);
      if (event.data.error) return fail(event.data.error);
      cleanup();
      resolve(event.data.result);
    }
    function onError() { fail('The local ML worker stopped. Try again.'); }
    const timer = setTimeout(() => fail('The local ML scan timed out. Try a shorter document or scan again.'), 120000);
    active.addEventListener('message', onMessage);
    active.addEventListener('error', onError);
    active.postMessage({ id, input });
  });
  progress('Waiting for local ML analysis…');
  const result = tail.then(run);
  tail = result.catch(() => {});
  return result;
}
