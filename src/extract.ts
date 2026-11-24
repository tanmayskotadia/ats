import type { Unzipped } from 'fflate';
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist';
import type { Worker as OCRWorker } from 'tesseract.js';
import { cleanText, datesIn, unique } from './resume.ts';
import type { ProgressCallback, ResumeMetadata } from './resume.ts';

export const maxSize = 15 * 1024 * 1024;
export const supportedExtensions = ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg'] as const;
const maxPages = 20;
const allowedLink = /^(?:https?:\/\/|mailto:)/i;

type SupportedExtension = (typeof supportedExtensions)[number];
type ExtractedContent = ResumeMetadata & { text: string };
type PageTextItems = Awaited<ReturnType<PDFPageProxy['getTextContent']>>['items'];
type TextSpan = { text: string; x: number; y: number; right: number; size: number };
type TextRow = { y: number; size: number; spans: TextSpan[] };

export function validateFile(file: File): SupportedExtension {
  const suffix = file.name.split('.').at(-1)?.toLowerCase();
  const extension = supportedExtensions.find(candidate => candidate === suffix);
  if (!extension) throw new Error('Choose a PDF, DOCX, TXT, PNG, or JPG file.');
  if (file.size === 0) throw new Error('This file is empty. Choose a resume with readable content.');
  if (file.size > maxSize) throw new Error('This file exceeds 15 MB. Choose a smaller export.');
  return extension;
}

function layoutPage(items: PageTextItems, viewport: PageViewport) {
  const spans = items.flatMap(item => {
    if (!('str' in item) || !item.str.trim()) return [];
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    return [{ text: item.str, x, y, right: x + Math.abs(item.width), size: Math.abs(item.height) || 10 }];
  }).sort((first, second) => first.y - second.y);
  const rows: TextRow[] = [];
  for (const span of spans) {
    const row = rows.at(-1);
    if (row && Math.abs(row.y - span.y) <= Math.max(2, Math.min(span.size, row.size) * 0.3)) {
      row.spans.push(span);
    } else {
      rows.push({ y: span.y, size: span.size, spans: [span] });
    }
  }
  for (const row of rows) row.spans.sort((first, second) => first.x - second.x);

  const gap = viewport.width * 0.065;
  const candidates = rows.flatMap(row => row.spans.slice(1).flatMap((span, index) => {
    const left = row.spans[index].right;
    if (span.x - left < gap || span.x <= viewport.width * 0.25 || left >= viewport.width * 0.75) return [];
    const trailingText = cleanText(row.spans.slice(index + 1).map(item => item.text).join(' '));
    if (datesIn(trailingText).includes(trailingText) || /^\d{4}$/.test(trailingText)) return [];
    return [{ left, right: span.x, y: row.y }];
  }));
  const columns = candidates.map(candidate => {
    const x = (candidate.left + candidate.right) / 2;
    return { x, overlap: candidates.filter(other => other.left < x && other.right > x) };
  }).sort((first, second) => second.overlap.length - first.overlap.length)[0];

  const join = (spans: TextSpan[]) => spans.map((span, index) => {
    const previous = spans[index - 1];
    if (!previous || /\s$/.test(previous.text) || /^\s/.test(span.text)) return span.text;
    return (span.x - previous.right > span.size * 0.15 ? ' ' : '') + span.text;
  }).join('').trim();
  if (!columns || columns.overlap.length < 4) {
    return { text: rows.map(row => join(row.spans)).join('\n'), columns: false };
  }
  const startY = Math.min(...columns.overlap.map(item => item.y));
  const endY = Math.max(...columns.overlap.map(item => item.y));
  const output: string[] = [];
  let left: string[] = [];
  let right: string[] = [];
  function flushColumns() {
    output.push(...left, ...right);
    left = [];
    right = [];
  }
  for (const row of rows) {
    if (row.y < startY - 24 || row.y > endY + 24 || row.spans.some(span => span.x < columns.x && span.right > columns.x)) {
      flushColumns();
      output.push(join(row.spans));
    } else {
      const leftLine = join(row.spans.filter(span => span.x < columns.x));
      const rightLine = join(row.spans.filter(span => span.x >= columns.x));
      if (leftLine) left.push(leftLine);
      if (rightLine) right.push(rightLine);
    }
  }
  flushColumns();
  return { text: output.join('\n'), columns: true };
}

async function makeOCR(progress: ProgressCallback) {
  const [{ createWorker }, { default: workerPath }, { default: corePath }] = await Promise.all([
    import('tesseract.js'),
    import('tesseract.js/dist/worker.min.js?url'),
    import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
  ]);
  const absolute = (path: string) => new URL(path, document.baseURI).href;
  return createWorker('eng', 1, {
    workerPath: absolute(workerPath),
    corePath: absolute(corePath),
    langPath: absolute(import.meta.env.BASE_URL).replace(/\/$/, ''),
    workerBlobURL: false,
    logger: event => {
      if (event.status === 'recognizing text') progress(`Reading scan… ${Math.round(event.progress * 100)}%`);
    },
  });
}

async function extractPdf(bytes: Uint8Array<ArrayBuffer>, progress: ProgressCallback): Promise<ExtractedContent> {
  const [pdf, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdf.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdf.getDocument({ data: bytes, stopAtErrors: false });
  const pages: string[] = [];
  const links: string[] = [];
  const warnings: string[] = [];
  let worker: OCRWorker | undefined;
  let ocrPages = 0;
  let layoutWarning = '';
  let pageCount: number;
  try {
    const document = await task.promise;
    pageCount = document.numPages;
    if (pageCount > maxPages) throw new Error(`This PDF has ${pageCount} pages. Upload a resume with ${maxPages} pages or fewer.`);
    for (let index = 1; index <= pageCount; index += 1) {
      progress(`Reading page ${index} of ${pageCount}…`);
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const result = layoutPage(content.items, page.getViewport({ scale: 1 }));
      if (result.columns) layoutWarning = 'Possible multi-column layout detected';
      let text = result.text;
      if ((text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 35) {
        let canvas: HTMLCanvasElement | undefined;
        try {
          worker ??= await makeOCR(progress);
          const unscaled = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2.6, 2400 / Math.max(unscaled.width, unscaled.height)) });
          canvas = globalThis.document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          const { data } = await worker.recognize(canvas);
          ocrPages += 1;
          if (data.text.trim().length > text.trim().length) text = data.text;
          if (data.confidence < 70) warnings.push(`Page ${index} has low OCR confidence. Check it against the original.`);
        } catch {
          warnings.push(`Scan recognition could not finish on page ${index}.`);
        } finally {
          if (canvas) canvas.width = canvas.height = 0;
        }
      }
      pages.push(text);
      const annotations: unknown[] = await page.getAnnotations().catch(() => []);
      for (const annotation of annotations) {
        if (typeof annotation === 'object' && annotation !== null && 'url' in annotation &&
          typeof annotation.url === 'string' && allowedLink.test(annotation.url)) links.push(annotation.url);
      }
      page.cleanup();
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('This PDF is password-protected. Save an unlocked copy and try again.');
    if (error instanceof Error && error.name === 'InvalidPDFException') throw new Error('This PDF could not be opened. Try exporting a fresh copy.');
    throw error;
  } finally {
    if (worker) await worker.terminate();
    await task.destroy();
  }
  return { text: pages.join('\n\f\n'), pageCount, links: unique(links), ocrPages, layoutWarning, warnings };
}

async function extractDocx(bytes: Uint8Array<ArrayBuffer>): Promise<ExtractedContent> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const partPattern = /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/;
  const relationshipPattern = /^word\/_rels\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml\.rels$/;
  let expandedSize = 0;
  let files: Unzipped;
  try {
    files = unzipSync(bytes, {
      filter: entry => {
        if (!partPattern.test(entry.name) && !relationshipPattern.test(entry.name)) return false;
        expandedSize += entry.originalSize;
        if (expandedSize > 12 * 1024 * 1024) throw new Error('Expanded DOCX too large');
        return true;
      },
    });
  } catch {
    throw new Error('This DOCX could not be opened. Try exporting a fresh copy.');
  }
  if (!files['word/document.xml']) throw new Error('This file does not contain a Word document.');
  const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const strictW = 'http://purl.oclc.org/ooxml/wordprocessingml/main';
  const parser = new DOMParser();
  const parts = Object.keys(files).filter(name => partPattern.test(name)).sort((first, second) => {
    const order = (path: string) => path.includes('header') ? 0 : path.includes('document') ? 1 : 2;
    return order(first) - order(second) || first.localeCompare(second, undefined, { numeric: true });
  });
  let complexLayout = false;
  const links: string[] = [];
  const textParts: string[] = [];
  for (const path of parts) {
    const xml = parser.parseFromString(strFromU8(files[path]), 'application/xml');
    if (xml.querySelector('parsererror')) {
      if (path === 'word/document.xml') throw new Error('The DOCX text is damaged. Try exporting a fresh copy.');
      continue;
    }
    const namespace = xml.documentElement.namespaceURI === strictW ? strictW : w;
    if (xml.getElementsByTagNameNS(namespace, 'tbl').length || xml.getElementsByTagNameNS(namespace, 'txbxContent').length) complexLayout = true;
    const paragraphs = [...xml.getElementsByTagNameNS(namespace, 'p')];
    const readParagraph = (node: Element): string => {
      if (node.namespaceURI === namespace) {
        if (['del', 'moveFrom', 'p', 'txbxContent', 'instrText'].includes(node.localName)) return '';
        if (node.localName === 't') return node.textContent ?? '';
        if (node.localName === 'tab') return ' ';
        if (node.localName === 'br' || node.localName === 'cr') return '\n';
      }
      return [...node.children].map(readParagraph).join('');
    };
    const lines = paragraphs.filter(paragraph => {
      for (let parent = paragraph.parentElement; parent; parent = parent.parentElement) {
        if (parent.namespaceURI === namespace && ['del', 'moveFrom'].includes(parent.localName)) return false;
      }
      return true;
    }).map(paragraph => {
      const content = [...paragraph.children].map(readParagraph).join('').trim();
      if (!content) return '';
      const list = paragraph.getElementsByTagNameNS(namespace, 'numPr').length;
      return list ? '• ' + content : content;
    }).filter(Boolean);
    if (lines.length) textParts.push(lines.join('\n'));
    const relativePath = 'word/_rels/' + path.split('/').at(-1) + '.rels';
    if (files[relativePath]) {
      const relationships = parser.parseFromString(strFromU8(files[relativePath]), 'application/xml');
      for (const link of relationships.getElementsByTagNameNS('*', 'Relationship')) {
        const target = link.getAttribute('Target');
        if (target && link.getAttribute('Type')?.endsWith('/hyperlink') && allowedLink.test(target)) links.push(target);
      }
    }
  }
  return {
    text: unique(textParts).join('\n\n'),
    links: unique(links),
    layoutWarning: complexLayout ? 'Word tables or text boxes detected' : '',
  };
}

async function extractImage(file: File, progress: ProgressCallback): Promise<ExtractedContent> {
  progress('Preparing image recognition…');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  let worker: OCRWorker | undefined;
  try {
    const scale = Math.min(2400 / Math.max(bitmap.width, bitmap.height), 2);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser cannot create an image canvas for OCR.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    worker = await makeOCR(progress);
    const { data } = await worker.recognize(canvas);
    return {
      text: data.text,
      pageCount: 1,
      ocrPages: 1,
      warnings: data.confidence < 70 ? ['The image has low OCR confidence. Check the extracted text against the original.'] : [],
    };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
    if (worker) await worker.terminate();
  }
}

export async function extractResume(
  file: File,
  progress: ProgressCallback = () => {},
): Promise<ExtractedContent & { fileName: string; extension: SupportedExtension }> {
  const extension = validateFile(file);
  progress('Extracting resume text…');
  let result: ExtractedContent;
  if (extension === 'pdf' || extension === 'docx' || extension === 'txt') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (extension === 'pdf') result = await extractPdf(bytes, progress);
    else if (extension === 'docx') result = await extractDocx(bytes);
    else {
      let encoding = 'utf-8';
      if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
      if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
      const decoded = new TextDecoder(encoding).decode(bytes);
      const text = encoding === 'utf-8' && decoded.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : decoded;
      result = { text };
    }
  } else {
    result = await extractImage(file, progress);
  }
  if (result.text.includes('\0') || (result.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 10) {
    throw new Error('Very little readable text was found. Try a clearer scan or a text-based PDF, DOCX, or TXT export.');
  }
  return { ...result, fileName: file.name, extension };
}
