import { extractResume } from './extract.ts';
import { parseResume, redactContact } from './resume.ts';
import type { ProgressCallback, Resume, ResumeMetadata } from './resume.ts';
import { scoreResume, skillEvidence } from './score.ts';
import type { ScoreResult } from './score.ts';
import { resumeFeedback } from './feedback.ts';
import type { CloudAnalysis } from './cloud-analysis.ts';
import type { MLResult } from './ml-client.ts';

export const maxFiles = 20;
export const maxResumeTextCharacters = 15 * 1024 * 1024;

export interface ScanSettings {
  job: string;
  useAI: boolean;
  useML: boolean;
}

export interface ScanReport {
  resume: Resume;
  result: ScoreResult;
  analysis?: CloudAnalysis;
  aiNote?: string;
  ml?: MLResult | null;
  mlNote?: string;
  feedback: ReturnType<typeof resumeFeedback>;
  settings: ScanSettings;
  originalText: string;
  revision: number;
  previous?: { score: number; jobChanged: boolean; aiChanged: boolean };
}

export async function scanFile(file: File, settings: Partial<ScanSettings>, progress?: ProgressCallback): Promise<ScanReport> {
  const { text, ...metadata } = await extractResume(file, progress);
  return analyzeText(text, metadata, settings, progress);
}

export async function analyzeText(
  text: string,
  metadata: ResumeMetadata,
  { job = '', useAI = false, useML = true }: Partial<ScanSettings>,
  progress: ProgressCallback = () => {},
): Promise<ScanReport> {
  if (typeof text !== 'string' || text.length > maxResumeTextCharacters || text.includes('\0') ||
    (text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 10) {
    throw new Error('Enter readable resume text within the 15 MB text limit.');
  }
  if (typeof job !== 'string' || job.length > 30000) throw new Error('Keep the job description within 30,000 characters.');
  const resume = parseResume(text, metadata);
  resume.profile.skills = skillEvidence(resume);
  let ml: ScanReport['ml'];
  let mlNote: string | undefined;
  if (useML && job.trim()) {
    try {
      const { matchWithModel } = await import('./ml-client.ts');
      ml = await matchWithModel(resume, job, progress);
      if (!ml) mlNote = 'There was too little structured text to compare with the local ML model.';
    } catch (error) {
      mlNote = (error instanceof Error ? error.message : 'Local ML could not run.') + ' Keyword matching is still available.';
    }
  }
  let analysis: CloudAnalysis | undefined;
  let aiNote: string | undefined;
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
      const body: unknown = await response.json();
      if (!response.ok) {
        const detail = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : '';
        throw new Error(detail || 'AI parsing is temporarily unavailable.');
      }
      const { cloudAnalysisSchema } = await import('./cloud-analysis.ts');
      const parsed = cloudAnalysisSchema.safeParse(body);
      if (!parsed.success) throw new Error('AI parsing returned an invalid report.');
      analysis = parsed.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI parsing could not run.';
      aiNote = (error instanceof Error && error.name === 'TimeoutError' ? 'The AI request timed out.' : message) + ' This report uses the local parser.';
    }
  }
  return { resume, result: scoreResume(resume, job, analysis?.requirements), analysis, aiNote, ml, mlNote,
    feedback: resumeFeedback(resume), settings: { job, useAI, useML }, originalText: resume.extractedText, revision: 0 };
}

export async function reviseScan(scan: ScanReport, text: string, settings: ScanSettings, progress?: ProgressCallback): Promise<ScanReport> {
  const originalText = scan.originalText;
  const next = await analyzeText(text, { ...scan.resume.metadata, textEdited: text.trim() !== originalText }, settings, progress);
  return { ...next, originalText, revision: scan.revision + 1,
    previous: { score: scan.result.score, jobChanged: scan.settings.job !== settings.job,
      aiChanged: scan.settings.useAI !== settings.useAI } };
}

export async function runQueue<T>(records: T[], run: (record: T) => Promise<void>) {
  const queue = records.values();
  async function worker() {
    for (const record of queue) await run(record);
  }
  await Promise.all(Array.from({ length: Math.min(2, records.length) }, worker));
}
