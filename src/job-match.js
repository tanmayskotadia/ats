const excludedHeading = /^(?:about (?:us|the company)|company (?:overview|profile)|our (?:company|story)|benefits|perks|compensation|equal opportunity|how to apply|why join|what we offer|salary)\b/i;
const preferredHeading = /^(?:preferred|desirable|desired|nice to have|bonus|optional)(?:\s+(?:skills|qualifications|requirements|experience|technologies|tools))?\s*[:–—-]?\s*$/i;
const requiredHeading = /^(?:(?:minimum|required|essential|technical|core|key|basic)\s+)?(?:requirements|qualifications|skills|experience|responsibilities|duties|tools|technologies)(?:\s*(?:and|&)\s*(?:experience|qualifications|requirements|responsibilities))?\s*[:–—-]?\s*$|^(?:what you(?:'|’)ll (?:do|bring)|what you will (?:do|bring)|what we(?:'|’)re looking for|who you are|must have|tech(?:nology)? stack)\s*[:–—-]?\s*$/i;
const inlineRequired = /^(?:(?:minimum|required|essential|technical|core|key|basic)\s+)?(?:skills|tools|technologies|requirements|qualifications|responsibilities)\s*:/i;
const inlinePreferred = /^(?:preferred|desirable|desired|nice to have|bonus|optional)(?:\s+(?:skills|qualifications|requirements|experience|technologies|tools))?\s*:/i;

export function jobCriteriaLines(job) {
  const criteria = [];
  let excluded = false;
  let preferred = false;
  for (const source of String(job ?? '').split(/\r?\n/)) {
    const text = source.trim();
    if (!text) continue;
    const label = text.replace(/^#{1,6}\s*/, '').replace(/^[•*-]\s*/, '');
    if (preferredHeading.test(label)) {
      excluded = false;
      preferred = true;
      continue;
    }
    if (requiredHeading.test(label)) {
      excluded = false;
      preferred = false;
      continue;
    }
    if (inlinePreferred.test(label)) {
      excluded = false;
      preferred = true;
    } else if (inlineRequired.test(label)) {
      excluded = false;
      preferred = false;
    } else if (excludedHeading.test(label)) {
      excluded = true;
      continue;
    }
    if (excluded) continue;
    for (const passage of text.split(/(?<=[.!?;])\s+(?=[A-Z])/)) {
      const explicitlyPreferred = /\b(?:preferred|desirable|nice to have|a plus|a bonus)\b/i.test(passage);
      const explicitlyRequired = /\b(?:required|must have|essential)\b/i.test(passage);
      criteria.push({ text: passage, preferred: explicitlyRequired ? false : preferred || explicitlyPreferred });
    }
  }
  return criteria;
}

const relevantSections = new Set(['experience', 'projects', 'volunteer', 'education', 'certifications', 'publications', 'awards', 'skills', 'summary', 'languages']);
const contextSections = new Set(['experience', 'projects', 'volunteer', 'education', 'certifications', 'publications', 'awards']);
const referenceLabel = /\b(?:job description|job posting|target role|references?|requirements?|desired skills|skills to learn)\b/i;
const prospectiveOpening = /^(?:(?:i am|i'm|i’m|am|currently|actively|now|still)\s+)*(?:learning|studying|exploring|planning|pursuing)\b(?!\s*(?:&|and)\s*development\b)/i;
const prospectiveIntent = /\b(?:interested in|aspiring to|hope to|want to|willing to|will learn|will study|plan(?:s|ning)? to|aim(?:s|ing)? to)\b/i;
const requirementWording = /\b(?:you (?:will|must|should)|candidate[s]? (?:must|should)|applicants? must|must have|should have|required skills|minimum qualifications)\b/i;
const workContext = /\b(?:built|build|developed|develop|designed|design|implemented|implement|automated|automate|maintained|maintain|used|use|using|deployed|deploy|analy[sz]ed|analy[sz]e|improved|improve|managed|manage|led|lead|created|create|delivered|deliver|produced|produce|prepared|prepare|optimized|optimize|reduced|reduce|supported|support|tested|test|wrote|write|trained|train|coordinated|coordinate|responsible|coursework|thesis|capstone|certified|certification|earned|awarded|graduated|bachelor|master|diploma)\b/i;
const words = text => text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
const credentialContext = /\b(?:bachelor|master|doctorate|diploma|B\.?S\.?C?\.?|B\.?A\.?|M\.?S\.?C?\.?|M\.?A\.?|B\.?Tech|M\.?Tech|Ph\.?D|MBA|certified|certification|licen[cs]ed)\b/i;
const credentialSections = new Set(['education', 'certifications']);
const normalizeQuote = text => String(text ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const missingEvidence = () => ({ evidence: '', kind: 'missing', credit: 0 });

function isProspective(text) {
  const statement = text.trim().replace(/^(?:[•*▪◦-]\s*|\d+[.)]\s*)/, '');
  return prospectiveOpening.test(statement) || prospectiveIntent.test(statement);
}

function allowedSection(section) {
  return relevantSections.has(section.key) && !referenceLabel.test(section.label || '');
}

function gradeEvidence(section, passages, evidence) {
  const demonstrated = contextSections.has(section.key) && passages.some(passage =>
    words(passage) >= 6 && workContext.test(passage) ||
    credentialSections.has(section.key) && credentialContext.test(passage) && !/\b(?:expected|in progress|candidate|planned)\b/i.test(passage));
  return { evidence, kind: demonstrated ? 'demonstrated' : section.key === 'summary' ? 'summary' : 'listed', credit: demonstrated ? 1 : 0.5 };
}

export function evidenceLevel(resume, label, aliases, positiveTermMatch) {
  let strongest = missingEvidence();
  const terms = [...new Set([label, ...(aliases ?? [])].filter(Boolean))];
  for (const section of resume.sections ?? []) {
    if (!allowedSection(section)) continue;
    for (const evidence of section.lines) {
      const clauses = evidence.split(/[.!?;](?=\s|$)|\b(?:but|however|although|yet)\b/i);
      const supported = clauses.filter(clause => !isProspective(clause) && !requirementWording.test(clause) &&
        terms.some(term => positiveTermMatch(clause, term)));
      if (!supported.length) continue;
      const result = gradeEvidence(section, supported, evidence);
      if (result.credit <= strongest.credit) continue;
      strongest = result;
      if (result.credit === 1) return strongest;
    }
  }
  return strongest;
}

export function quoteEvidenceLevel(resume, quote) {
  const normalized = normalizeQuote(quote);
  if (normalized.length < 3 || requirementWording.test(quote) ||
    quote.split(/[;\n]|[.!?](?=\s|$)/).some(isProspective)) return missingEvidence();
  let strongest = missingEvidence();
  for (const section of resume.sections ?? []) {
    if (!allowedSection(section) || !normalizeQuote(section.lines.join('\n')).includes(normalized)) continue;
    const result = gradeEvidence(section, [quote], quote);
    if (result.credit <= strongest.credit) continue;
    strongest = result;
    if (result.credit === 1) return strongest;
  }
  return strongest;
}
