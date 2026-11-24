import { cleanText, unique } from './resume.ts';
import type { Resume } from './resume.ts';
import { summarizeExperience } from './profile.ts';
import type { SkillEvidence } from './profile.ts';
import { jobCriteriaLines, evidenceLevel, quoteEvidenceLevel } from './job-match.ts';
import type { EvidenceLevel } from './job-match.ts';
import { impactSignals, wordsIn } from './scoring-signals.ts';

export interface JobRequirement {
  label: string;
  evidence: string;
  preferred?: boolean;
  jobEvidence?: string;
}

interface JobMatch extends JobRequirement, EvidenceLevel {
  reason?: string;
}

interface KeywordComparison {
  provided: boolean;
  matched: JobMatch[];
  missing: JobMatch[];
  total: number;
  ratio: number;
  evidenceRatio?: number;
  semantic?: boolean;
}

interface ScoreCheck {
  id: string;
  title: string;
  points: number;
  max: number;
  advice: string;
  evidence: string;
}

interface ScoreCategory {
  id: 'readability' | 'structure' | 'impact' | 'keywords' | 'content';
  title: string;
  icon: 'scan-line' | 'layout-list' | 'chart-no-axes-column-increasing' | 'target';
  checks: ScoreCheck[];
}

export type ScoreResult = ReturnType<typeof scoreResume>;

const groups = [
  'JavaScript=JS|TypeScript=TS|Python|Java|C#|C++|C|Go=Golang|Rust|Ruby|PHP|Swift|Kotlin|Scala|R|MATLAB|SQL|HTML|CSS|Bash|PowerShell|VBA',
  'React=React.js,ReactJS|Vue=Vue.js,VueJS|Angular|Next.js=NextJS|Node.js=NodeJS|Express.js=ExpressJS|Django|Flask|FastAPI|Spring Boot|.NET=dotnet|REST APIs=REST API,RESTful APIs|GraphQL|Microservices|System design|Distributed systems|Web accessibility=WCAG|Responsive design',
  'Git|GitHub|GitLab|Docker|Kubernetes=K8s|Terraform|Ansible|Jenkins|GitHub Actions|CI/CD=continuous integration and delivery,continuous integration and deployment|Linux|AWS=Amazon Web Services|Azure=Microsoft Azure|Google Cloud=GCP,Google Cloud Platform|PostgreSQL=Postgres|MySQL|MongoDB|Redis|Kafka|Snowflake|Databricks|Airflow|ETL|Data pipelines|Data warehousing',
  'Excel=Microsoft Excel,MS Excel|Power BI=PowerBI|Tableau|Looker|Data analysis=Data analytics|Data visualization|Statistics|A/B testing=AB testing,split testing|Machine learning=ML|Deep learning|Natural language processing=NLP|Computer vision|Generative AI=GenAI|Large language models=LLM,LLMs|PyTorch|TensorFlow|Pandas|NumPy|scikit-learn=sklearn|Data modeling',
  'Unit testing|Integration testing|Automated testing=Test automation|QA=Quality assurance|Selenium|Playwright|Cypress|Jest|Cybersecurity|Penetration testing|Incident response|Risk assessment|SOC 2=SOC2|HIPAA|GDPR|Network security|Vulnerability management',
  'Agile|Scrum|Kanban|Jira|Confluence|Project management|Program management|Product management|Product strategy|Roadmapping=Product roadmap|Stakeholder management|Requirements gathering|Budget management|Change management|Process improvement|Operations management|Vendor management|Supply chain|Inventory management|Logistics|Lean Six Sigma|PMP|OKRs',
  'Figma|Sketch|Adobe Photoshop=Photoshop|Adobe Illustrator=Illustrator|Adobe InDesign=InDesign|User research=UX research|Usability testing|Prototyping|Wireframing|Design systems|User experience=UX design|UI design=User interface design|Interaction design|Accessibility|Visual design|Content design',
  'Digital marketing|Content marketing|Email marketing|SEO=Search engine optimization|SEM=Search engine marketing|Google Ads|Google Analytics=GA4|Paid media|Social media|Copywriting|Brand strategy|Market research|Campaign management|Lead generation|Salesforce|HubSpot|CRM=Customer relationship management|Account management|Business development|Customer success|Customer service|Sales enablement|Negotiation|B2B|B2C',
  'Financial modeling|Financial analysis|Financial reporting|Accounting|Bookkeeping|GAAP|IFRS|Auditing|Reconciliation|Payroll|Accounts payable|Accounts receivable|Forecasting|Budgeting|QuickBooks|SAP|Oracle|FP&A=Financial planning and analysis|Tax preparation|Compliance|CPA|CFA|Recruitment|Talent acquisition|Onboarding|Employee relations|Performance management|HRIS|Workday|Training and development',
  'Patient care|Electronic health records=EHR,EMR|Clinical research|Medical coding|CPR|BLS=Basic life support|ACLS=Advanced cardiovascular life support|Nursing|Care coordination|Phlebotomy|Triage|Public health|Lesson planning|Curriculum development|Classroom management|Instructional design|Special education|Learning management systems=LMS|AutoCAD|SolidWorks|CAD|BIM|Revit|Quality control|Manufacturing|PLC|Safety training',
];
const catalog = groups.flatMap(group => group.split('|')).map(entry => {
  const [label, aliases = ''] = entry.split('=');
  return { label, aliases: unique([label, ...aliases.split(',').filter(Boolean)]) };
});
const namedTechnologies = new Set(groups.slice(0, 4).flatMap(group => group.split('|').map(entry => entry.split('=')[0])));
for (const concept of ['REST APIs', 'Microservices', 'System design', 'Distributed systems', 'Web accessibility', 'Responsive design', 'Data pipelines', 'Data warehousing', 'Data analysis', 'Data visualization', 'Statistics', 'A/B testing', 'Machine learning', 'Deep learning', 'Natural language processing', 'Computer vision', 'Generative AI', 'Large language models', 'Data modeling']) {
  namedTechnologies.delete(concept);
}
const stopTerms = /^(?:strong|excellent|preferred|required|qualifications?|skills?|experience|years?|degree|knowledge|proficiency|team player|and|or|ability to work|other duties)$/i;
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keywordForm = (value: string) => cleanText(value).replace(/\s+/g, ' ');

function termPattern(term: string) {
  const normalized = keywordForm(term);
  const pattern = escapePattern(normalized).replace(/ /g, '[\\s-]+');
  const exactCase = /^(?:C|R|Go|ML|TS|JS|QA|CAD|BIM|SEM|CPA|CFA|PMP)$/.test(normalized);
  return new RegExp(`(?<![\\p{L}\\p{N}+#])${pattern}(?![\\p{L}\\p{N}+#])`, exactCase ? 'gu' : 'giu');
}

export function termMatches(text: string, term: string) {
  return termPattern(term).test(text);
}

// Keep the scope of a denial local to its clause, including comma-separated skill lists.
export function positiveTermMatch(text: string, term: string) {
  return [...text.matchAll(termPattern(term))].some(match => {
    const index = match.index;
    const before = (text.slice(0, index).split(/[.!?;\n]|\b(?:but|however|although|yet)\b/i).at(-1) ?? '').slice(-110);
    const after = text.slice(index + match[0].length, index + match[0].length + 80);
    const deniedBefore = /\b(?:(?:no|without)\s+(?:(?:prior|professional|hands-on|working|practical|commercial|direct)\s+)?(?:experience|knowledge|proficiency|familiarity|skills?|background|expertise|training|exposure)\b|(?:never|not)\s+(?:used|worked|trained|proficient|experienced|familiar|skilled|certified|knowledgeable|qualified)\b|(?:lack|lacks|lacking|unfamiliar|inexperienced)\b)[^.!?;\n]{0,80}$/i.test(before) ||
      /\b(?:no|without(?:\s+using)?)\s*$/i.test(before);
    const deniedAfter = /^\s*[(:]?\s*(?:(?:experience|skills?|knowledge|certification)\s*)?(?:(?:is|are|was|were|:)\s*)?(?:none\b|no\s+(?:experience|knowledge)\b|unfamiliar\b|not\s+(?:required|used|known|held|earned|completed|available|proficient|familiar|experienced|skilled|certified)\b)/i.test(after);
    return !deniedBefore && !deniedAfter;
  });
}

export function compareKeywords(resume: Resume, job: string): KeywordComparison {
  const description = cleanText(job);
  if (!description) return { provided: false, matched: [], missing: [], total: 0, ratio: 0 };
  const criteria = jobCriteriaLines(description);
  const jobLines = criteria.map(item => item.text);
  const relevantText = jobLines.join('\n');
  const terms = catalog.filter(term => term.aliases.some(alias => positiveTermMatch(relevantText, alias)));
  const explicit: string[] = [];
  let inSkillList = false;
  for (const line of description.split('\n').map(value => value.trim())) {
    const label = line.match(/^(?:(?:required|preferred|technical|core|key)\s+)?(?:skills|tools|technologies|keywords|tech stack)\s*:\s*(.*)$/i);
    const bullet = line.match(/^(?:[•*-]\s*|\d+[.)]\s+)(.+)$/);
    if (label) {
      inSkillList = !label[1];
      if (label[1]) explicit.push(...label[1].split(/[,;|•]/));
    } else if (inSkillList && bullet) {
      explicit.push(...bullet[1].split(/[,;|•]/));
    } else if (line) {
      inSkillList = false;
    }
    explicit.push(...[...line.matchAll(/["“]([^"”]{2,45})["”]/g)].map(match => match[1]));
  }
  for (const label of unique(explicit.map(value => value.trim().replace(/[.!]$/, '')).filter(Boolean))) {
    if (label.length > 45 || label.split(/\s+/).length > 5 || stopTerms.test(label) || !/\p{L}/u.test(label)) continue;
    if (!positiveTermMatch(relevantText, label)) continue;
    if (!terms.some(term => term.aliases.some(alias => termMatches(label, alias)))) terms.push({ label, aliases: [label] });
  }
  const requiredText = keywordForm(criteria.filter(item => !item.preferred).map(item => item.text).join(' '));
  const preferredText = keywordForm(criteria.filter(item => item.preferred).map(item => item.text).join(' '));
  const sortedTerms = terms.map<JobMatch>(term => {
    const preferredOnly = !term.aliases.some(alias => positiveTermMatch(requiredText, alias)) &&
      term.aliases.some(alias => positiveTermMatch(preferredText, alias));
    const support = evidenceLevel(resume, term.label, term.aliases, positiveTermMatch);
    const durationCriterion = criteria.flatMap(item => item.text.split(/[,;]|\band\b/i))
      .find(text => durationMonths(text).length && term.aliases.some(alias => termMatches(text, alias)));
    if (durationCriterion) {
      const requested = Math.max(...durationMonths(durationCriterion));
      const explicit = resume.sections.filter(section => ['experience', 'summary', 'skills'].includes(section.key)).flatMap(section => section.lines).find(line =>
        term.aliases.some(alias => positiveTermMatch(line, alias)) && durationForTerm(line, term.aliases).some(months => months >= requested));
      const datedRoles = (resume.profile?.entries || []).filter(entry => entry.kind === 'experience' &&
        entry.evidence.some(line => term.aliases.some(alias => positiveTermMatch(line, alias))) &&
        !entry.evidence.some(line => term.aliases.some(alias => positiveTermMatch(line, alias)) && durationMonths(line).length));
      const timeline = summarizeExperience(datedRoles);
      if (!explicit && timeline.months < requested) {
        return { label: term.label, preferred: preferredOnly, evidence: '', kind: 'missing', credit: 0,
          reason: `The posting asks for ${requested} months. Sufficient duration with this skill was not found.`, jobEvidence: durationCriterion.trim() };
      }
      if (explicit) Object.assign(support, quoteEvidenceLevel(resume, explicit));
    }
    return { label: term.label, preferred: preferredOnly, ...support };
  }).sort((first, second) => Number(first.preferred) - Number(second.preferred) || first.label.localeCompare(second.label));
  return summarizeMatches(sortedTerms);
}

export function skillEvidence(resume: Resume): SkillEvidence[] {
  const sections = resume.sections.filter(section => !['contact', 'interests', 'languages'].includes(section.key));
  const detected = catalog.flatMap(term => {
    for (const section of sections) {
      const evidence = section.lines.find(line => term.aliases.some(alias => positiveTermMatch(line, alias)));
      if (evidence) return [{ label: term.label, evidence, section: section.label }];
    }
    return [];
  });
  const seen = new Set<string>();
  return [...detected, ...resume.profile.skills].filter(item => {
    const label = item.label.toLowerCase();
    const canonical = catalog.find(term => term.aliases.some(alias => alias.toLowerCase() === label));
    const key = canonical?.label.toLowerCase() || label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeMatches(terms: JobMatch[]): KeywordComparison {
  const matched = terms.filter(term => term.evidence);
  const missing = terms.filter(term => !term.evidence);
  const weight = (list: JobMatch[]) => list.reduce((total, term) => total + (term.preferred ? 1 : 2), 0);
  const denominator = weight(terms);
  const supported = terms.reduce((total, term) => total + (term.preferred ? 1 : 2) * (term.credit ?? 0), 0);
  return { provided: true, matched, missing, total: terms.length, ratio: denominator ? weight(matched) / denominator : 0,
    evidenceRatio: denominator ? supported / denominator : 0 };
}

const evidenceForm = (text: string) => cleanText(text).replace(/\s+/g, ' ').toLowerCase();
const credentialFamilies = [
  /\b(?:bachelor(?:'s)?|b\.?s\.?c?\.?|b\.?a\.?)\b/i,
  /\b(?:master(?:'s)?|m\.?s\.?c?\.?|m\.?a\.?|mba)\b/i,
  /\b(?:doctorate|ph\.?d\.?)\b/i,
  /\bPMP\b/i, /\bCPA\b/i, /\bCFA\b/i, /\bRN\b/i,
];

export function durationMonths(text: string) {
  return [...text.matchAll(/\b(?:(\d+(?:\.\d+)?)\s*(?:-|to)\s*)?(\d+(?:\.\d+)?)\+?\s*(years?|months?)\b/gi)]
    .map(match => Number(match[1] || match[2]) * (/^year/i.test(match[3]) ? 12 : 1));
}

function durationForTerm(text: string, aliases: string[]) {
  const durations = durationMonths(text);
  if (durations.length <= 1) return durations;
  return text.split(/[,;]|\band\b/i)
    .filter(clause => aliases.some(alias => termMatches(clause, alias)))
    .flatMap(durationMonths);
}

export function cfaLevels(text: string) {
  const roman: Partial<Record<string, number>> = { i: 1, ii: 2, iii: 3 };
  return [...text.matchAll(/\bCFA\b[^.!?;\n]{0,30}?\blevel\s*(I{1,3}|[1-3])\b/gi)]
    .map(match => roman[match[1].toLowerCase()] || Number(match[1]));
}

export { catalog, namedTechnologies, credentialFamilies };

function verifiedRequirements(resume: Resume, job: string, requirements: readonly JobRequirement[]): JobMatch[] {
  const source = evidenceForm(resume.text);
  const criteria = jobCriteriaLines(cleanText(job));
  const posting = evidenceForm(criteria.map(item => item.text).join(' '));
  const seen = new Set<string>();
  return requirements.filter(item => {
    const label = evidenceForm(item.label || '');
    if (!label || seen.has(label) || !posting.includes(evidenceForm(item.jobEvidence || item.label))) return false;
    seen.add(label);
    return true;
  }).map(item => {
    const evidence = item.evidence || '';
    const present = evidenceForm(evidence).length >= 3 && source.includes(evidenceForm(evidence));
    const duration = durationMonths(item.label + ' ' + (item.jobEvidence || ''));
    const observed = durationMonths(evidence);
    const explicitTerms = catalog.filter(term => term.aliases.some(alias => termMatches(item.label, alias)));
    const durationTools = explicitTerms.filter(term => namedTechnologies.has(term.label));
    const durationSupported = !duration.length || (durationTools.length ? durationTools.every(term => {
      const requested = durationForTerm(item.label + ' ' + (item.jobEvidence || ''), term.aliases);
      return term.aliases.some(alias => positiveTermMatch(evidence, alias)) &&
        durationForTerm(evidence, term.aliases).some(months => months >= Math.max(...(requested.length ? requested : duration)));
    }) : observed.some(months => months >= Math.max(...duration)));
    const credentials = credentialFamilies.filter(pattern => pattern.test(item.label));
    const credentialLanguage = /\b(?:certified|certification|certificate|licen[cs]e|licen[cs]ed)\b/i;
    const needsCredential = credentials.length > 0 || credentialLanguage.test(item.label);
    const credentialWords = credentialLanguage.test(item.label) ? (item.label.match(/[\p{L}\p{N}]+/gu) || [])
      .filter(word => !/^(?:valid|active|current|certified|certification|certificate|licen[cs]e|licen[cs]ed|required|preferred|with|and|the|a|an|in|of)$/i.test(word)) : [];
    const requiredLevels = cfaLevels(item.label);
    const observedLevels = cfaLevels(evidence);
    const credentialSupported = credentials.every(pattern => pattern.test(evidence)) &&
      (!requiredLevels.length || observedLevels.some(level => level >= Math.max(...requiredLevels))) &&
      (!credentialLanguage.test(item.label) || credentialLanguage.test(evidence) && credentialWords.every(word => positiveTermMatch(evidence, word))) &&
      (!needsCredential || !/\b(?:pursuing|preparing|studying|study|working toward|candidate|expected|in progress|planned|exam scheduled)\b/i.test(evidence));
    const denied = explicitTerms.some(term => term.aliases.some(alias => termMatches(evidence, alias)) &&
      !term.aliases.some(alias => positiveTermMatch(evidence, alias)));
    const valid = present && durationSupported && credentialSupported && !denied;
    const support: Pick<EvidenceLevel, 'kind' | 'credit'> = valid ?
      quoteEvidenceLevel(resume, evidence) : { kind: 'missing', credit: 0 };
    const mentions = criteria.filter(line => evidenceForm(line.text).includes(evidenceForm(item.jobEvidence || item.label)));
    return { ...item, preferred: mentions.length ? mentions.every(line => line.preferred) : Boolean(item.preferred),
      evidence: valid && support.credit > 0 ? evidence : '', kind: support.kind, credit: support.credit };
  });
}

function roleStructure(resume: Resume, signals: ReturnType<typeof impactSignals>) {
  const roles = resume.profile.entries.filter(entry => entry.kind === 'experience');
  if (roles.length) {
    const fields = roles.reduce((total, entry) => {
      const timeline = summarizeExperience([entry]);
      const dated = timeline.datedRoles + timeline.uncertainDates > 0;
      return total + (entry.title ? 3 : 0) + (entry.organization ? 2 : 0) + (dated ? 4 : 0);
    }, 0);
    const timeline = summarizeExperience(roles);
    return { points: Math.round(fields / roles.length),
      evidence: `${roles.length} roles, ${roles.filter(entry => entry.organization).length} organizations, ${timeline.datedRoles + timeline.uncertainDates} valid date ranges. ${timeline.invalidDates} invalid and ${timeline.undatedRoles} missing ranges.` };
  }
  const projects = resume.profile.entries.filter(entry => entry.kind === 'project');
  const supported = projects.filter(entry => signals.detailed.some(text => entry.evidence.some(line => line.includes(text))));
  return { points: projects.length ? Math.round(3 + 6 * supported.length / projects.length) : 0,
    evidence: `${supported.length} of ${projects.length} projects have specific work descriptions. Projects provide an alternative when employment is absent.` };
}

export function scoreResume(resume: Resume, job = '', requirements: readonly JobRequirement[] = []) {
  const { contact, sections, wordCount, metadata } = resume;
  const signals = impactSignals(resume);
  const local = compareKeywords(resume, job);
  const grounded = verifiedRequirements(resume, job, requirements);
  const extraTerms = [...local.matched, ...local.missing].filter(term => {
    const aliases = catalog.find(item => item.label === term.label)?.aliases || [term.label];
    return !grounded.some(item => aliases.some(alias => termMatches(item.label, alias)));
  });
  const keywords = grounded.length ? { ...summarizeMatches([...grounded, ...extraTerms]), semantic: true } : local;
  const specificSkills = skillEvidence(resume).filter(item => item.label.length <= 60 && wordsIn(item.label).length <= 5 &&
    !/^(?:excellent|strong|good|hardworking|team player|motivated|skills|competencies|proficient)$/i.test(item.label));
  const skillSupport = specificSkills.map(item => evidenceLevel(resume, item.label,
    catalog.find(term => term.label === item.label)?.aliases || [item.label], positiveTermMatch));
  const skillSections = sections.filter(section => section.key === 'skills');
  const listedSkills = specificSkills.filter(item => evidenceLevel({ sections: skillSections }, item.label,
    catalog.find(term => term.label === item.label)?.aliases || [item.label], positiveTermMatch).credit > 0);
  const role = roleStructure(resume, signals);
  const qualification = /\b(?:bachelor|master|doctor|diploma|B\.?Sc|M\.?Sc|B\.?S\.?|M\.?S\.?|B\.?A\.?|B\.?Tech|M\.?Tech|MBA|Ph\.?D)\b/i;
  const education = resume.profile.entries.filter(entry => entry.kind === 'education' && qualification.test(entry.title));
  const educationPoints = education.length ? 2 + (education.some(entry => entry.organization) ? 2 : 0) : 0;
  const uniqueWords = new Set(wordsIn(resume.text).map(word => word.toLowerCase())).size;
  const distinctLines = unique(resume.text.split(/[\n\f]/).map(line => cleanText(line).replace(/^[•*-]\s*/, '').trim()).filter(Boolean));
  const distinctTextWords = distinctLines.join(' ').match(/[\p{L}\p{N}][\p{L}\p{N}+#'.-]*/gu)?.length || 0;
  const corruptCharacters = (resume.extractedText.match(/[�□]/g) || []).length;
  const corruption = corruptCharacters / Math.max(1, resume.extractedText.length);
  const extractionProblem = corruption > 0.01 || (metadata.warnings || []).some(warning => /low|could not|failed|damaged/i.test(warning));
  const readable = distinctTextWords >= 45 && uniqueWords >= 12 ? 8 : distinctTextWords >= 15 && uniqueWords >= 8 ? 4 : 0;
  const headings = new Set(sections.filter(section => section.key !== 'other' &&
    wordsIn(section.lines.join(' ')).length >= 3).map(section => section.key)).size;
  const summary = sections.filter(section => section.key === 'summary').flatMap(section => section.lines).join(' ');
  const summaryWords = new Set(wordsIn(summary).map(word => word.toLowerCase())).size;
  const profileContext = wordsIn(summary).length >= 12 && summaryWords >= 8 || signals.detailed.length >= 2;
  const outcomePoints = Math.min(12, signals.quantified.length * 6 + signals.qualitative.length * 3 + Math.min(2, signals.scope.length));
  const check = (id: string, title: string, points: number, max: number, advice: string, evidence: string): ScoreCheck =>
    ({ id, title, points, max, advice, evidence });
  const categories: ScoreCategory[] = [
    { id: 'readability', title: 'ATS readability', icon: 'scan-line', checks: [
      check('text', 'Readable text', extractionProblem ? Math.min(4, readable) : readable, 8,
        'Review the extracted text against the resume and fix missing or corrupted characters.',
        `${wordCount} words extracted, ${distinctTextWords} after repeated lines are removed. ${corruptCharacters} replacement or missing-glyph characters detected.`),
      check('format', 'Extraction quality', !readable ? 0 : extractionProblem ? 3 : 6, 6,
        'Resolve the extraction warnings and confirm every section is readable in the extracted text.',
        extractionProblem ? 'The extraction reported low confidence, a failed page, or damaged text.' :
          metadata.ocrPages ? `OCR recovered text on ${metadata.ocrPages} page(s). Confirm its accuracy against the original.` :
          metadata.layoutWarning || 'No extraction quality warnings reported.'),
      check('headings', 'Recognizable headings', Math.min(6, headings * 2), 6,
        'Use standard section labels with substantive content, such as Experience, Projects, Education, and Skills.',
        `${headings} recognized sections contain at least three words of content.`),
    ] },
    { id: 'structure', title: 'Resume structure', icon: 'layout-list', checks: [
      check('contact', 'Contact details', (contact.name ? 2 : 0) + (contact.email.length ? 4 : 0) + (contact.phone.length || contact.links.length ? 2 : 0), 8,
        'Include your name, an email address, and a phone number or professional link.',
        `Name ${contact.name ? 'found' : 'missing'}, email ${contact.email.length ? 'found' : 'missing'}, additional contact channel ${contact.phone.length || contact.links.length ? 'found' : 'missing'}.`),
      check('experience', 'Experience or projects', role.points, 9,
        'For employment, show titles, organizations, and valid dates for each role. Projects should explain the specific work you completed.',
        role.evidence),
      check('education', 'Education details', educationPoints, 4,
        'Include a recognizable qualification and institution in the Education section.',
        `${education.length} qualifications detected. ${education.filter(entry => entry.organization).length} have an institution.`),
      check('skills', 'Organized skills', Math.min(4, listedSkills.length * 2), 4,
        'List specific tools, methods, or competencies under a Skills heading.',
        `${listedSkills.length} specific skills found in a Skills section.`),
    ] },
    { id: 'impact', title: 'Experience & impact', icon: 'chart-no-axes-column-increasing', checks: [
      check('accomplishments', 'Specific work descriptions', Math.min(10, Math.round(signals.detailed.length * 2.5)), 10,
        'Describe distinct actions, their context, and the work you personally completed.',
        `${signals.detailed.length} distinct, substantive work descriptions. Numeric variants of the same statement count once.`),
      check('metrics', 'Outcome evidence', outcomePoints, 12,
        'Explain what changed as a result of your work. Include measurable outcomes when you can substantiate them.',
        `${signals.quantified.length} measured changes, ${signals.qualitative.length} qualitative outcomes, ${signals.scope.length} scale or task counts. Scale alone earns at most 2 points.`),
      check('verbs', 'Clear actions', signals.statements.length ? Math.round(8 * signals.actionable.length / signals.statements.length * Math.min(1, signals.statements.length / 3)) : 0, 8,
        'Start statements with clear actions and describe your contribution. Add distinct examples where the resume is brief.',
        `${signals.actionable.length} of ${signals.statements.length} distinct statements start with an action. Full coverage requires at least three examples.`),
    ] },
  ];
  categories.push(keywords.total ? { id: 'keywords', title: keywords.semantic ? 'Job requirement match' : 'Job keyword match', icon: 'target', checks: [
    check('role-match', keywords.semantic ? 'Requirement coverage' : 'Keyword coverage', Math.round(15 * keywords.ratio), 15,
      'Review the missing criteria in Job match and add them where they describe your actual experience.',
      `${keywords.matched.length} of ${keywords.total} criteria have positive resume evidence. Required criteria carry twice the weight of preferred criteria.`),
    check('job-evidence', 'Supporting job evidence', Math.round(10 * (keywords.evidenceRatio ?? 0)), 10,
      'Connect relevant skills to specific work or study examples. A bare list or summary earns half the supporting credit.',
      `${keywords.matched.filter(item => item.credit === 1).length} criteria have supporting context. ${keywords.matched.filter(item => item.credit === 0.5).length} are listed or summarized claims.`),
  ] } : { id: 'content', title: 'Content coverage', icon: 'target', checks: [
    check('skill-detail', 'Specific skills with evidence', Math.min(10, Math.round(skillSupport.reduce((total, item) => total + item.credit * 2, 0))), 10,
      'Show how you used relevant skills in work, projects, education, or credentials.',
      `${specificSkills.length} specific skills detected. ${skillSupport.filter(item => item.credit === 1).length} have supporting context.`),
    check('profile', 'Profile context', profileContext ? 5 : 0, 5,
      'Use a substantive summary or detailed role and project descriptions to establish your background.',
      profileContext ? 'The summary or work descriptions provide background context.' : 'A substantive summary or at least two specific work descriptions was not found.'),
    check('detail', 'Relevant detail', Math.min(7, Math.round(signals.detailed.length * 1.75)), 7,
      'Add distinct work descriptions with tasks, methods, audiences, and outcomes that matter to your target role.',
      `${signals.detailed.length} distinct work descriptions. Repeated or unrelated padding earns no detail points.`),
    check('support', 'Supporting links or credentials', resume.profile.entries.some(entry =>
      ['project', 'credential', 'publication', 'volunteer', 'award'].includes(entry.kind) && wordsIn(entry.evidence.join(' ')).length >= 4) || contact.links.length ? 3 : 0, 3,
      'Include relevant projects, credentials, volunteer work, publications, or a professional link.',
      `${contact.links.length} links and ${resume.profile.entries.filter(entry => ['project', 'credential', 'publication', 'volunteer', 'award'].includes(entry.kind)).length} supporting entries detected.`),
  ] });
  const totals = categories.map(category => ({
    ...category,
    points: category.checks.reduce((total, item) => total + item.points, 0),
    max: category.checks.reduce((total, item) => total + item.max, 0),
  }));
  const improvements = totals.flatMap(category => category.checks)
    .filter(item => item.points < item.max)
    .sort((first, second) => (second.max - second.points) - (first.max - first.points));
  const notes: string[] = [];
  if (metadata.ocrPages || metadata.layoutWarning) notes.push('OCR or layout reconstruction was used. Review the extracted text before relying on the score.');
  if (job.trim() && !keywords.total) notes.push('No usable job criteria were detected. This score uses general content coverage.');
  const mode = keywords.total ? 'job-specific' : 'general';
  return { score: totals.reduce((total, category) => total + category.points, 0), categories: totals, improvements, keywords,
    rubricVersion: '2.0', mode, notes };
}
