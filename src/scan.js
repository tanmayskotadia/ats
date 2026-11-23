import { extractResume } from './extract.js';
import { parseResume, redactContact } from './resume.js';
import { scoreResume, skillEvidence } from './score.js';
import { resumeFeedback } from './feedback.js';

export const maxFiles = 20;
export const maxResumeTextCharacters = 15 * 1024 * 1024;

export async function scanFile(file, settings, progress) {
  const { text, ...metadata } = await extractResume(file, progress);
  return analyzeText(text, metadata, settings, progress);
}

export async function analyzeText(text, metadata, { job = '', useAI = false, useML = true }, progress = () => {}) {
  if (typeof text !== 'string' || text.length > maxResumeTextCharacters || text.includes('\0') ||
    (text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 10) {
    throw new Error('Enter readable resume text within the 15 MB text limit.');
  }
  if (typeof job !== 'string' || job.length > 30000) throw new Error('Keep the job description within 30,000 characters.');
  const resume = parseResume(text, metadata);
  resume.profile.skills = skillEvidence(resume);
  let ml;
  let mlNote;
  if (useML && job.trim()) {
    try {
      const { matchWithModel } = await import('./ml-client.js');
      ml = await matchWithModel(resume, job, progress);
      if (!ml) mlNote = 'There was too little structured text to compare with the local ML model.';
    } catch (error) {
      mlNote = error.message + ' Keyword matching is still available.';
    }
  }
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
  return { resume, result: scoreResume(resume, job, analysis?.requirements), analysis, aiNote, ml, mlNote,
    feedback: resumeFeedback(resume), settings: { job, useAI, useML }, originalText: resume.extractedText, revision: 0 };
}

export async function reviseScan(scan, text, settings, progress) {
  const originalText = scan.originalText;
  const next = await analyzeText(text, { ...scan.resume.metadata, textEdited: text.trim() !== originalText }, settings, progress);
  return { ...next, originalText, revision: scan.revision + 1,
    previous: { score: scan.result.score, jobChanged: scan.settings.job !== settings.job,
      aiChanged: scan.settings.useAI !== settings.useAI } };
}

export async function runQueue(records, run) {
  const queue = records.values();
  async function worker() {
    for (const record of queue) await run(record);
  }
  await Promise.all(Array.from({ length: Math.min(2, records.length) }, worker));
}
