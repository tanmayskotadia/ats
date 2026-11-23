import { cleanText } from './resume.js';
import { retrievalLimits } from './ml-config.js';

const excludedSections = new Set(['contact', 'interests', 'languages']);
const nonRequirements = /^(?:about (?:us|the company)|company (?:overview|profile)|our (?:company|story)|benefits|perks|compensation|equal opportunity|how to apply|why join|what we offer|salary)\b/i;
const requirementHeadings = /^(?:(?:key |core |main |your )?responsibilities|(?:(?:minimum|required|preferred|desired|essential|technical|key|core|basic) )?(?:requirements|qualifications|skills|experience)(?: (?:and|&) (?:requirements|qualifications|skills|experience))?|tech(?:nology)? stack|what you(?:'|’)ll (?:do|bring)|what you will (?:do|bring)|what we(?:'|’)re looking for|who you are|nice to have|must have)\s*[:–—-]?\s*$/i;
const inlineRequirements = /^(?:(?:required|preferred|technical|core|key)\s+)?(?:skills|tools|technologies|keywords|tech stack|requirements|qualifications)\s*:/i;
const negativeEvidence = /\b(?:no (?:prior )?(?:experience|knowledge|proficiency)|not (?:experienced|proficient|familiar)|never (?:used|worked)|unfamiliar with|without (?:experience|knowledge))\b/i;

function chunks(text) {
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

function distinct(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function jobPassages(job) {
  const passages = [];
  let section = 'unknown';
  for (const line of cleanText(job).split(/\n+/)) {
    const text = line.trim();
    const label = text.replace(/^#+\s*/, '');
    if (requirementHeadings.test(label)) {
      section = 'requirements';
      continue;
    }
    if (inlineRequirements.test(label)) section = 'requirements';
    else if (nonRequirements.test(label)) {
      section = 'excluded';
      continue;
    }
    if (section === 'excluded') continue;
    for (const passage of text.split(/(?<=[.!?;])\s+(?=[A-Z•*-])/)) {
      const words = passage.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
      const explicit = section === 'requirements' || /\b(?:required|preferred|essential|must have)\b/i.test(passage);
      if (words < 4 && (!explicit || !words)) continue;
      if (!/[\p{L}\p{N}]{2}/u.test(passage)) continue;
      passages.push(...chunks(passage).map(text => ({ text, section: 'job' })));
    }
  }
  return distinct(passages);
}

function diverseEvidence(evidence, limit) {
  if (evidence.length <= limit) return evidence;
  const sections = new Map();
  for (const item of evidence) {
    if (!sections.has(item.section)) sections.set(item.section, []);
    sections.get(item.section).push(item);
  }
  const selected = [];
  const groups = [...sections.values()];
  for (let index = 0; selected.length < limit; index += 1) {
    for (const group of groups) {
      if (group[index]) selected.push(group[index]);
      if (selected.length === limit) return selected;
    }
  }
  return selected;
}

export function prepareMatches(resume, job) {
  const allEvidence = distinct(resume.sections.filter(section => !excludedSections.has(section.key))
    .flatMap(section => section.lines.flatMap(line => chunks(line)
      .filter(text => text.length >= 12 && !negativeEvidence.test(text))
      .map(text => ({ text, section: section.key })))));
  const allRequirements = jobPassages(job);
  return {
    evidence: diverseEvidence(allEvidence, retrievalLimits.resumeChunks),
    requirements: allRequirements.slice(0, retrievalLimits.jobChunks),
    totalEvidence: allEvidence.length,
    totalRequirements: allRequirements.length,
  };
}

export function cosine(first, second) {
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

export function rankMatches(input, vectors) {
  if (vectors.length !== input.requirements.length + input.evidence.length) throw new Error('Incomplete model output.');
  return input.requirements.map((requirement, index) => ({
    requirement: requirement.text,
    evidence: input.evidence.map((item, evidenceIndex) => ({
      ...item,
      similarity: cosine(vectors[index], vectors[input.requirements.length + evidenceIndex]),
    })).sort((first, second) => second.similarity - first.similarity)
      .filter(item => item.similarity >= 0.35).slice(0, 2),
  }));
}
