import { cleanText, unique } from './resume.js';

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
const stopTerms = /^(?:strong|excellent|preferred|required|qualifications?|skills?|experience|years?|degree|knowledge|proficiency|team player|and|or|ability to work|other duties)$/i;
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keywordForm = value => cleanText(value).replace(/\s+/g, ' ');

function termMatches(text, term) {
  const normalized = keywordForm(term);
  const pattern = escapePattern(normalized).replace(/ /g, '[\\s-]+');
  const exactCase = /^(?:C|R|Go|ML|TS|JS|QA|CAD|BIM|SEM|CPA|CFA|PMP)$/.test(normalized);
  return new RegExp(`(?<![\\p{L}\\p{N}+#])${pattern}(?![\\p{L}\\p{N}+#])`, exactCase ? 'u' : 'iu').test(text);
}

export function compareKeywords(resume, job) {
  const description = cleanText(job);
  if (!description) return { provided: false, matched: [], missing: [], total: 0, ratio: 0 };
  const jobLines = description.split('\n');
  const terms = catalog.filter(term => term.aliases.some(alias => termMatches(description, alias)));
  const explicit = [];
  let inSkillList = false;
  for (const line of jobLines.map(value => value.trim())) {
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
    if (!terms.some(term => term.aliases.some(alias => termMatches(label, alias)))) terms.push({ label, aliases: [label] });
  }
  const required = [];
  const preferred = [];
  let inPreferred = false;
  for (const line of jobLines) {
    if (/^\s*(?:preferred|nice to have|bonus|desirable)/i.test(line)) inPreferred = true;
    if (/^\s*(?:required|minimum|must have|essential|responsibilities|about|benefits)/i.test(line)) inPreferred = false;
    (inPreferred ? preferred : required).push(line);
  }
  const requiredText = keywordForm(required.join(' '));
  const preferredText = keywordForm(preferred.join(' '));
  const resumeLines = resume.text.split(/[\n\f]/);
  const sortedTerms = terms.map(term => {
    const preferredOnly = !term.aliases.some(alias => termMatches(requiredText, alias)) &&
      term.aliases.some(alias => termMatches(preferredText, alias));
    const evidence = resumeLines.find(line => term.aliases.some(alias => termMatches(line, alias)));
    return { label: term.label, preferred: preferredOnly, evidence: evidence || '' };
  }).sort((first, second) => Number(first.preferred) - Number(second.preferred) || first.label.localeCompare(second.label));
  return summarizeMatches(sortedTerms);
}

function summarizeMatches(terms) {
  const matched = terms.filter(term => term.evidence);
  const missing = terms.filter(term => !term.evidence);
  const weight = list => list.reduce((total, term) => total + (term.preferred ? 1 : 2), 0);
  return { provided: true, matched, missing, total: terms.length, ratio: terms.length ? weight(matched) / weight(terms) : 0 };
}

export function scoreResume(resume, job = '', requirements = []) {
  const { contact, experienceDates, sections, statements, actionStatements, quantifiedStatements, skills, wordCount, metadata } = resume;
  const has = key => sections.some(section => section.key === key && section.lines.length > 0);
  const keywords = requirements.length ? { ...summarizeMatches(requirements), semantic: true } : compareKeywords(resume, job);
  const check = (id, title, points, max, advice, evidence = '') => ({ id, title, points, max, advice, evidence });
  const categories = [
    { id: 'readability', title: 'ATS readability', icon: 'scan-line', checks: [
      check('text', 'Readable text', wordCount >= 45 ? 8 : wordCount >= 15 ? 4 : 0, 8,
        'Export your resume as a text-based PDF or DOCX and confirm the extracted text contains every section.', `${wordCount} words extracted`),
      check('format', 'Reading order', metadata.layoutWarning || metadata.ocrPages ? 2 : 6, 6,
        'Use a single-column layout with standard text. Review the parsed text for skipped or reordered lines.',
        metadata.ocrPages ? `OCR used on ${metadata.ocrPages} page(s)` : metadata.layoutWarning || 'No layout issues detected'),
      check('headings', 'Recognizable headings', Math.min(6, new Set(sections.filter(section => section.key !== 'other' && section.lines.length).map(section => section.key)).size * 2), 6,
        'Use standard section labels such as Experience, Education, and Skills.'),
    ] },
    { id: 'structure', title: 'Resume structure', icon: 'layout-list', checks: [
      check('contact', 'Contact details', (contact.name ? 2 : 0) + (contact.email.length ? 4 : 0) + (contact.phone.length ? 2 : 0), 8,
        'Place your full name, email address, and phone number together near the top of the resume.'),
      check('experience', 'Experience and dates', (has('experience') ? 5 : 0) + (experienceDates.length ? 4 : 0), 9,
        'Add an Experience section with role titles, organizations, and dates such as Jan 2023 – Present. Internships count.'),
      check('education', 'Education section', has('education') ? 4 : 0, 4,
        'Add an Education section with the institution, qualification, and completion year when applicable.'),
      check('skills', 'Skills section', has('skills') ? 4 : 0, 4,
        'Group your relevant skills under a clearly labeled Skills heading.'),
    ] },
    { id: 'impact', title: 'Experience & impact', icon: 'chart-no-axes-column-increasing', checks: [
      check('accomplishments', 'Accomplishment statements', Math.min(8, statements.length * 2), 8,
        'Add concise bullets under Experience or Projects that explain what you did and the result.', `${statements.length} statements detected`),
      check('metrics', 'Measurable impact', Math.min(14, quantifiedStatements.length * 5), 14,
        'Quantify outcomes you can substantiate, such as time saved, revenue, accuracy, or people served.', quantifiedStatements[0] || 'No measurable outcomes detected'),
      check('verbs', 'Action verbs', statements.length ? Math.round(8 * actionStatements.length / statements.length) : 0, 8,
        'Start bullets with accurate action verbs such as Built, Reduced, or Led, then describe the result.',
        `${actionStatements.length} of ${statements.length} statements start with an action verb`),
    ] },
  ];
  categories.push(keywords.total ? { id: 'keywords', title: keywords.semantic ? 'Job requirement match' : 'Job keyword match', icon: 'target', checks: [
    check('role-match', keywords.semantic ? 'Job requirement coverage' : 'Role keyword coverage', Math.round(25 * keywords.ratio), 25,
      keywords.semantic ? 'Use the Job match tab to identify requirements you can support with clearer evidence.' :
        'Add missing job keywords where they describe your actual experience. Review matches in the Job match tab.',
      `${keywords.matched.length} of ${keywords.total} detected terms found`),
  ] } : { id: 'content', title: 'Content coverage', icon: 'target', checks: [
    check('skill-detail', 'Specific skills', Math.min(10, skills.length * 2), 10,
      'List at least five specific skills you can demonstrate, such as tools, methods, or industry competencies.'),
    check('profile', 'Professional summary', has('summary') ? 5 : 0, 5,
      'Add a short summary that names your target role, experience level, and strongest relevant skills.'),
    check('detail', 'Relevant detail', wordCount >= 150 ? 7 : wordCount >= 85 ? 4 : wordCount >= 45 ? 2 : 0, 7,
      'Expand brief role descriptions with relevant responsibilities, tools, and accomplishments.'),
    check('support', 'Supporting evidence', has('projects') || has('certifications') || has('publications') || has('volunteer') || has('awards') || contact.links.length ? 3 : 0, 3,
      'Include relevant projects, credentials, volunteer experience, awards, or a portfolio link.'),
  ] });
  const totals = categories.map(category => ({
    ...category,
    points: category.checks.reduce((total, item) => total + item.points, 0),
    max: category.checks.reduce((total, item) => total + item.max, 0),
  }));
  const improvements = totals.flatMap(category => category.checks)
    .filter(item => item.points < item.max)
    .sort((first, second) => (second.max - second.points) - (first.max - first.points));
  return { score: totals.reduce((total, category) => total + category.points, 0), categories: totals, improvements, keywords };
}
