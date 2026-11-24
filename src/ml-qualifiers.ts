import { catalog, cfaLevels, credentialFamilies, durationMonths, namedTechnologies, positiveTermMatch, termMatches } from './score.ts';
import { cleanText } from './resume.ts';
import type { SectionKey } from './resume.ts';

type QualifierCheck = (passage: string, section: SectionKey) => boolean;

const namedApplications = new Set([
  'Adobe Illustrator', 'Adobe InDesign', 'Adobe Photoshop', 'AutoCAD', 'Figma', 'Google Ads', 'Google Analytics',
  'HubSpot', 'Jira', 'QuickBooks', 'Revit', 'Salesforce', 'SAP', 'Sketch', 'SolidWorks', 'Workday',
]);
const ambiguousTools = new Set(['C', 'Excel', 'Go', 'R', 'React', 'Ruby', 'Rust', 'Sketch', 'Swift']);
const conventionalWording = /\b(?:excel (?:at|in)|go (?:to|through|over|live|above)|react to|sketch (?:out|ideas|products?|options?)|swift (?:action|decisions?|results?|responses?))\b/i;
const technologyWording = /\b(?:using|programming|framework|code|application|developer|development|language|spreadsheet|workbooks?|pivot tables?|macros?|proficien(?:t|cy)|(?:experience|work)\s+(?:with|using|in))\b/i;
const skillPrefix = /^(?:(?:required|preferred|technical|core|key)\s+)?(?:skills|tools|technologies)\s*:\s*/i;
const managedPlatforms = [
  ['EKS', 'Amazon EKS', 'Amazon Elastic Kubernetes Service', 'Elastic Kubernetes Service'],
  ['GKE', 'Google Kubernetes Engine'],
  ['AKS', 'Azure Kubernetes Service'],
];
const namedCredentials = [
  ['PMP', 'Project Management Professional'],
  ['CAPM', 'Certified Associate in Project Management'],
  ['CPA', 'Certified Public Accountant'],
  ['CFA', 'Chartered Financial Analyst'],
  ['RN', 'Registered Nurse'],
  ['LPN', 'Licensed Practical Nurse'],
  ...catalog.filter(term => ['BLS', 'ACLS'].includes(term.label)).map(term => term.aliases),
];

const alternatives = /\b(?:or|equivalent|one of|substitute|comparable)\b/i;
const credentialWording = /\b(?:certification|certificate|licen[cs]e|credential|degree)\b/i;
const activeWording = /\b(?:active|current|valid)\b/i;
const expiredOrIncomplete = /\b(?:expired|lapsed|inactive|revoked|suspended|pending|in progress|not (?:currently )?(?:active|current|valid)|candidate|pursuing|working toward|exam prep(?:aration)?|exam scheduled|previously held)\b/i;
const thirdPartyCredential = /\b(?:verified|checked|audited|tracked|reviewed|processed|administered)\s+(?:the\s+)?(?:(?:active|current|valid|professional|employee|external)\s+)*(?:[^.!?;]{0,65}\b(?:certifications?|certificates?|licen[cs]es?|credentials?))\b|\b(?:on behalf of|for (?:others|staff|employees|external|team members))\b/i;
const holder = /^(?:(?:i|currently|am)\s+)*(?:hold|held|earned|received|obtained|renewed|passed|graduated|licensed|certified)\b|\b(?:awarded|issued|granted)\s+by\b|\bcurrently\s+holds?\b/i;
const currentStatus = /\b(?:currently (?:active|valid|holds?)|(?:active|current|valid)\s+[^.!?;]{0,45}\b(?:certification|certificate|licen[cs]e|credential)|(?:certification|certificate|licen[cs]e|credential)\s*[,:(\-]?\s*(?:(?:is|remains)\s+)?(?:active|current|valid))\b|(?:^|[,.;])\s*(?:status:\s*)?(?:active|current|valid)(?=\s*(?:[,;.!?]|$))/i;
const upperBoundDuration = /(?:<\s*\d)|\b(?:less than|at most|up to|under|nearly|almost|within)\s+\d|\b(?:years?|months?)\s+ago\b/i;
const elapsedBeforeSkill = /\b(?:years?|months?)'?[\s]+(?:of\s+)?(?:(?:hands-on|professional|practical|working)\s+)?(?:experience\s+)?(?:(?:with|using|in|on)\s+)?(.+)$/i;
const elapsedAfterSkill = /^(.+?)(?:\bfor\s+|:\s*|\(\s*)(?:the (?:last|past) )?\d+(?:\.\d+)?(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?\+?\s*(?:years?|months?)\b/i;
const statementBoundary = /[;\n]|(?<=[.!?])\s+|\b(?:but|while|whereas)\b/i;
const clauseBoundary = /,|\b(?:after|before|following)\b|\band\s+(?=(?:\w+ed|built|led|ran|wrote|met|held)\b)/i;
const deniedUse = /\b(?:did(?: not|n't)|(?:have|has|had)(?: not|n't)|never)\s+(?:use[ds]?|work(?:ed)?|deploy(?:ed)?|manag(?:e|ed)|operat(?:e|ed)|configur(?:e|ed)|support(?:ed)?|administer(?:ed)?|hold|held|earn(?:ed)?)\b/i;
const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const writtenDuration = new RegExp(
  '\\b(?<!hundred )(?:(%TENS%)(?:[- ](%UNITS%))?|(%SMALL%))(?=\\s+(?:years?|months?)\\b)'
    .replace('%TENS%', tens.join('|')).replace('%UNITS%', numberWords.slice(1, 10).join('|')).replace('%SMALL%', numberWords.join('|')),
  'gi',
);

export function numericDurations(text: string) {
  return text.replace(writtenDuration, (_, tensWord: string | undefined, units: string | undefined, small: string | undefined) =>
    String(tensWord ? (tens.indexOf(tensWord.toLowerCase()) + 2) * 10 + (units ? numberWords.indexOf(units.toLowerCase()) : 0) :
      numberWords.indexOf(small?.toLowerCase() ?? '')));
}

function namedToolMention(text: string, [name, ...aliases]: string[], match: (text: string, term: string) => boolean) {
  if (aliases.some(alias => match(text, alias))) return true;
  if (!match(text, name)) return false;
  return !ambiguousTools.has(name) ||
    text.replace(skillPrefix, '').replace(/[.!?]$/, '').trim().toLowerCase() === name.toLowerCase() ||
    (!conventionalWording.test(text) && technologyWording.test(text));
}

function mentionsTool(clause: string, aliases: string[]) {
  return !deniedUse.test(clause) && namedToolMention(clause, aliases, positiveTermMatch);
}

function toolDurations(text: string, aliases: string[]) {
  return text.split(statementBoundary).filter(statement => mentionsTool(statement, aliases))
    .flatMap(statement => statement.split(clauseBoundary).flatMap(clause => {
      if (upperBoundDuration.test(clause)) return [];
      const mention = clause.match(elapsedBeforeSkill)?.[1] ?? clause.match(elapsedAfterSkill)?.[1];
      if (!mention || !aliases.some(alias => positiveTermMatch(mention, alias))) return [];
      const durations = durationMonths(clause);
      return durations.length === 1 ? durations : [];
    }));
}

function specificCredential(query: string) {
  const name = query.replace(/^(?:hold\s+|have\s+|maintain\s+|possess\s+)?(?:an?\s+)?(?:(?:active|valid|current)\s+)?/i, '')
    .match(/^(.{5,100}?)\s+(?:certification|certificate|licen[cs]e|credential)(?:\s+(?:is|are)\s+(?:required|preferred|essential))?[.!?]?$/i)?.[1];
  return name && name.split(/\s+/).filter(word => /^[A-Z]/.test(word)).length >= 2 ? name : undefined;
}

function credentialCheck(query: string, names: string[][], levels: number[]): QualifierCheck | undefined {
  const family = credentialFamilies.filter(pattern => pattern.test(query));
  const specific = !names.length && !family.length ? specificCredential(query) : undefined;
  if (names.length > 1 || (!names.length && family.length !== 1 && !specific)) return;
  const active = activeWording.test(query);
  const requiredLevel = Math.max(0, ...levels);
  return (passage, section) => {
    const text = cleanText(passage);
    const identified = specific
      ? positiveTermMatch(text, specific) || positiveTermMatch(text.replace(/\bcertified\s*:?\s*/gi, ''), specific)
      : names.length ? names[0].some(name => positiveTermMatch(text, name)) : family[0].test(text);
    if (!identified || expiredOrIncomplete.test(text) || thirdPartyCredential.test(text)) return false;
    const expiryYear = text.match(/\b(?:expir(?:es|ation|y)(?: date)?|valid (?:until|through))\b[^.;]{0,25}\b((?:19|20)\d{2})\b/i)?.[1];
    if (expiryYear && Number(expiryYear) < new Date().getUTCFullYear()) return false;
    return (section === 'education' || section === 'certifications' || holder.test(text)) &&
      (!active || currentStatus.test(text)) &&
      (!requiredLevel || cfaLevels(text).some(level => level >= requiredLevel));
  };
}

export function compileQualifierCheck(query: string): QualifierCheck | undefined {
  const text = numericDurations(cleanText(query));
  if (!text || alternatives.test(text)) return;
  const credentials = namedCredentials.filter(names => names.some(name => termMatches(text, name)));
  const levels = cfaLevels(text);
  if (credentialWording.test(text) || levels.length || credentials.some(names => names.some(name =>
    name.toLowerCase() === text.replace(/[.!?]$/, '').toLowerCase()
  ))) return credentialCheck(text, credentials, levels);

  const platforms = managedPlatforms.filter(names => names.some(name => termMatches(text, name)));
  const tools = catalog.filter(term => (namedTechnologies.has(term.label) || namedApplications.has(term.label)) &&
    namedToolMention(text, term.aliases, termMatches));
  const aliases = platforms.length === 1 ? platforms[0] : platforms.length === 0 && tools.length === 1 ? tools[0].aliases : undefined;
  if (!aliases) return;
  const durations = durationMonths(text);
  if (!durations.length) return passage => cleanText(passage).split(statementBoundary).some(clause => mentionsTool(clause, aliases));
  const requested = toolDurations(text, aliases);
  if (durations.length !== 1 || requested.length !== 1) return;
  return passage => toolDurations(numericDurations(cleanText(passage)), aliases).some(months => months >= requested[0]);
}
