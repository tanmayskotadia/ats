import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import './style.css';
import { validateFile, extractResume } from './extract.js';
import { parseResume, sectionTitles } from './resume.js';
import { scoreResume } from './score.js';
import { sampleText, sampleJob } from './sample.js';

const iconFiles = import.meta.glob(
  '/node_modules/lucide-static/icons/{scan-line,file-text,shield-check,arrow-up-right,upload,chevron-down,arrow-right,chart-no-axes-column-increasing,layout-list,target,check,info,x,arrow-left,download,copy,triangle-alert,plus,sparkles,lock,key-round,search,check-circle,loader-circle}.svg',
  { query: '?raw', import: 'default', eager: true },
);
const icon = name => (iconFiles[`/node_modules/lucide-static/icons/${name}.svg`] || '').replace('<svg', '<svg aria-hidden="true" focusable="false"');
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
);
const example = scoreResume(parseResume(sampleText), sampleJob);
const progressColor = { readability: 'purple', structure: 'blue', impact: 'orange', keywords: 'green', content: 'green' };
let file;
let busy = false;
let current;
let tab = 'overview';

function ring(score, small = false) {
  return `<div class="ring${small ? ' ring-small' : ''}" style="--score:${score}%">
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
        <div class="card-heading"><span class="tile">${icon('file-text')}</span><div><h2 id="scan-title">Check your resume</h2><p>Upload a file to run your ATS scan.</p></div></div>
        <form id="scan-form">
          <div id="drop" class="drop">
            <span class="drop-icon">${icon('upload')}</span>
            <div id="drop-label"><button type="button" class="browse" id="browse">Choose a file</button> or drag and drop</div>
            <span class="drop-note">PDF, DOCX, TXT, PNG or JPG · up to 15 MB</span>
            <div id="selected" class="selected" hidden></div>
            <input id="file" aria-label="Resume file" type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" hidden>
          </div>
          <details class="job" id="job-panel">
            <summary><span class="job-title">${icon('target')} Job description <span class="optional">Optional</span></span>${icon('chevron-down')}</summary>
            <label class="sr-only" for="job">Job description</label>
            <textarea id="job" rows="5" maxlength="30000" placeholder="Paste the job description to check which skills and keywords your resume covers."></textarea>
          </details>
          <div id="error" class="alert" role="alert" hidden></div>
          <button class="primary scan-button" id="scan" type="submit">${icon('scan-line')} Analyze resume ${icon('arrow-right')}</button>
          <div class="scan-note" id="scan-status" role="status">${icon('lock')} Your resume stays in this browser.</div>
        </form>
      </section>
      <aside class="card preview-card" aria-labelledby="preview-title">
        <div class="preview-heading"><h2 id="preview-title">Example report</h2><span>Sample resume</span></div>
        <div class="preview-score">${ring(example.score, true)}<div><h3>ATS score</h3><p>Score breakdown</p></div></div>
        <div class="metric-list">${categoryRows(example.categories)}</div>
        <button class="preview-link" id="demo" type="button">View sample report ${icon('arrow-up-right')}</button>
      </aside>
    </div>
  </div>
  <div id="report" hidden></div>
</main>
<footer class="shell footer"><span>Shortlist</span><span>Private by design ${icon('shield-check')}</span></footer>
<dialog id="help-dialog" aria-labelledby="help-title">
  <div class="dialog-heading"><h2 id="help-title">How scoring works</h2><button class="icon-button" id="close-help" aria-label="Close" type="button">${icon('x')}</button></div>
  <p>Shortlist calculates an advisory score using these checks. Employer ATS rules and recruiter decisions vary.</p>
  <dl><div><dt>ATS readability</dt><dd>20 points</dd></div><div><dt>Resume structure</dt><dd>25 points</dd></div><div><dt>Experience & impact</dt><dd>30 points</dd></div><div><dt>Content coverage or job keyword match</dt><dd>25 points</dd></div></dl>
  <p>When a job description contains recognizable terms, weighted keyword coverage replaces content coverage. Terms marked preferred carry half the weight.</p>
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

function selectFile(selected) {
  if (busy || !selected) return;
  try {
    validateFile(selected);
    showError();
    file = selected;
    const size = file.size >= 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    get('selected').innerHTML = `${icon('file-text')}<span><b>${escape(file.name)}</b><small>${size}</small></span>
      <button type="button" class="icon-button" id="remove" aria-label="Remove resume">${icon('x')}</button>`;
    get('selected').hidden = false;
    drop.classList.add('has-file');
    get('remove').addEventListener('click', () => {
      clearFile();
      get('browse').focus();
    });
  } catch (error) {
    showError(error.message);
  }
}

function clearFile() {
  file = undefined;
  input.value = '';
  get('selected').hidden = true;
  drop.classList.remove('has-file');
}

get('browse').addEventListener('click', () => input.click());
input.addEventListener('change', () => selectFile(input.files[0]));
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
  selectFile(event.dataTransfer.files[0]);
});
get('help').addEventListener('click', () => get('help-dialog').showModal());
get('close-help').addEventListener('click', () => get('help-dialog').close());
get('help-dialog').addEventListener('click', event => {
  if (event.target === get('help-dialog')) event.target.close();
});
get('demo').addEventListener('click', () => openReport(parseResume(sampleText, { fileName: 'Avery Morgan · Sample resume' }), sampleJob));

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  if (!file) {
    showError('Choose a resume to analyze.');
    get('browse').focus();
    return;
  }
  showError();
  busy = true;
  for (const button of [get('scan'), get('browse'), get('demo'), get('remove'), get('job')]) button.disabled = true;
  get('scan').innerHTML = `${icon('loader-circle')} Analyzing resume…`;
  try {
    const { text, ...metadata } = await extractResume(file, status => { get('scan-status').textContent = status; });
    openReport(parseResume(text, metadata), get('job').value);
  } catch (error) {
    showError(error.message || 'The resume could not be read. Try a fresh export.');
  } finally {
    busy = false;
    for (const button of [get('scan'), get('browse'), get('demo'), get('remove'), get('job')]) button.disabled = false;
    get('scan').innerHTML = `${icon('scan-line')} Analyze resume ${icon('arrow-right')}`;
    get('scan-status').innerHTML = `${icon('lock')} Your resume stays in this browser.`;
  }
});

function openReport(resume, job) {
  current = { resume, result: scoreResume(resume, job) };
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
  clearFile();
  showError();
  window.scrollTo(0, 0);
  get('browse').focus({ preventScroll: true });
}

const tabs = { overview: 'Overview', parsed: 'Parsed resume', keywords: 'Keywords' };

function renderReport() {
  const { resume, result } = current;
  const metadata = resume.metadata;
  const note = metadata.ocrPages ? 'English OCR applied. Verify the extracted text against the original.' : '';
  const warnings = [note, metadata.layoutWarning, ...(metadata.warnings || [])].filter(Boolean);
  report.innerHTML = `
    <div class="report-top"><button class="quiet" id="back" type="button">${icon('arrow-left')} New scan</button>
      <button class="secondary" id="download" type="button">${icon('download')} Download report</button></div>
    <section class="report-banner">
      <div><span class="hero-label">${icon('scan-line')} ATS SCAN RESULTS</span><h1 id="report-title" tabindex="-1">Resume report</h1>
      <p>${escape(metadata.fileName)} <span>·</span> ${resume.wordCount} words extracted</p></div>
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

function overview(result) {
  const suggestions = result.improvements.map(check => `<li><div class="suggestion-title"><h3>${escape(check.title)}</h3>
    <span>+${check.max - check.points} pts</span></div><p>${escape(check.advice)}</p>${check.evidence ? `<small>${escape(check.evidence)}</small>` : ''}</li>`).join('');
  return `<div class="report-grid"><section class="card report-card"><h2>Score breakdown</h2>
    <div class="metric-list">${categoryRows(result.categories)}</div>
    <div class="rubric">${result.categories.map(category => `<details><summary>${escape(category.title)} ${icon('chevron-down')}</summary>
    <ul>${category.checks.map(check => `<li><span>${escape(check.title)}</span><b>${check.points}/${check.max}</b></li>`).join('')}</ul></details>`).join('')}</div>
    </section><section class="card report-card"><h2>What to improve</h2>
    <p class="muted">Ordered by potential points in this scan.</p>
    ${suggestions ? `<ol class="suggestions">${suggestions}</ol>` : '<p>Every check earned full points in this scan.</p>'}</section></div>`;
}

function parsed(resume) {
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
    ${term.evidence ? `<p>${escape(term.evidence)}</p>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">No terms in this group.</p>';
  return `<div class="report-grid"><section class="card report-card"><h2>Matched keywords <span class="count">${comparison.matched.length}</span></h2>
    <p class="muted">Terms found in your resume, with the extracted evidence.</p>${list(comparison.matched, true)}</section>
    <section class="card report-card"><h2>Missing keywords <span class="count">${comparison.missing.length}</span></h2>
    <p class="muted">Add a term only where it describes your experience.</p>${list(comparison.missing, false)}</section></div>`;
}

function renderPanel() {
  const { result, resume } = current;
  get('panel').innerHTML = { overview, parsed, keywords }[tab](tab === 'parsed' ? resume : result);
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
  const { result, resume } = current;
  const lines = ['Shortlist resume report', resume.metadata.fileName, `ATS score: ${result.score}/100`, '',
    ...result.categories.flatMap(category => [
      `${category.title}: ${category.points}/${category.max}`,
      ...category.checks.map(check => `  ${check.title}: ${check.points}/${check.max}`),
    ]), '', 'Improvements', ...result.improvements.map(check => `- ${check.title} (+${check.max - check.points}): ${check.advice}`)];
  if (result.keywords.total) {
    lines.push('', 'Matched keywords: ' + result.keywords.matched.map(term => term.label).join(', '),
      'Missing keywords: ' + result.keywords.missing.map(term => term.label).join(', '));
  }
  const warnings = [resume.metadata.layoutWarning, ...(resume.metadata.warnings || [])].filter(Boolean);
  if (resume.metadata.ocrPages) warnings.unshift('English OCR applied. Verify the extracted text against the original.');
  if (warnings.length) lines.push('', 'Extraction notes', ...warnings);
  lines.push('', 'Extracted text', resume.extractedText.replace(/\f/g, '\n'));
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'shortlist-resume-report.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
