import { cleanText, actionPattern } from './resume.ts';
import type { Resume } from './resume.ts';

export const wordsIn = (text: string) => cleanText(text).match(/[\p{L}\p{N}]+/gu) || [];
const outcome = /\b(?:reduc(?:ed|ing)|increas(?:ed|ing)|improv(?:ed|ing)|cut|lowered|raised|boosted|grew|accelerated|shortened|eliminat(?:ed|ing)|sav(?:ed|ing)|generated|achieved|resolved|prevent(?:ed|ing)|simplified|standardized|streamlined|enabl(?:ed|ing)|resulting in|so that)\b/i;
const measuredChange = /\d[\d,.]*\s*(?:%|times\b|[x×]\b|milliseconds?\b|ms\b|seconds?\b|minutes?\b|hours?\b|days?\b|weeks?\b|months?\b|points?\b)|[$€£₹]\s*\d|\bfrom\s+\d[\d,.]*\s+to\s+\d[\d,.]*\b/i;
const denial = /\b(?:no experience|never|did not|not responsible|have not)\b/i;
const weak = /^(?:responsible for|helped|assisted|duties|involved in|participated in)\b/i;

export function impactSignals(resume: Pick<Resume, 'statements' | 'quantifiedStatements'>) {
  const seen = new Set<string>();
  const statements = resume.statements.filter(text => {
    const key = cleanText(text).toLowerCase().replace(/\d[\d,.]*/g, '#').replace(/[^\p{L}\p{N}#]+/gu, ' ').trim();
    if (seen.has(key) || wordsIn(text).length < 4 || text.length < 20 || denial.test(text)) return false;
    seen.add(key);
    return true;
  });
  const actionable = statements.filter(text => actionPattern.test(text) && !weak.test(text));
  const detailed = statements.filter(text => wordsIn(text).length >= 6 && !weak.test(text));
  const quantified = statements.filter(text => outcome.test(text) && measuredChange.test(
    text.replace(/\bfrom\s+(?:19|20)\d{2}\s+to\s+(?:19|20)\d{2}\b/gi, '')));
  const qualitative = statements.filter(text => !quantified.includes(text) && outcome.test(text) && wordsIn(text).length >= 7);
  const scope = statements.filter(text => !quantified.includes(text) && !qualitative.includes(text) && resume.quantifiedStatements.includes(text));
  return { statements, actionable, detailed, quantified, qualitative, scope };
}
