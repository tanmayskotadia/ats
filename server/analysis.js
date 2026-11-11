import { z } from 'zod';
import { cleanText } from '../src/resume.js';

export const maxResumeLength = 48000;
export const maxJobLength = 30000;
export const requestSchema = z.strictObject({
  resume: z.string().trim().min(10).max(maxResumeLength),
  job: z.string().trim().max(maxJobLength),
});

const phrase = z.string().max(180);
const quote = z.string().max(600);
const entryType = z.enum(['experience', 'education', 'project', 'credential', 'volunteer', 'publication', 'award', 'other']);
export const analysisSchema = z.strictObject({
  entries: z.array(z.strictObject({
    kind: entryType, title: phrase, organization: phrase, dates: phrase,
    evidence: z.array(quote).min(1).max(4),
  })).max(35),
  skills: z.array(z.strictObject({ label: phrase, evidence: quote })).max(50),
  requirements: z.array(z.strictObject({
    label: phrase, priority: z.enum(['required', 'preferred']),
    jobEvidence: quote, resumeEvidence: quote,
  })).max(30),
  improvements: z.array(z.strictObject({
    title: phrase, action: z.string().max(420), evidence: quote,
  })).max(5),
});

const normalize = value => cleanText(value).replace(/\s+/g, ' ').toLowerCase();

export function groundAnalysis(output, input) {
  const resume = normalize(input.resume);
  const job = normalize(input.job);
  const verified = (text, snippet) => normalize(snippet).length >= 3 && text.includes(normalize(snippet));
  const distinct = (items, key) => {
    const seen = new Set();
    return items.filter(item => {
      const id = key(item);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };
  const entries = output.entries.flatMap(entry => {
    const evidence = entry.evidence.filter(line => verified(resume, line));
    const supports = value => evidence.some(line => verified(normalize(line), value));
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
