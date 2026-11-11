const headings = {
  summary: 'Summary|Professional Summary|Executive Summary|Career Summary|Profile|Professional Profile|About Me|Objective|Career Objective|Overview|Personal Statement',
  experience: 'Experience|Work Experience|Professional Experience|Employment|Employment History|Work History|Career History|Relevant Experience|Professional Background|Internships|Industry Experience|Selected Experience|Positions Held|Work Experience and Internships',
  education: 'Education|Academic Background|Academic Qualifications|Educational Qualifications|Education and Training|Qualifications|Academic History|Academic Credentials',
  skills: 'Skills|Technical Skills|Core Skills|Core Competencies|Competencies|Skills and Tools|Tools|Technologies|Skills and Technologies|Areas of Expertise|Technical Proficiencies|Technology Stack|Hard Skills|Soft Skills|Technical Expertise|Key Skills|Programming Languages',
  projects: 'Projects|Selected Projects|Personal Projects|Academic Projects|Professional Projects|Project Experience|Portfolio|Key Projects',
  certifications: 'Certifications|Certificates|Licenses|Licenses and Certifications|Certifications and Licenses|Professional Certifications|Training|Professional Development|Courses',
  awards: 'Awards|Honors|Honours|Awards and Honors|Honors and Awards|Achievements|Accomplishments',
  volunteer: 'Volunteer Experience|Volunteering|Community Involvement|Community Service|Activities|Extracurricular Activities|Leadership|Leadership Experience',
  languages: 'Languages|Language Proficiency|Spoken Languages',
  publications: 'Publications|Research|Research and Publications|Patents|Presentations|Conferences',
  interests: 'Interests|Hobbies|Hobbies and Interests',
  contact: 'Contact|Contact Information|Personal Details',
  other: 'Additional Information|Affiliations|Memberships|References',
};

const headingIndex = new Map(Object.entries(headings).flatMap(([key, aliases]) =>
  aliases.split('|').map(alias => [alias.toLowerCase(), key]),
));

export const sectionTitles = {
  summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills',
  projects: 'Projects', certifications: 'Certifications', awards: 'Awards & honors',
  volunteer: 'Volunteering & leadership', languages: 'Languages', publications: 'Research & publications',
  interests: 'Interests', contact: 'Contact', other: 'Additional information',
};

export function cleanText(text) {
  return text.normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00AD\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2022\u2023\u25CF\u25AA\u25E6\uF0B7]/g, '•')
    .replace(/[^\S\n\f]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

const month = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
const year = '(?:19|20)\\d{2}';
const date = `(?:${month}\\s+)?${year}|(?:0?[1-9]|1[0-2])[/.-]${year}`;
const dateRange = new RegExp(`\\b(?:${date})\\s*(?:-|to|through)\\s*(?:Present|Current|Now|${date})\\b`, 'gi');
export const datesIn = text => unique([...text.matchAll(dateRange)].map(match => match[0]));
const emailPattern = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi;
const phonePattern = /(?<![\w@])(?:\+?\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,5})[ .-]?\d{3,4}[ .-]?\d{4}(?:\s*(?:ext\.?|x)\s*\d{1,5})?(?![\w.])/gi;
const linkPattern = /\b(?:(?:https?:\/\/|www\.)[^\s<>,;|]+|(?:linkedin\.com\/in|github\.com|gitlab\.com|behance\.net|dribbble\.com)\/[^\s<>,;|]+)/gi;
const bulletPattern = /^(?:[•*▪◦]\s*|-\s+|\d+[.)]\s+)/u;
const actionPattern = /^(?:Achieved|Automated|Built|Collaborated|Created|Delivered|Designed|Developed|Directed|Drove|Established|Expanded|Implemented|Improved|Increased|Integrated|Launched|Led|Managed|Mentored|Migrated|Negotiated|Optimized|Organized|Owned|Partnered|Reduced|Resolved|Saved|Shipped|Spearheaded|Streamlined|Supported|Trained|Transformed|Analyzed|Analysed|Prepared|Helped|Maintained|Conducted|Produced|Coordinated|Documented|Engineered|Deployed|Reviewed|Presented|Tested|Initiated|Contributed|Wrote|Oversaw|Executed)\b/i;
const numberPattern = /(?:[$€£₹]\s*\d|\d[\d,.]*\s*(?:%|×|x\b|k\b|m\b|million\b|billion\b)|\b\d[\d,.]*\s+(?:(?:operations|support|internal|external|active|new|monthly|weekly|annual|daily|production|enterprise|regional|cross-functional|customer|business)\s+){0,2}(?:users?|clients?|customers?|hours?|days?|weeks?|months?|seconds?|teams?|projects?|reports?|transactions?|countries|markets?|employees?|requests?|tickets?|services?|accounts?|students?|sites?|members?|records?|locations?|points?|engineers?|managers?|dashboards?|orders?|shipments?|products?|devices?|stakeholders?|deployments?|campaigns?|dollars?)\b)/i;

function matchHeading(line) {
  const [label, ...rest] = line.replace(/^[\s#]+|[\s:]+$/g, '').split(':');
  const normalized = label.toLowerCase().replace(/\s*&\s*/g, ' and ').trim();
  const key = headingIndex.get(normalized);
  if (key) return { key, label, inline: rest.join(':').trim() };
  if (line.length < 45 && /^[A-Z][A-Z &/()]{4,}$/.test(line) && !/^(?:[A-Z]+ ){0,2}[A-Z]+ (?:INC|LLC|LTD)$/.test(line)) {
    return { key: 'other', label: line, inline: '' };
  }
  return null;
}

export function unique(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function plausibleName(line) {
  if (line.length > 65 || headingIndex.has(line.toLowerCase())) return false;
  if (/^(?:resume|curriculum vitae|cv|contact|email|phone)\b/i.test(line)) return false;
  if (/\b(?:developer|engineer|manager|analyst|designer|specialist|consultant|student|writer|scientist|director|architect|intern|associate|professional|accountant|assistant|lead|administrator|executive|teacher|coordinator)\b/i.test(line)) return false;
  return /^[\p{L}\p{M}][\p{L}\p{M}.'-]*(?: [\p{L}\p{M}][\p{L}\p{M}.'-]*){1,4}$/u.test(line);
}

function extractContact(text, headerLines, embeddedLinks) {
  const linkedEmails = embeddedLinks.filter(link => /^mailto:/i.test(link))
    .flatMap(link => [...link.split('?')[0].slice(7).matchAll(emailPattern)].map(match => match[0]));
  const email = unique([...text.matchAll(emailPattern)].map(match => match[0]).concat(linkedEmails));
  const header = headerLines.join('\n');
  const contactText = header || text.split('\n').slice(0, 8).join('\n');
  const phone = unique([...contactText.replace(dateRange, '').replace(linkPattern, '').replace(emailPattern, '').matchAll(phonePattern)]
    .map(match => match[0].trim())
    .filter(value => {
      const digits = value.replace(/\D/g, '');
      return digits.length >= 8 && digits.length <= 18;
    }));
  const links = unique([...text.matchAll(linkPattern)].map(match => match[0].replace(/[.)\]}]+$/g, '')).concat(embeddedLinks));
  const candidates = headerLines.slice(0, 6).map(line => line.split(/\s[|•]\s/)[0].trim());
  const name = candidates.find(plausibleName) || '';
  const title = candidates.find(line => line !== name && line.length < 95 &&
    /\b(?:developer|engineer|manager|analyst|designer|specialist|consultant|student|writer|scientist|director|architect|intern|associate|accountant|assistant|lead|administrator|executive|teacher|coordinator)\b/i.test(line) &&
    !/[@|]/.test(line)) || '';
  const location = contactText.split(/[\n|•]/).map(line => line.trim()).find(line => {
    if (line === name || line === title || line.length > 75) return false;
    return /^(?:location|based in):\s*\S/i.test(line) ||
      /^[\p{L} .'-]+,\s*[\p{L} .'-]+(?:\s+[\d-]+)?$/u.test(line);
  })?.replace(/^(?:location|based in):\s*/i, '') || '';
  return { name, title, email, phone, location, links };
}

function resumeStatements(lines) {
  const statements = [];
  for (const line of lines) {
    const content = line.replace(bulletPattern, '');
    if (bulletPattern.test(line) || actionPattern.test(content)) {
      statements.push(content);
    } else if (statements.length && /^[a-z]/.test(content) && content.split(/\s+/).length >= 4) {
      statements[statements.length - 1] += ' ' + content;
    }
  }
  return statements;
}

export function parseResume(text, metadata = {}) {
  const normalized = cleanText(text);
  const lines = normalized.split(/[\n\f]/).map(line => line.trim());
  const sections = [];
  const header = [];
  let current;
  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    const heading = matchHeading(line);
    const knownHeading = heading && headingIndex.has(heading.label.toLowerCase().replace(/\s*&\s*/g, ' and '));
    const isHeading = heading && (knownHeading || (index > 1 && !lines[index - 1] && !plausibleName(line)));
    if (isHeading) {
      current = { key: heading.key, label: heading.label, lines: heading.inline ? [heading.inline] : [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      header.push(line);
    }
  }
  const byKey = key => sections.filter(section => section.key === key).flatMap(section => section.lines);
  const contact = extractContact(normalized, [...header, ...byKey('contact')], metadata.links ?? []);
  const skills = unique(byKey('skills').flatMap(line => line
    .replace(bulletPattern, '')
    .replace(/^[^:]{1,38}:\s+/, '')
    .split(/\s*[,;|•]\s*|\s{2,}/)
    .map(skill => skill.trim())
    .filter(Boolean)));
  const statements = resumeStatements([...byKey('experience'), ...byKey('projects')]);
  return {
    text: normalized,
    extractedText: text.trim(),
    contact,
    sections,
    header,
    skills,
    statements,
    actionStatements: statements.filter(line => actionPattern.test(line)),
    quantifiedStatements: statements.filter(line => numberPattern.test(line)),
    dates: datesIn(normalized),
    experienceDates: datesIn(byKey('experience').join('\n')),
    wordCount: normalized.match(/[\p{L}\p{N}][\p{L}\p{N}+#'.-]*/gu)?.length ?? 0,
    metadata,
  };
}
