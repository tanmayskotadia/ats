import { z } from 'zod';

const phrase = z.string().max(180);
const quote = z.string().max(600);
const entryKind = z.enum(['experience', 'education', 'project', 'credential', 'volunteer', 'publication', 'award', 'other']);

export const cloudRequirementSchema = z.strictObject({
  label: phrase, preferred: z.boolean(), jobEvidence: quote, evidence: quote,
});

export const cloudAnalysisSchema = z.strictObject({
  entries: z.array(z.strictObject({
    kind: entryKind, title: phrase, organization: phrase, dates: phrase,
    evidence: z.array(quote).min(1).max(4),
  })).max(35),
  skills: z.array(z.strictObject({ label: phrase, evidence: quote })).max(50),
  requirements: z.array(cloudRequirementSchema).max(30),
  improvements: z.array(z.strictObject({
    title: phrase, action: z.string().max(420), evidence: quote,
  })).max(5),
});

export type CloudAnalysis = z.infer<typeof cloudAnalysisSchema>;
