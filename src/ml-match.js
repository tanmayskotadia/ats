import { cleanText } from './resume.js';
import { retrievalLimits } from './ml-config.js';

const excludedSections = new Set(['contact', 'interests', 'languages']);
const nonRequirements = /^(?:about (?:us|the company)|benefits|perks|compensation|equal opportunity|how to apply|why join|what we offer|salary)\b/i;
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

export function prepareMatches(resume, job) {
  const allEvidence = distinct(resume.sections.filter(section => !excludedSections.has(section.key))
    .flatMap(section => section.lines.flatMap(line => chunks(line)
      .filter(text => text.length >= 12 && !negativeEvidence.test(text))
      .map(text => ({ text, section: section.key })))));
  const allRequirements = distinct(cleanText(job).split(/\n+/).filter(line => !nonRequirements.test(line.trim()))
    .flatMap(line => line.split(/(?<=[.!?;])\s+(?=[A-Z•*-])/))
    .filter(line => line.match(/[\p{L}\p{N}]+/gu)?.length >= 4)
    .flatMap(line => chunks(line).map(text => ({ text, section: 'job' }))));
  return {
    evidence: allEvidence.slice(0, retrievalLimits.resumeChunks),
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
