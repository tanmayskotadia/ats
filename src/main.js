import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import './style.css';
import { validateFile } from './extract.js';
import { sectionTitles } from './resume.js';
import { maxFiles, runQueue, scanFile } from './scan.js';

const iconFiles = import.meta.glob(
  '/node_modules/lucide-static/icons/{scan-line,file-text,shield-check,arrow-up-right,upload,chevron-down,arrow-right,chart-no-axes-column-increasing,layout-list,target,check,info,x,arrow-left,download,copy,triangle-alert,plus,sparkles,lock,key-round,search,check-circle,loader-circle}.svg',
  { query: '?raw', import: 'default', eager: true },
);
const icon = name => (iconFiles[`/node_modules/lucide-static/icons/${name}.svg`] || '').replace('<svg', '<svg aria-hidden="true" focusable="false"');
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
);
const progressColor = { readability: 'purple', structure: 'blue', impact: 'orange', keywords: 'green', content: 'green' };
let records = [];
let batchSettings;
let busy = false;
let current;
let tab = 'overview';

function ring(score) {
  return `<div class="ring" style="--score:${score}%">
    <div><strong>${score}</strong><span> / 100</span></div>
  </div>`;
}

function categoryRows(categories) {
  return categories.map(category => `<div class="metric ${progressColor[category.id]}">
    <span class="metric-icon">${icon(category.icon)}</span>
    <div><div class="metric-label"><span>${escape(category.title)}</span><b>${category.points}<span> / ${category.max}</span></b></div>
    <div class="track" aria-hidden="true"><i style="width:${100 * category.points / category.max}%"></i></div></div>
  </div>`).join('');
}

document.querySelector('#app').innerHTML = `
<header class="header"><div class="shell header-inner">
  <a class="brand" href="./" aria-label="Shortlist home"><span class="brand-icon">${icon('scan-line')}</span> shortlist<span class="brand-dot">.</span></a>
  <button class="quiet help-button" id="help" type="button">${icon('info')} How scoring works</button>
</div></header>
<main class="shell">
  <div id="scanner">
    <section class="hero">
      <div class="hero-art" aria-hidden="true"><span></span><i></i><b></b></div>
      <div class="hero-content">
        <div class="hero-label">${icon('scan-line')} ATS RESUME CHECKER</div>
        <h1>See how your resume<br class="desktop-break"> reads to an ATS.</h1>
        <p>Get a score out of 100, see exactly what was extracted, and find the edits that matter most.</p>
      </div>
    </section>
    <div class="workspace">
      <section class="card scanner-card" aria-labelledby="scan-title">
        <div class="card-heading"><span class="tile">${icon('file-text')}</span><div><h2 id="scan-title">Resume uploads</h2><p>Scan one resume or compare a batch against the same job.</p></div></div>
        <form id="scan-form">
          <div id="drop" class="drop">
            <span class="drop-icon">${icon('upload')}</span>
            <div id="drop-label"><button type="button" class="browse" id="browse">Choose files</button> or drag and drop</div>
            <span class="drop-note">PDF, DOCX, TXT, PNG or JPG · up to 15 MB per file</span>
            <input id="file" aria-label="Resume files" type="file" multiple accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" hidden>
          </div>
          <ul id="selected" class="queue" aria-label="Resume files" hidden></ul>
          <button id="export-batch" class="secondary batch-export" type="button" hidden>${icon('download')} Export batch summary</button>
          <details class="job" id="job-panel">
            <summary><span class="job-title">${icon('target')} Job description <span class="optional">Optional</span></span>${icon('chevron-down')}</summary>
            <label class="sr-only" for="job">Job description</label>
            <textarea id="job" rows="5" maxlength="30000" placeholder="Paste the job description to check which skills and keywords your resume covers."></textarea>
          </details>
          <label class="ai-setting"><input id="use-ai" type="checkbox" disabled aria-describedby="ai-description">
            <span><strong>${icon('sparkles')} AI-assisted parsing</strong>
            <small id="ai-description">Checking AI availability…</small></span>
          </label>
          <div id="error" class="alert" role="alert" hidden></div>
          <button class="primary scan-button" id="scan" type="submit">${icon('scan-line')} Analyze resume ${icon('arrow-right')}</button>
          <div class="scan-note" id="scan-status" role="status">${icon('lock')} Files are extracted in your browser.</div>
        </form>
      </section>
      <aside class="card workflow-card" aria-labelledby="workflow-title">
        <h2 id="workflow-title">What the scan checks</h2>
        <ol class="workflow-list">
          <li><span class="tile">${icon('scan-line')}</span><div><h3>Readable text</h3><p>Review what was extracted from each file, including any OCR or layout issues.</p></div></li>
          <li><span class="tile">${icon('layout-list')}</span><div><h3>Resume evidence</h3><p>Check experience, skills, and qualifications against the original text.</p></div></li>
          <li><span class="tile">${icon('target')}</span><div><h3>Job requirements</h3><p>Add a posting to see which requirements your resume supports and where it needs clearer evidence.</p></div></li>
        </ol>
      </aside>
    </div>
  </div>
  <div id="report" hidden></div>
</main>
<footer class="shell footer"><span>Shortlist</span><span>Browser file extraction ${icon('shield-check')}</span></footer>
<dialog id="help-dialog" aria-labelledby="help-title">
  <div class="dialog-heading"><h2 id="help-title">How scoring works</h2><button class="icon-button" id="close-help" aria-label="Close" type="button">${icon('x')}</button></div>
  <p>Shortlist calculates an advisory score using these checks. Employer ATS rules and recruiter decisions vary.</p>
  <dl><div><dt>ATS readability</dt><dd>20 points</dd></div><div><dt>Resume structure</dt><dd>25 points</dd></div><div><dt>Experience & impact</dt><dd>30 points</dd></div><div><dt>Content coverage or job keyword match</dt><dd>25 points</dd></div></dl>
  <p>A job description can replace content coverage with a job match. Preferred requirements carry half the weight. AI-assisted reports show the excerpts behind their matches.</p>
</dialog>`;

const get = id => document.getElementById(id);
const form = get('scan-form');
const input = get('file');
const drop = get('drop');
const report = get('report');

function showError(message = '') {
  get('error').hidden = !message;
  get('error').textContent = message;
}

function selectFiles(selection) {
  if (busy || !selection.length) return;
  const issues = [];
  for (const file of selection) {
    if (records.length >= maxFiles) {
      issues.push(`Up to ${maxFiles} resumes can be scanned in one batch.`);
      break;
    }
    try {
      validateFile(file);
      if (records.some(record => record.file.name === file.name && record.file.size === file.size &&
        record.file.lastModified === file.lastModified)) continue;
      records.push({ file, status: 'Ready' });
    } catch (error) {
      issues.push(`${file.name} — ${error.message}`);
    }
  }
  input.value = '';
  showError(issues.slice(0, 3).join(' '));
  renderQueue();
}

function renderQueue() {
  const queue = get('selected');
  get('export-batch').hidden = busy || records.length < 2 || !records.some(record => record.report);
  queue.hidden = !records.length;
  queue.innerHTML = records.map((record, index) => `<li class="selected">
    ${icon(record.report ? 'check-circle' : record.failed ? 'triangle-alert' : 'file-text')}
    <span><b>${escape(record.file.name)}</b><small>${escape(record.status)}</small></span>
    ${record.report ? `<button type="button" class="secondary" data-open="${index}">Open report</button>` : ''}
    ${record.failed && !busy ? `<button type="button" class="secondary" data-retry="${index}">Retry</button>` : ''}
    <button type="button" class="icon-button" data-remove="${index}" aria-label="Remove ${escape(record.file.name)}" ${busy ? 'disabled' : ''}>${icon('x')}</button>
    </li>`).join('');
  for (const button of queue.querySelectorAll('[data-open]')) {
    button.addEventListener('click', () => openReport(records[Number(button.dataset.open)].report));
  }
  for (const button of queue.querySelectorAll('[data-retry]')) {
    button.addEventListener('click', () => startScan([records[Number(button.dataset.retry)]], batchSettings));
  }
  for (const button of queue.querySelectorAll('[data-remove]')) {
    button.addEventListener('click', () => {
      records.splice(Number(button.dataset.remove), 1);
      renderQueue();
      get('browse').focus();
    });
  }
  get('scan').innerHTML = busy ? `${icon('loader-circle')} Analyzing resumes…` :
    `${icon('scan-line')} ${records.length > 1 ? `Analyze ${records.length} resumes` : 'Analyze resume'} ${icon('arrow-right')}`;
}

const aiToggle = get('use-ai');
let aiEnabled = false;
fetch('/api/status', { signal: AbortSignal.timeout(5000) }).then(response => response.json()).then(status => {
  aiEnabled = status.aiEnabled === true;
}).catch(() => {}).finally(() => {
  aiToggle.disabled = busy || !aiEnabled;
  get('ai-description').textContent = aiEnabled ?
    'Send extracted resume and job text to OpenAI for evidence-based parsing. Detected resume emails and phone numbers are masked.' :
    'AI is unavailable on this server. Local parsing is available.';
});

get('browse').addEventListener('click', () => input.click());
get('export-batch').addEventListener('click', () => {
  const csv = value => {
    const cell = String(value ?? '');
    const safe = /^(?:\s*[=+@-]|[\t\r\n])/.test(cell) ? "'" + cell : cell;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows = [['Filename', 'Status', 'Score / 100', 'Parser', 'Job match', 'Top improvement']];
  for (const record of records) {
    const scan = record.report;
    const match = scan?.result.keywords;
    rows.push([record.file.name, scan?.aiNote || (scan ? 'Complete' : record.status), scan?.result.score,
      scan ? scan.analysis ? 'AI-assisted' : 'Local' : '',
      match?.total ? Math.round(match.ratio * 100) + '%' : '', scan?.result.improvements[0]?.title]);
  }
  downloadFile('shortlist-batch.csv', '\ufeff' + rows.map(row => row.map(csv).join(',')).join('\r\n'), 'text/csv');
});
input.addEventListener('change', () => selectFiles([...input.files]));
for (const eventName of ['dragenter', 'dragover']) {
  drop.addEventListener(eventName, event => {
    event.preventDefault();
    if (!busy) drop.classList.add('dragging');
  });
}
drop.addEventListener('dragleave', event => {
  if (!drop.contains(event.relatedTarget)) drop.classList.remove('dragging');
});
drop.addEventListener('drop', event => {
  event.preventDefault();
  drop.classList.remove('dragging');
  selectFiles([...event.dataTransfer.files]);
});
get('help').addEventListener('click', () => get('help-dialog').showModal());
get('close-help').addEventListener('click', () => get('help-dialog').close());
get('help-dialog').addEventListener('click', event => {
  if (event.target === get('help-dialog')) event.target.close();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (busy) return;
  if (!records.length) {
    showError('Choose a resume to analyze.');
    get('browse').focus();
    return;
  }
  batchSettings = { job: get('job').value, useAI: aiEnabled && aiToggle.checked };
  startScan(records, batchSettings);
});

async function startScan(batch, settings) {
  if (busy) return;
  showError();
  busy = true;
  for (const control of [get('scan'), get('browse'), get('job'), aiToggle]) control.disabled = true;
  for (const record of batch) Object.assign(record, { status: 'Queued', report: null, failed: false });
  let completed = 0;
  const updateProgress = () => {
    get('scan-status').textContent = `${completed} of ${batch.length} finished`;
    renderQueue();
  };
  updateProgress();
  try {
    await runQueue(batch, async record => {
      try {
        record.report = await scanFile(record.file, settings, status => {
          record.status = status;
          updateProgress();
        });
        record.status = `${record.report.result.score}/100 · ${record.report.analysis ? 'AI-assisted' : 'Local scan'}`;
      } catch (error) {
        record.failed = true;
        record.status = error.message || 'The resume could not be read.';
      } finally {
        completed += 1;
        updateProgress();
      }
    });
    if (batch.length === 1 && records.length === 1 && records[0].report && !current) openReport(records[0].report);
  } finally {
    busy = false;
    for (const control of [get('scan'), get('browse'), get('job')]) control.disabled = false;
    aiToggle.disabled = !aiEnabled;
    renderQueue();
  }
}

function openReport(scan) {
  current = scan;
  tab = 'overview';
  get('scanner').hidden = true;
  report.hidden = false;
  renderReport();
  window.scrollTo(0, 0);
  get('report-title').focus({ preventScroll: true });
}
function resetReport() {
  current = undefined;
  report.hidden = true;
  report.replaceChildren();
  get('scanner').hidden = false;
  if (records.length === 1) records = [];
  renderQueue();
  if (!records.length) get('scan-status').innerHTML = `${icon('lock')} Files are extracted in your browser.`;
  showError();
  window.scrollTo(0, 0);
  get('browse').focus({ preventScroll: true });
}

const tabs = { overview: 'Overview', parsed: 'Parsed resume', keywords: 'Job match' };

function renderReport() {
  const { resume, result, analysis, aiNote } = current;
  const metadata = resume.metadata;
  const note = metadata.ocrPages ? 'English OCR applied. Verify the extracted text against the original.' : '';
  const warnings = [aiNote, note, metadata.layoutWarning, ...(metadata.warnings || [])].filter(Boolean);
  report.innerHTML = `
    <div class="report-top"><button class="quiet" id="back" type="button">${icon('arrow-left')} ${records.length > 1 ? 'Back to batch' : 'New scan'}</button>
      <button class="secondary" id="download" type="button">${icon('download')} Download report</button></div>
    <section class="report-banner">
      <div><span class="hero-label">${icon('scan-line')} ATS SCAN RESULTS</span><h1 id="report-title" tabindex="-1">Resume report</h1>
      <p>${escape(metadata.fileName)} <span>·</span> ${resume.wordCount} words extracted <span>·</span> ${analysis ? 'AI-assisted' : 'Local scan'}</p></div>
      ${ring(result.score)}
    </section>
    ${warnings.length ? `<div class="report-warnings">${icon('triangle-alert')}<ul>${warnings.map(warning => `<li>${escape(warning)}</li>`).join('')}</ul></div>` : ''}
    <div class="tabs" role="tablist" aria-label="Resume report">${Object.entries(tabs).map(([key, title]) =>
      `<button id="tab-${key}" role="tab" aria-selected="${tab === key}" tabindex="${tab === key ? 0 : -1}" aria-controls="panel" type="button">${title}</button>`).join('')}</div>
    <div id="panel" role="tabpanel" tabindex="0" aria-labelledby="tab-${tab}"></div>`;
  get('back').addEventListener('click', resetReport);
  get('download').addEventListener('click', downloadReport);
  const keys = Object.keys(tabs);
  for (const [index, key] of keys.entries()) {
    const button = get('tab-' + key);
    button.addEventListener('click', () => switchTab(key));
    button.addEventListener('keydown', event => {
      const next = { ArrowRight: (index + 1) % keys.length, ArrowLeft: (index + keys.length - 1) % keys.length, Home: 0, End: keys.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      switchTab(keys[next]);
      get('tab-' + keys[next]).focus();
    });
  }
  renderPanel();
}

function switchTab(next) {
  tab = next;
  for (const key of Object.keys(tabs)) {
    const button = get('tab-' + key);
    button.setAttribute('aria-selected', String(key === tab));
    button.tabIndex = key === tab ? 0 : -1;
  }
  get('panel').setAttribute('aria-labelledby', 'tab-' + tab);
  renderPanel();
}

function overview(result, analysis) {
  const suggestions = result.improvements.map(check => `<li><div class="suggestion-title"><h3>${escape(check.title)}</h3>
    <span>+${check.max - check.points} pts</span></div><p>${escape(check.advice)}</p>${check.evidence ? `<small>${escape(check.evidence)}</small>` : ''}</li>`).join('');
  return `<div class="report-grid"><section class="card report-card"><h2>Score breakdown</h2>
    <div class="metric-list">${categoryRows(result.categories)}</div>
    <div class="rubric">${result.categories.map(category => `<details><summary>${escape(category.title)} ${icon('chevron-down')}</summary>
    <ul>${category.checks.map(check => `<li><span>${escape(check.title)}</span><b>${check.points}/${check.max}</b></li>`).join('')}</ul></details>`).join('')}</div>
    </section><section class="card report-card"><h2>What to improve</h2>
    <p class="muted">Ordered by potential points in this scan.</p>
    ${suggestions ? `<ol class="suggestions">${suggestions}</ol>` : '<p>Every check earned full points in this scan.</p>'}</section></div>
  ${analysis?.improvements.length ? `<section class="card report-card ai-improvements"><h2>AI editing suggestions</h2>
    <ul class="suggestions">${analysis.improvements.map(item => `<li><h3>${escape(item.title)}</h3>
      <p>${escape(item.action)}</p><blockquote>${escape(item.evidence)}</blockquote></li>`).join('')}</ul></section>` : ''}`;
}

const entryLabels = {
  experience: 'Experience', education: 'Education', project: 'Projects', credential: 'Credentials',
  volunteer: 'Volunteering', publication: 'Publications', award: 'Awards', other: 'Other experience',
};

function aiSections(analysis) {
  if (!analysis) return '';
  const entries = Object.entries(entryLabels).map(([key, label]) => {
    const matches = analysis.entries.filter(item => item.kind === key);
    if (!matches.length) return '';
    return `<section class="card report-card"><h2>${label}</h2><ul class="ai-entries">${matches.map(item => `<li>
      <strong>${escape(item.title)}</strong><p>${[item.organization, item.dates].filter(Boolean).map(escape).join(' · ')}</p>
      <details><summary>Source text ${icon('chevron-down')}</summary>${item.evidence.map(line => `<blockquote>${escape(line)}</blockquote>`).join('')}</details>
    </li>`).join('')}</ul></section>`;
  }).join('');
  return entries + (analysis.skills.length ? `<section class="card report-card"><h2>Skills with evidence</h2>
    <ul class="ai-entries">${analysis.skills.map(item => `<li><strong>${escape(item.label)}</strong><blockquote>${escape(item.evidence)}</blockquote></li>`).join('')}</ul></section>` : '');
}

function parsed(resume, analysis) {
  const { contact, sections, extractedText, skills, dates, header } = resume;
  const field = (title, value) => {
    const values = Array.isArray(value) ? value : [value];
    return `<div><dt>${title}</dt><dd>${values.some(Boolean) ? values.map(escape).join('<br>') : '<span class="muted">Not detected</span>'}</dd></div>`;
  };
  return `<div class="report-grid parsed-grid"><div class="parsed-sections">
    <section class="card report-card"><h2>Contact details</h2><dl class="fields">
      ${field('Name', contact.name)}${field('Title', contact.title)}${field('Email', contact.email)}${field('Phone', contact.phone)}
      ${field('Location', contact.location)}${field('Links', contact.links)}</dl></section>
    ${header.length ? `<section class="card report-card"><h2>Resume header</h2><ul class="section-lines">${header.map(line => `<li>${escape(line)}</li>`).join('')}</ul></section>` : ''}
    ${aiSections(analysis)}
    ${sections.filter(section => section.lines.length).map(section => `<section class="card report-card"><h2>${escape(section.label || sectionTitles[section.key])}</h2>
      <ul class="section-lines">${section.lines.map(line => `<li>${escape(line)}</li>`).join('')}</ul></section>`).join('')}
    <section class="card report-card"><h2>Detected skills & dates</h2><dl class="fields">${field('Skills', skills)}${field('Date ranges', dates)}</dl></section>
    </div><section class="card report-card raw"><div class="section-heading"><h2>Extracted text</h2><button type="button" class="secondary" id="copy">${icon('copy')} Copy</button></div>
    <pre>${escape(extractedText.replace(/\f/g, '\n'))}</pre></section></div>`;
}

function keywords(result) {
  const comparison = result.keywords;
  if (!comparison.total) return `<section class="card report-card keyword-empty"><span class="tile">${icon('target')}</span><h2>Job keyword match</h2><p>${
    comparison.provided ? 'The job description had no recognizable keywords. Include explicit requirements such as a “Required skills:” list.' :
    'Add a job description before scanning to compare the role’s keywords with your resume.'
  }</p><button class="secondary" id="add-job" type="button">Add job description ${icon('arrow-right')}</button></section>`;
  const list = (terms, matched) => terms.length ? `<ul class="keyword-list">${terms.map(term => `<li>
    <span class="tile ${matched ? 'matched' : 'missing'}">${icon(matched ? 'check' : 'search')}</span><div><strong>${escape(term.label)}</strong>
    ${term.preferred ? '<span class="optional">Preferred</span>' : ''}
    ${term.jobEvidence ? `<p><b>Job</b> ${escape(term.jobEvidence)}</p>` : ''}
    ${term.evidence ? `<p><b>Resume</b> ${escape(term.evidence)}</p>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">No terms in this group.</p>';
  return `<div class="report-grid"><section class="card report-card"><h2>${comparison.semantic ? 'Supported requirements' : 'Matched keywords'} <span class="count">${comparison.matched.length}</span></h2>
    <p class="muted">Evidence found in your resume.</p>${list(comparison.matched, true)}</section>
    <section class="card report-card"><h2>${comparison.semantic ? 'Requirements without evidence' : 'Missing keywords'} <span class="count">${comparison.missing.length}</span></h2>
    <p class="muted">Add clearer evidence where you meet a requirement.</p>${list(comparison.missing, false)}</section></div>`;
}

function renderPanel() {
  const { result, resume, analysis } = current;
  get('panel').innerHTML = { overview, parsed, keywords }[tab](tab === 'parsed' ? resume : result, analysis);
  get('copy')?.addEventListener('click', async () => {
    const button = get('copy');
    try {
      await navigator.clipboard.writeText(resume.extractedText.replace(/\f/g, '\n'));
      button.textContent = 'Copied';
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(report.querySelector('pre'));
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = 'Text selected';
    }
  });
  get('add-job')?.addEventListener('click', () => {
    current = undefined;
    report.hidden = true;
    report.replaceChildren();
    get('scanner').hidden = false;
    get('job-panel').open = true;
    get('job').focus();
  });
}

function downloadReport() {
  const { result, resume, analysis, aiNote } = current;
  const lines = ['Shortlist resume report', resume.metadata.fileName, `ATS score: ${result.score}/100`, '',
    ...result.categories.flatMap(category => [
      `${category.title}: ${category.points}/${category.max}`,
      ...category.checks.map(check => `  ${check.title}: ${check.points}/${check.max}`),
    ]), '', 'Improvements', ...result.improvements.map(check => `- ${check.title} (+${check.max - check.points}): ${check.advice}`)];
  if (result.keywords.total) {
    lines.push('', 'Matched keywords: ' + result.keywords.matched.map(term => term.label).join(', '),
      'Missing keywords: ' + result.keywords.missing.map(term => term.label).join(', '));
  }
  if (analysis) {
    lines.push('', 'AI editing suggestions', ...analysis.improvements.map(item => `- ${item.title}: ${item.action}\n  Evidence: ${item.evidence}`));
    lines.push('', 'Structured resume entries', ...analysis.entries.map(item =>
      `- ${item.kind}: ${[item.title, item.organization, item.dates].filter(Boolean).join(' · ')}\n  Evidence: ${item.evidence.join(' | ')}`));
    lines.push('', 'Job requirement evidence', ...analysis.requirements.map(item =>
      `- ${item.label} (${item.preferred ? 'preferred' : 'required'})\n  Job: ${item.jobEvidence}\n  Resume: ${item.evidence || 'No supporting excerpt'}`));
  }
  const warnings = [aiNote, resume.metadata.layoutWarning, ...(resume.metadata.warnings || [])].filter(Boolean);
  if (resume.metadata.ocrPages) warnings.unshift('English OCR applied. Verify the extracted text against the original.');
  if (warnings.length) lines.push('', 'Extraction notes', ...warnings);
  lines.push('', 'Extracted text', resume.extractedText.replace(/\f/g, '\n'));
  downloadFile('shortlist-resume-report.txt', lines.join('\n'), 'text/plain');
}

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
