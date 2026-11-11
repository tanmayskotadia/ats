# Shortlist

Shortlist reads a resume, shows the extracted text and recognized sections, and returns an ATS readiness score out of 100 with prioritized improvements. Paste a job description to see matched and missing keywords.

## Run locally

Requires Node.js 22.13+.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. For a production build, run `npm run build`. The generated `dist/` is a static site and can be served by any static host. For a local production preview, run `npm run preview`.

## Formats and limits

- Text-based or scanned PDF, DOCX, TXT, PNG, and JPEG. Files are limited to 15 MB and PDFs to 20 pages.
- PDF extraction uses text coordinates to estimate reading order. Pages with little embedded text and image uploads use English OCR.
- Word extraction includes visible paragraph text from the body, tables, text boxes, headers, footers, and notes. Image-only content inside DOCX is not OCRed.
- Extracted text and the scoring report stay in the browser. OCR assets and fonts are served with the app. The report download includes resume text.

## Scoring

| Category | Points |
| --- | ---: |
| ATS readability | 20 |
| Resume structure | 25 |
| Experience and impact | 30 |
| Content coverage or job keyword match | 25 |

Job matching uses a skills vocabulary, common aliases, quoted terms, and labeled skill lists. Terms identified as preferred count half as much as other terms. If no terms can be detected, the scanner uses content coverage. The score is heuristic and employer ATS criteria vary. Review the extracted text for reading-order and OCR errors.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```
