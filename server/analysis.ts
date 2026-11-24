import { z } from 'zod';
import { cloudAnalysisSchema, cloudRequirementSchema } from '../src/cloud-analysis.ts';
import type { CloudAnalysis } from '../src/cloud-analysis.ts';
import { cleanText } from '../src/resume.ts';

export const maxResumeLength = 48000;
export const maxJobLength = 30000;
export const requestSchema = z.strictObject({
  resume: z.string().trim().min(10).max(maxResumeLength),
  job: z.string().trim().max(maxJobLength),
});

export const analysisSchema = cloudAnalysisSchema.extend({
  requirements: z.array(z.strictObject({
    label: cloudRequirementSchema.shape.label,
    priority: z.enum(['required', 'preferred']),
    jobEvidence: cloudRequirementSchema.shape.jobEvidence,
    resumeEvidence: cloudRequirementSchema.shape.evidence,
  })).max(30),
});

export type AnalysisInput = z.infer<typeof requestSchema>;
export type RawAnalysis = z.infer<typeof analysisSchema>;

const normalize = (value: string) => cleanText(value).replace(/\s+/g, ' ').toLowerCase();

export function groundAnalysis(output: RawAnalysis, input: AnalysisInput): CloudAnalysis {
  const resume = normalize(input.resume);
  const job = normalize(input.job);
  const verified = (text: string, snippet: string) => normalize(snippet).length >= 3 && text.includes(normalize(snippet));
  const distinct = <Item>(items: Item[], key: (item: Item) => string) => {
    const seen = new Set<string>();
    return items.filter(item => {
      const id = key(item);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };
  const entries = output.entries.flatMap(entry => {
    const evidence = entry.evidence.filter(line => verified(resume, line));
    const supports = (value: string) => evidence.some(line => verified(normalize(line), value));
    if (!supports(entry.title)) return [];
    return [{
      ...entry, evidence, organization: supports(entry.organization) ? entry.organization : '',
      dates: supports(entry.dates) ? entry.dates : '',
    }];
  });
  const requirements = job ? output.requirements.filter(item => verified(job, item.jobEvidence) &&
    verified(normalize(item.jobEvidence), item.label)).map(item => ({
      label: item.label, preferred: item.priority === 'preferred', jobEvidence: item.jobEvidence,
      evidence: verified(resume, item.resumeEvidence) ? item.resumeEvidence : '',
    })) : [];
  return {
    entries: distinct(entries, entry => [entry.kind, entry.title, entry.organization, entry.dates].map(normalize).join('|')),
    skills: distinct(output.skills.filter(item => verified(resume, item.evidence) &&
      normalize(item.label) && normalize(item.evidence).includes(normalize(item.label))), item => normalize(item.label)),
    requirements: distinct(requirements, item => normalize(item.label)),
    improvements: distinct(output.improvements.filter(item => normalize(item.action) &&
      verified(resume, item.evidence)), item => normalize(item.title)),
  };
}
