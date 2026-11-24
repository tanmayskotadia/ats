import { retrievalLimits } from './ml-config.ts';
import { alternativeDuties, requirementParts } from './ml-criteria.ts';
import type { ModelMatch } from './ml-match.ts';

export type EvidenceStatus = 'supported' | 'partial' | 'absent' | 'related';

export interface EvidenceFinding extends ModelMatch {
  status: EvidenceStatus;
  parts?: ModelMatch[];
  alternatives?: true;
}

export function planEvidenceReview(requirements: readonly { text: string }[]) {
  const checks: { text: string; candidateLimit: number; checkOwnership: true }[] = [];
  const positions = new Map<string, number>();
  const groups = requirements.map(({ text }) => {
    const options = alternativeDuties(text);
    const alternatives = options.length > 1;
    const parts = alternatives ? options : requirementParts(text);
    const candidateLimit = parts.length > 1 ? retrievalLimits.candidatesPerPart : retrievalLimits.candidates;
    const indexes = parts.map(part => {
      const existing = positions.get(part);
      if (existing !== undefined) {
        checks[existing].candidateLimit = Math.max(checks[existing].candidateLimit, candidateLimit);
        return existing;
      }
      const index = checks.length;
      checks.push({ text: part, candidateLimit, checkOwnership: true });
      positions.set(part, index);
      return index;
    });
    return { requirement: text, indexes, alternatives };
  });
  return { checks, groups };
}

export function assembleEvidenceFindings(
  plan: ReturnType<typeof planEvidenceReview>, matches: ModelMatch[], verified: boolean,
): EvidenceFinding[] {
  if (matches.length !== plan.checks.length) throw new Error('Incomplete evidence checks.');
  return plan.groups.map(({ requirement, indexes, alternatives }) => {
    const parts = indexes.map(index => matches[index]);
    const covered = parts.filter(part => part.evidence.length).length;
    const status: EvidenceStatus = covered === 0 ? 'absent' : !verified ? 'related' :
      alternatives || covered === parts.length ? 'supported' : 'partial';
    const evidence = [...new Map(parts.flatMap(part => part.evidence).map(item => [item.text, item])).values()];
    return { requirement, evidence, status, ...(parts.length > 1 && { parts }), ...(alternatives && { alternatives: true }) };
  });
}
