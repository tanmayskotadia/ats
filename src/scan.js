import { extractResume } from './extract.js';
import { parseResume, redactContact } from './resume.js';
import { scoreResume } from './score.js';

export const maxFiles = 20;

export async function scanFile(file, { job, useAI }, progress) {
  const { text, ...metadata } = await extractResume(file, progress);
  const resume = parseResume(text, metadata);
  let analysis;
  let aiNote;
  if (useAI) {
    progress('Checking resume evidence with AI…');
    try {
      const redacted = redactContact(resume.text, resume.contact);
      if (redacted.length > 48000) throw new Error('The extracted text exceeds the AI scan limit.');
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: redacted, job }),
        signal: AbortSignal.timeout(125000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'AI parsing is temporarily unavailable.');
      analysis = body;
    } catch (error) {
      aiNote = (error.name === 'TimeoutError' ? 'The AI request timed out.' : error.message) + ' This report uses the local parser.';
    }
  }
  return { resume, result: scoreResume(resume, job, analysis?.requirements), analysis, aiNote };
}

export async function runQueue(records, run) {
  const queue = records.values();
  async function worker() {
    for (const record of queue) await run(record);
  }
  await Promise.all(Array.from({ length: Math.min(2, records.length) }, worker));
}
