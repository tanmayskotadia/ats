import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import './style.css';
import { validateFile } from './extract.ts';
import { sectionTitles } from './resume.ts';
import { embeddingModel, rerankingModel } from './ml-config.ts';
import { maxFiles, maxResumeTextCharacters, runQueue, scanFile, reviseScan } from './scan.ts';
import type { ScanReport, ScanSettings } from './scan.ts';
import type { ScoreResult } from './score.ts';
import type { ModelMatch } from './ml-match.ts';

interface UploadRecord {
  file: File;
  status: string;
  report?: ScanReport | null;
  failed?: boolean;
}

interface FormElements {
  file: HTMLInputElement;
  scan: HTMLButtonElement;
  browse: HTMLButtonElement;
  job: HTMLTextAreaElement;
  'job-panel': HTMLDetailsElement;
  'use-ai': HTMLInputElement;
  'use-ml': HTMLInputElement;
  'help-dialog': HTMLDialogElement;
  'edit-dialog': HTMLDialogElement;
  'edit-text': HTMLTextAreaElement;
  'edit-job': HTMLTextAreaElement;
  'edit-ai': HTMLInputElement;
  'edit-ml': HTMLInputElement;
  'edit-report': HTMLButtonElement;
}

const iconFiles = import.meta.glob<string>(
  '/node_modules/lucide-static/icons/{scan-line,file-text,shield-check,arrow-up-right,upload,chevron-down,arrow-right,chart-no-axes-column-increasing,layout-list,target,check,info,x,arrow-left,download,copy,triangle-alert,plus,sparkles,lock,key-round,search,check-circle,loader-circle}.svg',
  { query: '?raw', import: 'default', eager: true },
);
const icon = (name: string) => (iconFiles[`/node_modules/lucide-static/icons/${name}.svg`] || '').replace('<svg', '<svg aria-hidden="true" focusable="false"');
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
let records: UploadRecord[] = [];
let batchSettings: ScanSettings | undefined;
let busy = false;
let current: ScanReport | undefined;
let tab: ReportTab = 'overview';
let revising = false;

function ring(score: number) {
  return `<div class="ring" style="--score:${score}%">
    <div><strong>${score}</strong><span> / 100</span></div>
  </div>`;
}

function categoryRows(categories: ScoreResult['categories']) {
  return categories.map(category => `<div class="metric">
    <span class="metric-icon">${icon(category.icon)}</span>
    <div><div class="metric-label"><span>${escape(category.title)}</span><b>${category.points}<span> / ${category.max}</span></b></div>
    <div class="track" aria-hidden="true"><i style="width:${100 * category.points / category.max}%"></i></div></div>
  </div>`).join('');
}

get('app').innerHTML = `
<header class="header"><div class="shell header-inner">
  <a class="brand" href="./" aria-label="Shortlist home">shortlist</a>
  <button class="quiet help-button" id="help" type="button">${icon('info')} How scoring works</button>
</div></header>
<main class="shell">
  <div id="scanner">
    <section class="hero">
      <div class="hero-content">
        <div class="hero-label">${icon('scan-line')} ATS RESUME CHECKER</div>
        <h1>See how your resume<br class="desktop-break"> reads to an ATS.</h1>
        <p>Read your complete profile, compare the evidence with a job, and get a clear improvement plan out of 100.</p>
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
          <label class="ai-setting"><input id="use-ml" type="checkbox" aria-describedby="ml-description">
            <span><strong>${icon('sparkles')} Local ML evidence search</strong>
            <small id="ml-description">Find and check resume evidence for a job description in your browser. First use can download about 436 MB of model files.</small></span>
          </label>
          <label class="ai-setting"><input id="use-ai" type="checkbox" disabled aria-labelledby="ai-title" aria-describedby="ai-description">
            <span><strong id="ai-title">${icon('sparkles')} AI-assisted parsing</strong>
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
          <li><span class="tile">${icon('layout-list')}</span><div><h3>Your profile</h3><p>Review roles, education, skills, and an employment timeline with links to the source text.</p></div></li>
          <li><span class="tile">${icon('target')}</span><div><h3>Relevant experience</h3><p>Find resume passages related to a job requirement, even when they use different words.</p></div></li>
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
  <p>A job description replaces content coverage when usable criteria are found. Job coverage earns up to 15 points and supporting work or study evidence earns up to 10. Listed or summary claims earn half the supporting credit. Preferred criteria carry half the weight of required criteria.</p>
  <p>Outcome checks distinguish measured changes, qualitative results, and task counts. Dates are checked across detected roles. These rules estimate resume readiness and have no employer-specific calibration. Local ML similarity retrieves passages for review and earns no score points.</p>
</dialog>
<dialog id="edit-dialog" class="edit-dialog" aria-labelledby="edit-title">
  <form id="edit-form">
    <div class="dialog-heading"><h2 id="edit-title">Edit text and rescan</h2><button class="icon-button" id="close-editor" aria-label="Close editor" type="button">${icon('x')}</button></div>
    <p>Correct the text against your resume, or try an edit. The updated report will use this text.</p>
    <div class="editor-label"><label for="edit-text">Resume text</label><button type="button" class="quiet" id="restore-text">Restore extracted text</button></div>
    <textarea id="edit-text" maxlength="${maxResumeTextCharacters}" rows="12" required spellcheck="false"></textarea>
    <label class="editor-label" for="edit-job">Job description</label>
    <textarea id="edit-job" maxlength="30000" rows="4" placeholder="Paste the role requirements to update your match."></textarea>
    <label class="ai-setting"><input type="checkbox" id="edit-ml"><span><strong>Local ML evidence search</strong><small>Compare resume passages with the job description in your browser.</small></span></label>
    <label class="ai-setting"><input type="checkbox" id="edit-ai" disabled aria-labelledby="edit-ai-title" aria-describedby="edit-ai-description"><span><strong id="edit-ai-title">AI-assisted parsing</strong><small id="edit-ai-description">Checking AI availability…</small></span></label>
    <div id="edit-error" class="alert" role="alert" hidden></div>
    <div class="editor-actions"><span id="edit-status" role="status"></span><button type="button" class="secondary" id="cancel-edit">Cancel</button>
      <button type="submit" class="primary" id="save-edit">Update report ${icon('arrow-right')}</button></div>
  </form>
</dialog>`;

function get<K extends keyof FormElements>(id: K): FormElements[K];
function get(id: string): HTMLElement;
function get(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing page element: ${id}`);
  return element;
}
const form = get('scan-form');
const input = get('file');
const drop = get('drop');
const report = get('report');

function showError(message = '') {
  get('error').hidden = !message;
  get('error').textContent = message;
}

function selectFiles(selection: File[]) {
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
      issues.push(`${file.name} — ${error instanceof Error ? error.message : 'The file could not be read.'}`);
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
  for (const button of queue.querySelectorAll<HTMLButtonElement>('[data-open]')) {
    button.addEventListener('click', () => {
      const scan = records[Number(button.dataset.open)]?.report;
      if (scan) openReport(scan);
    });
  }
  for (const button of queue.querySelectorAll<HTMLButtonElement>('[data-retry]')) {
    button.addEventListener('click', () => {
      const record = records[Number(button.dataset.retry)];
      if (record && batchSettings) void startScan([record], batchSettings);
    });
  }
  for (const button of queue.querySelectorAll<HTMLButtonElement>('[data-remove]')) {
    button.addEventListener('click', () => {
      records.splice(Number(button.dataset.remove), 1);
      renderQueue();
      get('browse').focus();
    });
  }
  get('scan').innerHTML = busy ? `${icon('loader-circle')} Analyzing resumes…` :
    `${icon('scan-line')} ${records.length > 1 ? `Analyze ${records.length} resumes` : 'Analyze resume'} ${icon('arrow-right')}`;
  const editButton = document.getElementById('edit-report');
  if (editButton instanceof HTMLButtonElement) editButton.disabled = busy;
}

const aiToggle = get('use-ai');
let aiEnabled = false;
fetch('/api/status', { signal: AbortSignal.timeout(5000) })
  .then(async response => {
    const status: unknown = response.ok ? await response.json() : null;
    if (typeof status !== 'object' || status === null || !('aiEnabled' in status) || status.aiEnabled !== true) return;
    if ('aiProvider' in status) {
      if (status.aiProvider === 'groq') return 'Groq';
      if (status.aiProvider === 'openai') return 'OpenAI';
    }
    return 'the configured AI provider';
  }).catch(() => undefined).then(providerName => {
    aiEnabled = providerName !== undefined;
    const masking = 'Detected resume emails and phone numbers are masked.';
    get('ai-description').textContent = providerName ?
      `Send extracted resume and job text to ${providerName} for evidence-based parsing. ${masking}` :
      'AI is unavailable on this server. Local parsing is available.';
    get('edit-ai-description').textContent = providerName ?
      `Send edited resume and job text to ${providerName}. ${masking}` :
      'AI is unavailable on this server. You can use local parsing and ML.';
    aiToggle.disabled = busy || !aiEnabled;
    get('edit-ai').disabled = revising || !aiEnabled;
  });

get('browse').addEventListener('click', () => input.click());
get('export-batch').addEventListener('click', () => {
  const csv = (value: string | number | undefined) => {
    const cell = String(value ?? '');
    const safe = /^(?:\s*[=+@-]|[\t\r\n])/.test(cell) ? "'" + cell : cell;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows: (string | number | undefined)[][] = [['Filename', 'Status', 'Score / 100', 'Parser', 'Text source', 'Job match', 'Job description', 'Top improvement']];
  for (const record of records) {
    const scan = record.report;
    const match = scan?.result.keywords;
    rows.push([record.file.name, scan?.aiNote || (scan ? 'Complete' : record.status), scan?.result.score,
      scan ? scan.analysis ? 'AI-assisted' : scan.ml ? 'Local + ML' : 'Local' : '',
      scan ? scan.resume.metadata.textEdited ? 'Edited text' : 'File extraction' : '',
      match?.total ? Math.round(match.ratio * 100) + '%' : '', scan?.settings.job, scan?.result.improvements[0]?.title]);
  }
  downloadFile('shortlist-batch.csv', '\ufeff' + rows.map(row => row.map(csv).join(',')).join('\r\n'), 'text/csv');
});
input.addEventListener('change', () => selectFiles([...(input.files ?? [])]));
for (const eventName of ['dragenter', 'dragover'] as const) {
  drop.addEventListener(eventName, event => {
    event.preventDefault();
    if (!busy) drop.classList.add('dragging');
  });
}
drop.addEventListener('dragleave', event => {
  if (!(event.relatedTarget instanceof Node) || !drop.contains(event.relatedTarget)) drop.classList.remove('dragging');
});
drop.addEventListener('drop', event => {
  event.preventDefault();
  drop.classList.remove('dragging');
  if (event.dataTransfer) selectFiles([...event.dataTransfer.files]);
});
get('help').addEventListener('click', () => get('help-dialog').showModal());
get('close-help').addEventListener('click', () => get('help-dialog').close());
get('help-dialog').addEventListener('click', event => {
  const dialog = get('help-dialog');
  if (event.target === dialog) dialog.close();
});

function openEditor() {
  if (busy || !current) return;
  get('edit-text').value = current.resume.extractedText;
  get('edit-job').value = current.settings.job;
  get('edit-ml').checked = current.settings.useML;
  get('edit-ai').checked = aiEnabled && current.settings.useAI;
  get('edit-error').hidden = true;
  get('edit-status').textContent = '';
  get('edit-dialog').showModal();
  get('edit-text').focus();
  get('edit-text').setSelectionRange(0, 0);
  get('edit-text').scrollTop = 0;
}

for (const id of ['close-editor', 'cancel-edit']) {
  get(id).addEventListener('click', () => { if (!revising) get('edit-dialog').close(); });
}
get('edit-dialog').addEventListener('cancel', event => { if (revising) event.preventDefault(); });
get('restore-text').addEventListener('click', () => {
  if (!current) return;
  get('edit-text').value = current.originalText;
  get('edit-status').textContent = 'Original extracted text restored in the editor.';
});
get('edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (revising || !current) return;
  const previous = current;
  const text = get('edit-text').value;
  const settings = { job: get('edit-job').value, useML: get('edit-ml').checked, useAI: aiEnabled && get('edit-ai').checked };
  revising = true;
  get('edit-error').hidden = true;
  const controls = get('edit-form').querySelectorAll<HTMLButtonElement | HTMLTextAreaElement | HTMLInputElement>('button, textarea, input');
  for (const control of controls) control.disabled = true;
  try {
    const next = await reviseScan(previous, text, settings, status => { get('edit-status').textContent = status; });
    const record = records.find(item => item.report === previous);
    if (record) {
      record.report = next;
      record.status = `${next.result.score}/100 · Updated report`;
    }
    current = next;
    renderQueue();
    get('edit-dialog').close();
    renderReport();
    get('report-title').focus({ preventScroll: true });
  } catch (error) {
    get('edit-error').textContent = error instanceof Error && error.message ? error.message : 'The report could not be updated. Try again.';
    get('edit-error').hidden = false;
    get('edit-status').textContent = '';
  } finally {
    revising = false;
    for (const control of controls) control.disabled = false;
    get('edit-ai').disabled = !aiEnabled;
  }
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (busy) return;
  if (!records.length) {
    showError('Choose a resume to analyze.');
    get('browse').focus();
    return;
  }
  batchSettings = { job: get('job').value, useAI: aiEnabled && aiToggle.checked, useML: get('use-ml').checked };
  void startScan(records, batchSettings);
});

async function startScan(batch: UploadRecord[], settings: ScanSettings) {
  if (busy) return;
  showError();
  busy = true;
  for (const control of [get('scan'), get('browse'), get('job'), get('use-ml'), aiToggle]) control.disabled = true;
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
        record.status = `${record.report.result.score}/100 · ${record.report.analysis ? 'AI-assisted' : record.report.ml ? 'Local + ML' : 'Local scan'}`;
      } catch (error) {
        record.failed = true;
        record.status = error instanceof Error && error.message ? error.message : 'The resume could not be read.';
      } finally {
        completed += 1;
        updateProgress();
      }
    });
    if (batch.length === 1 && records.length === 1 && records[0].report && !current) openReport(records[0].report);
  } finally {
    busy = false;
    for (const control of [get('scan'), get('browse'), get('job'), get('use-ml')]) control.disabled = false;
    aiToggle.disabled = !aiEnabled;
    renderQueue();
  }
}

function openReport(scan: ScanReport) {
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
type ReportTab = keyof typeof tabs;
const tabKeys = Object.keys(tabs) as ReportTab[];

function renderReport() {
  if (!current) return;
  const { resume, result, analysis, aiNote, ml, mlNote } = current;
  const metadata = resume.metadata;
  const note = metadata.ocrPages ? 'English OCR applied. Verify the extracted text against the original.' : '';
  const warnings = [aiNote, mlNote, note, metadata.layoutWarning, ...(metadata.warnings || [])].filter(Boolean);
  report.innerHTML = `
    <div class="report-top"><button class="quiet" id="back" type="button">${icon('arrow-left')} ${records.length > 1 ? 'Back to batch' : 'New scan'}</button>
      <div class="report-actions"><button class="secondary" id="edit-report" type="button" ${busy ? 'disabled' : ''}>Edit text and rescan</button>
      <button class="secondary" id="download" type="button">${icon('download')} Download report</button></div></div>
    <section class="report-banner">
      <div><span class="hero-label">${icon('scan-line')} ATS SCAN RESULTS</span><h1 id="report-title" tabindex="-1">Resume report</h1>
      <p>${escape(metadata.fileName)} <span>·</span> ${resume.wordCount} words analyzed <span>·</span> ${analysis ? 'AI-assisted' : 'Local scan'}${ml ? ' + ML' : ''}${metadata.textEdited ? ' · Edited text' : ''}</p></div>
      ${ring(result.score)}
    </section>
    ${current.previous ? `<p class="revision-note" role="status">Report updated · Previous score ${current.previous.score}/100${current.previous.jobChanged ? ' · Job description changed' : ''}${current.previous.aiChanged ? ' · Parsing mode changed' : ''}. ${metadata.textEdited ? 'This scan uses edited resume text.' : 'This scan uses the original extracted text.'}</p>` : ''}
    ${warnings.length ? `<div class="report-warnings">${icon('triangle-alert')}<ul>${warnings.map(warning => `<li>${escape(warning)}</li>`).join('')}</ul></div>` : ''}
    <div class="tabs" role="tablist" aria-label="Resume report">${Object.entries(tabs).map(([key, title]) =>
      `<button id="tab-${key}" role="tab" aria-selected="${tab === key}" tabindex="${tab === key ? 0 : -1}" aria-controls="panel" type="button">${title}</button>`).join('')}</div>
    <div id="panel" role="tabpanel" tabindex="0" aria-labelledby="tab-${tab}"></div>`;
  get('back').addEventListener('click', resetReport);
  get('download').addEventListener('click', downloadReport);
  get('edit-report').addEventListener('click', openEditor);
  for (const [index, key] of tabKeys.entries()) {
    const button = get('tab-' + key);
    button.addEventListener('click', () => switchTab(key));
    button.addEventListener('keydown', event => {
      const navigation: Record<string, number> = { ArrowRight: (index + 1) % tabKeys.length, ArrowLeft: (index + tabKeys.length - 1) % tabKeys.length, Home: 0, End: tabKeys.length - 1 };
      const next = tabKeys[navigation[event.key]];
      if (!next) return;
      event.preventDefault();
      switchTab(next);
      get('tab-' + next).focus();
    });
  }
  renderPanel();
}

function switchTab(next: ReportTab) {
  tab = next;
  for (const key of tabKeys) {
    const button = get('tab-' + key);
    button.setAttribute('aria-selected', String(key === tab));
    button.tabIndex = key === tab ? 0 : -1;
  }
  get('panel').setAttribute('aria-labelledby', 'tab-' + tab);
  renderPanel();
}

function overview({ result, analysis, resume, feedback }: ScanReport) {
  const suggestions = result.improvements.map(check => `<li><div class="suggestion-title"><h3>${escape(check.title)}</h3>
    <span>+${check.max - check.points} pts</span></div><p>${escape(check.advice)}</p>${check.evidence ? `<small>${escape(check.evidence)}</small>` : ''}</li>`).join('');
  const profile = resume.profile;
  const roles = profile.entries.filter(item => item.kind === 'experience').length;
  const summary = resume.sections.filter(section => section.key === 'summary').flatMap(section => section.lines).join(' ');
  return `<section class="card profile-overview" aria-label="Profile overview">
    <div class="profile-intro"><span class="tile">${icon('file-text')}</span><div><h2>${escape(resume.contact.name || 'Extracted profile')}</h2>
    ${resume.contact.title ? `<p>${escape(resume.contact.title)}</p>` : ''}</div></div>
    ${summary ? `<p class="profile-summary">${escape(summary)}</p>` : ''}
    <dl class="profile-stats"><div><dt>Detected roles</dt><dd>${roles}</dd></div><div><dt>Detected skills</dt><dd>${profile.skills.length}</dd></div>
    <div><dt>Employment timeline</dt><dd>${escape(profile.experience.label)}</dd></div></dl>
    <p class="muted timeline-note">${escape(profile.experience.notes.join(' '))}</p>
    </section><div class="report-grid"><section class="card report-card"><h2>Score breakdown</h2>
    <div class="metric-list">${categoryRows(result.categories)}</div>
    <p class="score-basis">${result.mode === 'job-specific' ? 'Job-specific readiness' : 'General resume readiness'} · Rubric ${escape(result.rubricVersion)}</p>
    ${result.notes.length ? `<ul class="score-notes">${result.notes.map(note => `<li>${escape(note)}</li>`).join('')}</ul>` : ''}
    <div class="rubric">${result.categories.map(category => `<details><summary>${escape(category.title)} ${icon('chevron-down')}</summary>
    <ul>${category.checks.map(check => `<li><span>${escape(check.title)}<small class="check-explanation">${escape(check.evidence)}</small></span><b>${check.points}/${check.max}</b></li>`).join('')}</ul></details>`).join('')}</div>
    </section><section class="card report-card"><h2>What to improve</h2>
    <p class="muted">Ordered by potential points in this scan.</p>
    ${suggestions ? `<ol class="suggestions">${suggestions}</ol>` : '<p>Every check earned full points in this scan.</p>'}</section></div>
  ${feedback.length ? `<section class="card report-card ai-improvements"><h2>Edits to work on</h2><p class="muted">Specific passages to review in your resume.</p><ul class="feedback-list">
    ${feedback.map(item => `<li><div class="suggestion-title"><h3>${escape(item.title)}</h3><span>${escape(item.priority)} priority</span></div>
    <p class="feedback-section">${escape(sectionTitles[item.section] || item.section)}</p><blockquote>${escape(item.evidence)}</blockquote><p>${escape(item.detail)}</p></li>`).join('')}</ul></section>` : ''}
  ${profile.issues.length ? `<section class="card report-card ai-improvements"><h2>Profile checks</h2><ul class="suggestions">
    ${profile.issues.map(item => `<li><h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p><small>${escape(item.evidence)}</small></li>`).join('')}</ul></section>` : ''}
  ${analysis?.improvements.length ? `<section class="card report-card ai-improvements"><h2>AI editing suggestions</h2>
    <ul class="suggestions">${analysis.improvements.map(item => `<li><h3>${escape(item.title)}</h3>
      <p>${escape(item.action)}</p><blockquote>${escape(item.evidence)}</blockquote></li>`).join('')}</ul></section>` : ''}`;
}

const entryLabels = {
  experience: 'Experience', education: 'Education', project: 'Projects', credential: 'Credentials',
  volunteer: 'Volunteering', publication: 'Publications', award: 'Awards', other: 'Other experience',
};

type ParsedProfile = ScanReport['resume']['profile'] | NonNullable<ScanReport['analysis']>;

function profileSections(analysis: ParsedProfile) {
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

function parsed({ resume, analysis }: ScanReport) {
  const { contact, sections, extractedText, skills, dates, header } = resume;
  const field = (title: string, value: string | string[]) => {
    const values = Array.isArray(value) ? value : [value];
    return `<div><dt>${title}</dt><dd>${values.some(Boolean) ? values.map(escape).join('<br>') : '<span class="muted">Not detected</span>'}</dd></div>`;
  };
  return `<div class="report-grid parsed-grid"><div class="parsed-sections">
    <section class="card report-card"><div class="section-heading"><h2>Contact details</h2><button class="secondary" type="button" id="download-json">${icon('download')} Profile JSON</button></div><dl class="fields">
      ${field('Name', contact.name)}${field('Title', contact.title)}${field('Email', contact.email)}${field('Phone', contact.phone)}
      ${field('Location', contact.location)}${field('Links', contact.links)}</dl></section>
    ${header.length ? `<section class="card report-card"><h2>Resume header</h2><ul class="section-lines">${header.map(line => `<li>${escape(line)}</li>`).join('')}</ul></section>` : ''}
    ${profileSections(analysis?.entries.length ? analysis : resume.profile)}
    <section class="card report-card"><h2>Source sections</h2><div class="rubric">
    ${sections.filter(section => section.lines.length).map(section => `<details><summary>${escape(section.label || sectionTitles[section.key])}${icon('chevron-down')}</summary>
      <ul class="section-lines">${section.lines.map(line => `<li>${escape(line)}</li>`).join('')}</ul></details>`).join('')}</div></section>
    <section class="card report-card"><h2>Detected skills & dates</h2><dl class="fields">${field('Skills', skills)}${field('Date ranges', dates)}</dl></section>
    </div><section class="card report-card raw"><div class="section-heading"><h2>Extracted text</h2><button type="button" class="secondary" id="copy">${icon('copy')} Copy</button></div>
    <pre>${escape(extractedText.replace(/\f/g, '\n'))}</pre></section></div>`;
}

function keywords({ result, ml }: ScanReport) {
  return keywordComparison(result) + modelMatches(ml);
}

const reviewLabels = {
  supported: 'Evidence found', partial: 'Partial evidence', absent: 'No supporting evidence', related: 'Related passages',
};

function evidenceExcerpts(evidence: ModelMatch['evidence']) {
  if (!evidence.length) return '<p class="muted">No passage met the evidence checks.</p>';
  return evidence.map(item => {
    const section = item.source?.heading || sectionTitles[item.section] || item.section;
    const source = item.source ? `${section} · section line ${item.source.line}` : section;
    return `<div class="model-evidence"><div><span>${escape(source)}</span></div><blockquote>${escape(item.text)}</blockquote></div>`;
  }).join('');
}

function modelMatches(ml: ScanReport['ml']) {
  if (!ml) return '';
  const limited = ml.evidenceCount < ml.totalEvidence || ml.requirementCount < ml.totalRequirements;
  const method = ml.reranker ? `The ${escape(ml.reranker.model)} checks shortlisted passages against each job criterion.` :
    ml.rerankerUnavailable ? 'The reranker was unavailable, so these results use embedding similarity.' : 'The qualification checks left no passages to rerank.';
  return `<section class="card report-card model-matches"><div class="section-heading"><h2>Related experience</h2><span class="optional">${escape(ml.model)} · Local ML</span></div>
    <p class="muted">Review the resume excerpts for each requirement and see where evidence covers only part of a duty.</p>
    <p class="model-coverage">Compared ${ml.requirementCount}/${ml.totalRequirements} job passages with ${ml.evidenceCount}/${ml.totalEvidence} resume passages.${limited ? ' The analysis reached the passage limit.' : ''}</p>
    <ul class="model-list">${ml.matches.map(match => `<li><span class="model-status" data-status="${match.status}">${reviewLabels[match.status]}</span>
      <h3>${escape(match.requirement)}</h3>${match.alternatives ? '<p class="muted">Either option can meet this requirement.</p>' : ''}${match.parts ? `<ul class="model-parts">${match.parts.map(part => `<li>
        <h4>${escape(part.requirement)}</h4>${evidenceExcerpts(part.evidence)}</li>`).join('')}</ul>` : evidenceExcerpts(match.evidence)}</li>`).join('')}</ul>
    <details class="model-method"><summary>About local evidence search ${icon('chevron-down')}</summary><p>${escape(ml.model)} retrieves related English passages. ${method} These suggestions earn no score points.</p>
      <a href="${embeddingModel.card}" target="_blank" rel="noreferrer">BGE model card ${icon('arrow-up-right')}</a>
      ${ml.reranker ? `<a href="${rerankingModel.card}" target="_blank" rel="noreferrer">Reranker model card ${icon('arrow-up-right')}</a>` : ''}</details>
  </section>`;
}

const evidenceLabels = { demonstrated: 'Supporting context', listed: 'Listed claim', summary: 'Summary claim', missing: '' };

function keywordComparison(result: ScoreResult) {
  const comparison = result.keywords;
  if (!comparison.total) return `<section class="card report-card keyword-empty"><span class="tile">${icon('target')}</span><h2>Job keyword match</h2><p>${
    comparison.provided ? 'The job description had no recognizable keywords. Include explicit requirements such as a “Required skills:” list.' :
    'Add a job description before scanning to compare the role’s keywords with your resume.'
  }</p><button class="secondary" id="add-job" type="button">Add job description ${icon('arrow-right')}</button></section>`;
  const list = (terms: typeof comparison.matched, matched: boolean) => terms.length ? `<ul class="keyword-list">${terms.map(term => `<li>
    <span class="tile ${matched ? 'matched' : 'missing'}">${icon(matched ? 'check' : 'search')}</span><div><strong>${escape(term.label)}</strong>
    ${term.preferred ? '<span class="optional">Preferred</span>' : ''}
    ${term.kind && matched ? `<span class="optional">${evidenceLabels[term.kind]}</span>` : ''}
    ${term.jobEvidence ? `<p><b>Job</b> ${escape(term.jobEvidence)}</p>` : ''}
    ${term.reason ? `<p>${escape(term.reason)}</p>` : ''}
    ${term.evidence ? `<p><b>Resume</b> ${escape(term.evidence)}</p>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">No terms in this group.</p>';
  return `<div class="report-grid"><section class="card report-card"><h2>${comparison.semantic ? 'Supported requirements' : 'Matched keywords'} <span class="count">${comparison.matched.length}</span></h2>
    <p class="muted">Evidence found in your resume.</p>${list(comparison.matched, true)}</section>
    <section class="card report-card"><h2>${comparison.semantic ? 'Requirements without evidence' : 'Missing keywords'} <span class="count">${comparison.missing.length}</span></h2>
    <p class="muted">Add clearer evidence where you meet a requirement.</p>${list(comparison.missing, false)}</section></div>`;
}

function renderPanel() {
  const scan = current;
  if (!scan) return;
  const { result, resume, analysis } = scan;
  get('panel').innerHTML = { overview, parsed, keywords }[tab](scan);
  document.getElementById('download-json')?.addEventListener('click', () => {
    const profile = { schemaVersion: 1, filename: resume.metadata.fileName, revision: scan.revision,
      textSource: resume.metadata.textEdited ? 'edited' : 'file-extraction',
      contact: resume.contact, profile: resume.profile, score: result, feedback: scan.feedback,
      aiAnalysis: analysis || null, relatedEvidence: scan.ml || null,
      jobDescription: scan.settings.job, analyzedText: resume.extractedText };
    downloadFile('shortlist-profile.json', JSON.stringify(profile, null, 2), 'application/json');
  });
  const copyButton = document.getElementById('copy');
  copyButton?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(resume.extractedText.replace(/\f/g, '\n'));
      copyButton.textContent = 'Copied';
    } catch {
      const selection = window.getSelection();
      const raw = report.querySelector('pre');
      if (!selection || !raw) return;
      const range = document.createRange();
      range.selectNodeContents(raw);
      selection.removeAllRanges();
      selection.addRange(range);
      copyButton.textContent = 'Text selected';
    }
  });
  document.getElementById('add-job')?.addEventListener('click', () => {
    current = undefined;
    report.hidden = true;
    report.replaceChildren();
    get('scanner').hidden = false;
    get('job-panel').open = true;
    get('job').focus();
  });
}

function downloadReport() {
  if (!current) return;
  const { result, resume, analysis, aiNote, ml, mlNote } = current;
  const lines = ['Shortlist resume report', resume.metadata.fileName, `ATS score: ${result.score}/100`, '',
    ...result.categories.flatMap(category => [
      `${category.title}: ${category.points}/${category.max}`,
      ...category.checks.map(check => `  ${check.title}: ${check.points}/${check.max}`),
    ]), '', 'Improvements', ...result.improvements.map(check => `- ${check.title} (+${check.max - check.points}): ${check.advice}`)];
  lines.splice(3, 0, 'Text source: ' + (resume.metadata.textEdited ? 'Edited text' : 'File extraction'), 'Revision: ' + current.revision);
  lines.splice(3, 0, 'Scoring rubric: ' + result.rubricVersion + ' · ' + result.mode);
  lines.push('', 'Scoring notes', ...result.notes);
  if (current.previous) lines.push('', `Previous score: ${current.previous.score}/100`,
    current.previous.jobChanged ? 'Job description changed for this revision.' : 'The job description is the same as the previous revision.');
  if (current.feedback.length) lines.push('', 'Edits to work on', ...current.feedback.map(item => `- ${item.title}\n  Source: ${item.evidence}\n  ${item.detail}`));
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
  lines.push('', 'Employment timeline', resume.profile.experience.label, ...resume.profile.experience.notes,
    '', 'Profile entries', ...resume.profile.entries.map(item =>
      `- ${item.kind}: ${[item.title, item.organization, item.dates].filter(Boolean).join(' · ')}\n  Source: ${item.evidence.join(' | ')}`));
  if (ml) {
    lines.push('', `Related experience (${ml.model}, revision ${ml.revision})`,
      ...(ml.reranker ? [`Reranked with ${ml.reranker.model}, revision ${ml.reranker.revision}`] :
        ml.rerankerUnavailable ? ['Embedding search only. The reranker was unavailable.'] : []),
      `Compared ${ml.requirementCount}/${ml.totalRequirements} job passages and ${ml.evidenceCount}/${ml.totalEvidence} resume passages.`,
      'Model suggestions earn no score points.',
      ...ml.matches.flatMap(match => [`${reviewLabels[match.status]} · ${match.requirement}`,
        ...(match.alternatives ? ['  Either option can meet this requirement.'] : []),
        ...(match.parts ?? [match]).flatMap(part => [
          ...(match.parts ? [`  ${part.requirement}`] : []),
          ...(part.evidence.length ? part.evidence.map(item => `    - ${item.text}`) : ['    No supporting excerpt found.']),
        ])]));
  }
  const warnings = [aiNote, mlNote, resume.metadata.layoutWarning, ...(resume.metadata.warnings || [])].filter((value): value is string => Boolean(value));
  if (resume.metadata.ocrPages) warnings.unshift('English OCR applied. Verify the extracted text against the original.');
  if (warnings.length) lines.push('', 'Extraction notes', ...warnings);
  lines.push('', resume.metadata.textEdited ? 'Analyzed text (edited)' : 'Extracted text', resume.extractedText.replace(/\f/g, '\n'));
  downloadFile('shortlist-resume-report.txt', lines.join('\n'), 'text/plain');
}

function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
