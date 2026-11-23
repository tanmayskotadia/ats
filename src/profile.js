const roleWords = /\b(?:engineer|developer|analyst|designer|manager|director|specialist|consultant|intern|associate|accountant|assistant|lead|administrator|executive|teacher|coordinator|researcher|scientist|architect|officer|nurse|technician|writer|editor|supervisor|founder|president)\b/i;
const degreeWords = /\b(?:bachelor|master|doctor|diploma|certificate|university|college|school|B\.?Sc|M\.?Sc|B\.?S\.?|M\.?S\.?|B\.?Tech|M\.?Tech|MBA|Ph\.?D)\b/i;
const qualificationWords = /\b(?:bachelor|master|doctor|diploma|certificate|B\.?Sc|M\.?Sc|B\.?S\.?|M\.?S\.?|B\.?Tech|M\.?Tech|MBA|Ph\.?D)\b/i;
const descriptionStart = /^(?:[•*▪◦-]\s+|\d+[.)]\s+|(?:achieved|automated|built|created|delivered|designed|developed|directed|drove|established|implemented|improved|increased|launched|led|managed|optimized|reduced|supported|responsible|helped|maintained|conducted|produced|coordinated|deployed|reviewed|presented|tested|contributed|wrote|oversaw|executed|collaborated|worked|prepared|assisted|analyzed|analysed)\b)/i;
const sectionKinds = { experience: 'experience', education: 'education', projects: 'project', certifications: 'credential', volunteer: 'volunteer', publications: 'publication', awards: 'award' };
const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const datePart = '(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?\\s+(?:19|20)\\d{2}|(?:0?[1-9]|1[0-2])[/.-](?:19|20)\\d{2}|(?:19|20)\\d{2}(?:-(?:0[1-9]|1[0-2]))?)';
const rangePattern = new RegExp(`\\b(${datePart})\\s*(?:-|to|through)\\s*(Present|Current|Now|${datePart})\\b`, 'i');
const singleDatePattern = new RegExp(`\\b${datePart}\\b`, 'gi');
const standaloneDatePattern = new RegExp(`^(?:(?:issued|completed|graduated|graduation|expected|earned|awarded|expires?)\\s*[:,-]?\\s*)?${datePart}[.,]?$`, 'i');
const institutionWords = /\b(?:university|college|institute|school|academy|polytechnic)\b/i;
const negativeSkill = /\b(?:(?:no|without)\s+(?:(?:prior|professional|working|hands-on)\s+)?(?:experience|knowledge|proficiency|expertise|exposure)|lack(?:s|ing)?\s+(?:experience|knowledge|proficiency|expertise)|not\s+(?:experienced|proficient|familiar)|never\s+(?:used|worked))\b/i;
const shortHeader = line => line.length <= 180 && !descriptionStart.test(line);
const distinct = items => [...new Set(items)];
export const isPositiveSkill = label => !negativeSkill.test(label);

function academicHeader(lines, index, kind) {
  const line = lines[index];
  if (kind === 'education' && !degreeWords.test(line) && !institutionWords.test(line)) return null;
  if (standaloneDatePattern.test(line)) return null;
  const header = [line];
  const next = lines[index + 1];
  const third = lines[index + 2];
  if (next && shortHeader(next) && !standaloneDatePattern.test(next)) {
    const complementaryEducation = kind === 'education' &&
      ((institutionWords.test(line) && !qualificationWords.test(line) && qualificationWords.test(next)) ||
       (qualificationWords.test(line) && institutionWords.test(next) && !qualificationWords.test(next)));
    const datedCredential = kind === 'credential' && third && standaloneDatePattern.test(third);
    if (complementaryEducation || datedCredential) header.push(next);
  }
  const dateLine = lines[index + header.length];
  if (dateLine && (standaloneDatePattern.test(dateLine) || rangePattern.test(dateLine))) header.push(dateLine);
  return header;
}

function headerAt(lines, index, kind) {
  const line = lines[index];
  if (!shortHeader(line)) return null;
  if (kind === 'education' || kind === 'credential') return academicHeader(lines, index, kind);
  const candidates = [];
  for (let offset = 0; offset < 3 && index + offset < lines.length; offset += 1) {
    const candidate = lines[index + offset];
    if (!shortHeader(candidate)) break;
    candidates.push(candidate);
    if (rangePattern.test(candidate)) return candidates;
  }
  if (kind === 'experience' || kind === 'volunteer') {
    if (!roleWords.test(line)) return null;
    const next = lines[index + 1];
    return next && shortHeader(next) && !roleWords.test(next) ? [line, next] : [line];
  }
  return [line];
}

function fieldsFromHeader(header, kind) {
  const evidence = [...header];
  const range = header.map(line => line.match(rangePattern)?.[0]).find(Boolean);
  const completionDate = ['education', 'credential'].includes(kind) ? header.join(' ').match(singleDatePattern)?.at(-1) : '';
  const dates = range || completionDate || '';
  const parts = header.flatMap(line => line.replace(dates, '').split(/\s*\|\s*|\s+@\s+|\s+at\s+/i))
    .map(part => part.trim().replace(/^(?:issued|completed|graduated|graduation|expected|earned|awarded)\s*[:,-]?\s*$/i, '')
      .replace(/^[,;\s-]+|[,;\s-]+$/g, ''))
    .filter(Boolean);
  const fieldPattern = kind === 'education' ? qualificationWords : roleWords;
  const title = parts.find(part => fieldPattern.test(part)) || parts[0] || '';
  const organization = ['experience', 'education', 'volunteer', 'credential'].includes(kind) ? parts.find(part => part !== title) || '' : '';
  return { kind, title, organization, dates, evidence, source: 'local' };
}

function sectionEntries(section) {
  const kind = sectionKinds[section.key];
  if (!kind) return [];
  const entries = [];
  let entry;
  let hasDescription = false;
  for (let index = 0; index < section.lines.length; index += 1) {
    const header = headerAt(section.lines, index, kind);
    if (header && (!entry || hasDescription || header.some(line => rangePattern.test(line)) || kind === 'education' || kind === 'credential' || kind === 'award' || kind === 'publication')) {
      const next = fieldsFromHeader(header, kind);
      if (next.title) {
        entry = next;
        entries.push(entry);
        hasDescription = false;
        index += header.length - 1;
        continue;
      }
    }
    if (entry) {
      entry.evidence.push(section.lines[index]);
      hasDescription ||= descriptionStart.test(section.lines[index]);
    }
  }
  return entries;
}

function monthValue(value, today) {
  if (/^(?:present|current|now)$/i.test(value)) return { value: today.getFullYear() * 12 + today.getMonth(), precision: 'month' };
  const year = Number(value.match(/(?:19|20)\d{2}/)?.[0]);
  if (!year) return null;
  const word = value.match(/[a-z]+/i)?.[0].slice(0, 3).toLowerCase();
  const numeric = value.match(/^(\d{1,2})[/.-]\d{4}$/)?.[1] || value.match(/^\d{4}-(\d{2})$/)?.[1];
  const month = word ? monthNames.indexOf(word) : numeric ? Number(numeric) - 1 : -1;
  return { value: year * 12 + Math.max(0, month), precision: month < 0 ? 'year' : 'month' };
}

export function summarizeExperience(entries, today = new Date()) {
  const roles = entries.filter(entry => entry.kind === 'experience');
  const intervals = [];
  let uncertainDates = 0;
  let undatedRoles = 0;
  let invalidDates = 0;
  for (const entry of roles) {
    const range = entry.dates.match(rangePattern);
    if (!range) { undatedRoles += 1; continue; }
    const start = monthValue(range[1], today);
    const end = monthValue(range[2], today);
    const currentMonth = today.getFullYear() * 12 + today.getMonth();
    if (!start || !end || end.value < start.value || start.value > currentMonth || end.value > currentMonth) {
      invalidDates += 1;
      continue;
    }
    if (start.precision === 'year' || end.precision === 'year') {
      uncertainDates += 1;
      continue;
    }
    intervals.push([start.value, end.value + 1]);
  }
  intervals.sort((first, second) => first[0] - second[0]);
  const merged = [];
  for (const interval of intervals) {
    const prior = merged.at(-1);
    if (prior && interval[0] <= prior[1]) prior[1] = Math.max(prior[1], interval[1]);
    else merged.push([...interval]);
  }
  const months = merged.reduce((total, [start, end]) => total + end - start, 0);
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const duration = [years ? `${years} year${years === 1 ? '' : 's'}` : '', remainder ? `${remainder} month${remainder === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ');
  const notes = ['Uses calendar months from explicit employment ranges and merges overlapping roles.'];
  if (uncertainDates) notes.push(`${uncertainDates} role(s) have year-only dates and are excluded from the month total.`);
  if (undatedRoles) notes.push(`${undatedRoles} role(s) have no recognized date range.`);
  if (invalidDates) notes.push(`${invalidDates} role(s) have reversed or future date ranges and are excluded.`);
  return { months, label: duration || 'No month-level employment dates detected', datedRoles: intervals.length, undatedRoles, uncertainDates, invalidDates, notes };
}

export function buildProfile(resume) {
  const entries = resume.sections.flatMap(sectionEntries);
  const skillSections = resume.sections.filter(section => section.key === 'skills');
  const skills = resume.skills.filter(isPositiveSkill).map(label => {
    const section = skillSections.find(section => section.lines.some(line => line.includes(label)));
    const evidence = section?.lines.find(line => line.includes(label)) || '';
    const assertion = evidence.split(/[,;|•]/).find(part => part.includes(label)) || label;
    return { label, evidence: negativeSkill.test(assertion) ? '' : evidence, section: section?.label || 'Skills' };
  }).filter(item => item.evidence);
  const experience = summarizeExperience(entries);
  const issues = [];
  const roleTitles = entries.filter(entry => entry.kind === 'experience').map(entry => entry.title);
  if (experience.uncertainDates) issues.push({ title: 'Add months to employment dates', detail: 'Month and year ranges allow the reader to interpret employment duration more accurately.', evidence: entries.filter(entry => entry.kind === 'experience' && entry.dates && /^\d{4}/.test(entry.dates)).map(entry => entry.dates).join('; ') });
  if (experience.undatedRoles) issues.push({ title: 'Check employment dates', detail: 'Some detected roles have no recognizable date range. Use a consistent month and year format.', evidence: distinct(roleTitles).join('; ') });
  if (experience.invalidDates) issues.push({ title: 'Review date order', detail: 'Some employment dates are reversed or extend into the future. Confirm them against the original resume.', evidence: entries.filter(entry => entry.kind === 'experience').map(entry => entry.dates).join('; ') });
  return { entries, skills, experience, issues };
}
