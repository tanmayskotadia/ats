import { cleanText } from './resume.ts';
import type { ResumeSection, SectionKey } from './resume.ts';
import { retrievalLimits } from './ml-config.ts';
import { compileQualifierCheck } from './ml-qualifiers.ts';
import { compileWorkOwnershipCheck } from './ml-ownership.ts';
import { isPositiveSkill } from './profile.ts';
import type { EvidenceFinding } from './ml-review.ts';

export interface MatchableResume {
  sections: readonly (Pick<ResumeSection, 'key' | 'lines'> & Partial<Pick<ResumeSection, 'label'>>)[];
}

export interface EvidencePassage {
  text: string;
  section: SectionKey;
  source?: { heading: string; line: number };
}

interface MatchPassages {
  evidence: EvidencePassage[];
  requirements: { text: string; candidateLimit?: number; checkOwnership?: boolean }[];
}

interface ModelInput extends MatchPassages {
  totalEvidence: number;
  totalRequirements: number;
}

export interface ModelMatch {
  requirement: string;
  evidence: (EvidencePassage & { similarity: number; entailment?: number })[];
}

export interface MLResult {
  model: string;
  revision: string;
  reranker?: { model: string; revision: string };
  rerankerUnavailable?: true;
  matches: EvidenceFinding[];
  evidenceCount: number;
  requirementCount: number;
  totalEvidence: number;
  totalRequirements: number;
}

export interface ModelRequest {
  id: number;
  input: ModelInput;
}

export type ModelResponse = { id: number } & ({ status: string } | { error: string } | { result: MLResult });

const excludedSections = new Set(['contact', 'interests', 'languages']);
const compactEvidenceSections = new Set(['skills', 'education', 'certifications']);
const referenceLabel = /\b(?:job description|job posting|target role|references?|requirements?|desired skills|skills to learn)\b/i;
const leadingMarker = /^\s*(?:#{1,6}\s+)?(?:[•*▪◦–—-]\s*|\d+[.)]\s+)?\s*/u;
const sentenceBoundary = /(?<=[!?;])\s+|(?<!\b(?:\p{L}|Mr|Ms|Mrs|Dr|Prof|Sr|Jr)\.)(?<=\.)\s+(?=\p{Lu})/u;
const excludedJobHeading = /^(?:about (?:us|the company)|company (?:overview|profile)|our (?:company|story|mission|values|culture)|benefits?(?: and perks)?|perks|compensation(?: and benefits)?|equal opportunity|how to apply|why join|what we offer|salary)(?:\s*[:\-].*)?$/i;
const jobBoilerplate = /^(?:join our team|apply (?:now|today|here)|we (?:offer|are an equal opportunity)|all qualified applicants|competitive (?:salary|benefits))\b|^(?:location|employment type|job title)\s*:/i;
const requirementHeading = /^(?:(?:key |core |main |your )?responsibilities|duties|(?:(?:minimum|required|preferred|desired|essential|technical|key|core|basic) )?(?:requirements|qualifications|skills|experience|tools|technologies)(?: (?:and|&) (?:requirements|qualifications|skills|experience))?|tech(?:nology)? stack|what you(?:'ll| will) (?:do|bring|need)|what we(?:'re| are) looking for|who you are|nice to have|must have)\s*[:\-]?\s*$/i;
const inlineRequirement = /^(?:(?:minimum|required|preferred|desired|essential|technical|core|key)\s+)?(?:skills|tools|technologies|keywords|tech(?:nology)? stack|requirements|qualifications|responsibilities|experience)\s*:|^(?:nice to have|must have|preferred|desirable)\s*:/i;
const skillList = /^(?:(?:minimum|required|preferred|desired|essential|technical|core|key)\s+)?(?:skills|tools|technologies|keywords|tech(?:nology)? stack)\s*:/i;
const explicitRequirement = /^(?:you (?:will|must|should)|candidates? must|applicants? must|must have|experience (?:in|with|using)|knowledge of|proficiency (?:in|with)|ability to|build|create|design|develop|maintain|manage|lead|deploy|implement|perform|provide|prepare|deliver|support)\b|\b(?:is required|are required|is preferred|are preferred|a plus|bachelor(?:'s)?|master(?:'s)?|doctorate|diploma|degree|certification|license)\b|\b\d+(?:\s*-\s*\d+)?\s*\+?\s*(?:years?|months?)\b/i;
const compactRequirement = /^(?:\.?[A-Z][\p{L}\p{N}+#./-]{0,29}|(?:CFA|ACCA|CPA)\s+Level\s+[IVX\d]+)$/u;
const waivedRequirement = /^(?:no (?:prior )?(?:experience|degree|certification|licen[cs]e))\b|\bnot\s+(?:required|needed|mandatory|necessary)\b/i;
const copiedRequirement = /^(?:you (?:will|must|should)|candidates? (?:must|should)|applicants? must|must have|required skills|minimum qualifications)\b/i;
const deniedEvidence = /\b(?:unfamiliar with|without using|no\b[^,;.!?]{0,35}\b(?:experience|expertise|training|exposure)|(?:not(?: yet)?|never|(?:have|has|had|did|do|does)n't)\s+(?:used|deployed|managed|operated|held|earned|completed|worked|implemented|trained|qualified|certified))\b/i;
const prospectiveEvidence = /^(?:(?:i am|i'm|am|currently|actively|now|still)\s+)*(?:learning|studying|exploring|planning|pursuing)\b(?!\s*(?:&|and)\s*development\b)|\b(?:interested in|aspiring to|hope to|want to|willing to|will learn|will study|plan(?:s|ning)? to|aim(?:s|ing)? to)\b/i;
const incompleteCredential = /\b(?:expected|in progress|candidate|expired|pending|planned|exam pre(?:p|paration))\b/i;

function chunks(text: string) {
  const output = [];
  let remaining = text.trim();
  while (remaining.length > retrievalLimits.chunkCharacters) {
    let boundary = remaining.lastIndexOf(' ', retrievalLimits.chunkCharacters);
    if (boundary < 100) boundary = retrievalLimits.chunkCharacters;
    output.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining) output.push(remaining);
  return output;
}

function distinct<T extends { text: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = cleanText(item.text).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function jobPassages(job: string) {
  const explicit: { text: string }[] = [];
  const fallback: { text: string }[] = [];
  const lines = job.split(/[\r\n\f]+/).map(line => line.replace(leadingMarker, '').trim()).filter(Boolean);
  let section = 'unknown';
  for (const line of lines) {
    const label = cleanText(line);
    if (requirementHeading.test(label)) {
      section = 'requirements';
      continue;
    }
    if (inlineRequirement.test(label)) section = 'requirements';
    else if (excludedJobHeading.test(label)) {
      section = 'excluded';
      continue;
    }
    if (section === 'excluded') continue;
    const list = skillList.test(label) ? line.slice(line.search(/[:：]/) + 1).split(/[,;|]/).map(item => item.trim()) : [];
    const simpleList = list.length > 1 && !/\b(?:or|any of|one of|either|equivalent)\b/i.test(label) && list.every(item => item && item.length <= 45 &&
      !/[()[\]]/.test(item) && !explicitRequirement.test(item));
    for (const passage of simpleList ? list : line.split(sentenceBoundary)) {
      const candidate = cleanText(passage);
      if (!/\p{L}/u.test(candidate) || jobBoilerplate.test(candidate) || waivedRequirement.test(candidate)) continue;
      if (section === 'requirements' || explicitRequirement.test(candidate)) {
        explicit.push(...chunks(passage).map(text => ({ text })));
      } else if (lines.length === 1 || compactRequirement.test(candidate) ||
        (candidate.match(/[\p{L}\p{N}]+/gu)?.length ?? 0) >= 4) {
        fallback.push(...chunks(passage).map(text => ({ text })));
      }
    }
  }
  return distinct(explicit.length ? explicit : fallback);
}

function sampleEvidence(evidence: EvidencePassage[], limit: number) {
  if (evidence.length <= limit) return evidence;
  const sections = new Map<SectionKey, EvidencePassage[]>();
  for (const item of evidence) {
    const group = sections.get(item.section);
    if (group) group.push(item);
    else sections.set(item.section, [item]);
  }
  const groups = [...sections.values()].slice(0, limit);
  let remainingPassages = evidence.length;
  let remainingSlots = limit;
  return groups.flatMap((group, index) => {
    // Reserve one slot for every section and distribute the rest by section size.
    const available = remainingSlots - (groups.length - index - 1);
    const share = Math.round(group.length * remainingSlots / remainingPassages);
    const slots = Math.max(1, Math.min(group.length, share, available));
    remainingSlots -= slots;
    remainingPassages -= group.length;
    return Array.from({ length: slots }, (_, position) =>
      group[Math.round(position * (group.length - 1) / Math.max(1, slots - 1))]);
  });
}

function resumePassages(resume: MatchableResume) {
  return distinct(resume.sections.filter(section =>
    !excludedSections.has(section.key) && !referenceLabel.test(section.label ?? '')
  ).flatMap(({ key, label, lines }) => lines.flatMap((line, index) =>
    evidenceClauses(line, key).flatMap(part => {
      const text = part.replace(leadingMarker, '').trim();
      const assertion = cleanText(text);
      const compact = compactEvidenceSections.has(key);
      if (!/\p{L}/u.test(assertion) || (!compact && assertion.length < 12 && !/\s/.test(assertion)) ||
        !isPositiveSkill(assertion) || deniedEvidence.test(assertion) || prospectiveEvidence.test(assertion) ||
        copiedRequirement.test(assertion) ||
        ((key === 'education' || key === 'certifications') && incompleteCredential.test(assertion))) return [];
      return chunks(text).map(text => ({ text, section: key, ...(label && { source: { heading: label, line: index + 1 } }) }));
    })
  )));
}

function evidenceClauses(line: string, section: SectionKey) {
  // A short credential can name the award and give its validity in separate sentences.
  if (section === 'certifications' && line.length <= retrievalLimits.chunkCharacters &&
      !deniedEvidence.test(line) && !prospectiveEvidence.test(line) && !incompleteCredential.test(line)) return [line];
  return line.split(sentenceBoundary).flatMap(sentence => sentence.split(/,?\s+(?:but|however|whereas),?\s+/i));
}

export function prepareMatches(resume: MatchableResume, job: string): ModelInput {
  const allEvidence = resumePassages(resume);
  const allRequirements = jobPassages(job);
  return {
    evidence: sampleEvidence(allEvidence, retrievalLimits.resumeChunks),
    requirements: allRequirements.slice(0, retrievalLimits.jobChunks),
    totalEvidence: allEvidence.length,
    totalRequirements: allRequirements.length,
  };
}

export function cosine(first: ArrayLike<number>, second: ArrayLike<number>) {
  if (!first.length || first.length !== second.length) throw new Error('Incompatible embedding dimensions.');
  let dot = 0;
  let firstNorm = 0;
  let secondNorm = 0;
  for (let index = 0; index < first.length; index += 1) {
    dot += first[index] * second[index];
    firstNorm += first[index] ** 2;
    secondNorm += second[index] ** 2;
  }
  if (!Number.isFinite(dot + firstNorm + secondNorm)) throw new Error('Invalid model embedding.');
  return firstNorm && secondNorm ? Math.max(-1, Math.min(1, dot / Math.sqrt(firstNorm * secondNorm))) : 0;
}

export function retrieveCandidates(input: MatchPassages, vectors: readonly ArrayLike<number>[], limit = retrievalLimits.candidates): ModelMatch[] {
  if (vectors.length !== input.requirements.length + input.evidence.length) throw new Error('Incomplete model output.');
  return input.requirements.map(({ text, candidateLimit, checkOwnership }, index) => {
    const allows = compileQualifierCheck(text);
    const ownsWork = checkOwnership ? compileWorkOwnershipCheck(text) : undefined;
    const evidence = input.evidence.flatMap((item, evidenceIndex) => {
      if (allows && !allows(item.text, item.section)) return [];
      if (ownsWork && !ownsWork(item.text, item.section)) return [];
      return [{ ...item, similarity: cosine(vectors[index], vectors[input.requirements.length + evidenceIndex]) }];
    });
    evidence.sort((first, second) => second.similarity - first.similarity);
    return { requirement: text, evidence: evidence.slice(0, candidateLimit ?? limit) };
  });
}

export function selectMatches(candidates: ModelMatch[], scores?: readonly number[]): ModelMatch[] {
  if (scores && (scores.length !== candidates.reduce((count, match) => count + match.evidence.length, 0) ||
      scores.some(score => !Number.isFinite(score) || score < 0 || score > 1))) throw new Error('Invalid reranker output.');
  let offset = 0;
  return candidates.map(({ requirement, evidence }) => {
    const selected = scores
      ? evidence.map(item => ({ ...item, entailment: scores[offset++] }))
          .filter(item => item.entailment >= retrievalLimits.minimumEntailment)
          .sort((first, second) => second.entailment - first.entailment || second.similarity - first.similarity)
      : evidence.filter(item => item.similarity >= retrievalLimits.minimumSimilarity);
    return { requirement, evidence: selected.slice(0, 2) };
  });
}
