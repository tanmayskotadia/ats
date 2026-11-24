import type { Resume, SectionKey } from './resume.ts';

export interface ResumeFeedback {
  id: string;
  title: string;
  detail: string;
  evidence: string;
  section: SectionKey;
  priority: 'high' | 'medium' | 'low';
}

const bullet = /^(?:[•*▪◦]\s*|-\s+|\d+[.)]\s+)/u;
const weakOpening = /^(?:responsible for|duties (?:included|include)|helped(?: with| to)?|assisted(?: with| in)?|worked on|participated in|involved in)\b/i;
const actionOpening = /^(?:achieved|automated|built|created|delivered|designed|developed|implemented|improved|increased|launched|led|managed|optimized|reduced|supported|maintained|conducted|produced|coordinated|deployed|reviewed|presented|tested|contributed|wrote|oversaw|executed|collaborated|prepared|analyzed|analysed)\b/i;
const relevantSections = new Set(['experience', 'projects', 'volunteer']);
const order = { high: 0, medium: 1, low: 2 };
const normalized = (value: string) => value.replace(bullet, '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '').toLowerCase();
const wordCount = (text: string) => text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;

export function resumeFeedback(resume: Resume): ResumeFeedback[] {
  const findings: ResumeFeedback[] = [];
  const statements = new Set(resume.statements.map(normalized));
  const lines = resume.sections.filter(section => relevantSections.has(section.key))
    .flatMap(section => section.lines.filter(line => bullet.test(line) || statements.has(normalized(line)))
      .map(evidence => ({ evidence, section: section.key, text: evidence.replace(bullet, '').trim() })));
  const occurrences = new Map<string, (typeof lines)[number] & { count: number }>();
  for (const line of lines) {
    const key = normalized(line.text);
    if (!key) continue;
    const existing = occurrences.get(key);
    if (existing) existing.count += 1;
    else occurrences.set(key, { ...line, count: 1 });
  }
  function add(id: string, title: string, detail: string, evidence: string | undefined, section: SectionKey, priority: ResumeFeedback['priority']) {
    if (!evidence || !resume.text.includes(evidence)) return;
    findings.push({ id, title, detail, evidence, section, priority });
  }
  for (const [index, line] of [...occurrences.values()].entries()) {
    const { evidence, section, text, count } = line;
    if (count > 1) {
      add('repeat-' + index, 'Replace a repeated statement',
        `This statement appears ${count} times in the extracted experience, project, or volunteer text. Check for duplicated extraction. If it is repeated in the resume, keep the strongest relevant instance and use the space for distinct evidence.`,
        evidence, section, 'high');
    }
    if (weakOpening.test(text)) {
      add('action-' + index, 'Make your contribution specific',
        'Name the action you personally took, what you worked on, and its purpose or result. Preserve the scope of your contribution when describing work shared with a team.',
        evidence, section, 'medium');
    }
    if (wordCount(text) > 40) {
      add('length-' + index, 'Shorten this statement',
        'Keep the main action and its strongest supporting detail together. Move a separate responsibility or result into another bullet so each statement has one clear focus.',
        evidence, section, 'low');
    }
    if (wordCount(text) < 6 && (actionOpening.test(text) || weakOpening.test(text))) {
      add('detail-' + index, 'Explain what this work involved',
        'Add the relevant task, method, audience, or outcome so a reader can understand the work. Include a measurable result only when you can verify it.',
        evidence, section, 'medium');
    }
  }
  for (const [index, entry] of (resume.profile?.entries ?? []).entries()) {
    if (entry.kind !== 'experience') continue;
    const evidence = entry.evidence.find(line => line.includes(entry.title));
    if (!entry.dates) {
      add('role-dates-' + index, 'Clarify this role’s dates',
        'Check the start and end dates for this role. Put a consistent month and year range beside the title or organization, using Present only for a role you currently hold.',
        evidence, 'experience', 'medium');
    }
    if (!entry.organization) {
      add('role-organization-' + index, 'Check the organization name',
        'An organization was not detected for this role. Confirm the employer, client, or organization is named beside the role title or on the following line.',
        evidence, 'experience', 'low');
    }
  }
  const seen = new Set<string>();
  return findings.sort((first, second) => order[first.priority] - order[second.priority]).filter(item => {
    const key = normalized(item.evidence);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}
