# Shortlist

Shortlist reads a resume, shows what it extracted, and returns an ATS readiness score out of 100. Analyze one file or upload up to 20 resumes against a shared job description. Each file has its own report, and a batch can be exported as a CSV summary.

## Run locally

Requires Node.js 22.13+.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Local parsing works immediately. For AI, copy `.env.example` to `.env`, set `OPENAI_API_KEY`, and restart the server. Enable **AI-assisted parsing** before scanning. The default model is `gpt-5.6-terra`. Set `OPENAI_MODEL` to override it with a model that supports Structured Outputs on the OpenAI Responses API. Keep the key server-side.

## Local ML and profile reading

**Local ML evidence search** uses the pretrained MiniLM-L6-v2 sentence embedding model to retrieve resume passages related to job requirements. It runs in a browser worker with ONNX Runtime and needs no API key. The existing Tesseract LSTM model handles English scans. Neither model has been trained on private resume data by this project.

To serve the pinned MiniLM weights with your app, download them before starting or building.

```sh
npm run models:download
npm run dev
```

The weights are about 23 MB. The local ML runtime is also downloaded by the browser on first use. If the host has no model files, the worker downloads the pinned model from Hugging Face and caches it where the browser supports caching. Resume and job text are processed locally by this feature. `public/models/` and generated runtime assets are ignored by Git. Run the download command before the production build to include the weights in `dist/`.

- Profiles group employment, education, projects, and credentials with their source lines. Skills are detected in both the Skills section and role descriptions, including common aliases.
- Employment duration uses the union of explicit month ranges, so overlapping roles count once. Year-only, missing, reversed, and future dates are flagged. The month total is an estimate from calendar months and includes internships that appear under Experience.
- ML compares up to 36 job passages against 160 resume passages, with a 420-character limit per chunk and a tokenizer limit of 192 tokens. Reports show when the passage limit was reached. At most one inference job runs at a time per browser, sharing the loaded model across the batch.
- The report shows the two nearest passages whose cosine similarity is at least 0.35. Similarity is a retrieval measure and earns no score points. This threshold has not been calibrated on hiring outcomes. English paraphrases can be helpful, while tools, credentials, durations, and negation still need checking against the source.
- Model failure and timeout preserve the profile and keyword report and display a note. Machine learning runs only when the checkbox is enabled and a job description is present.

## Parsing and scoring

- Text-based or scanned PDF, DOCX, TXT, PNG, and JPEG. Files are limited to 15 MB and PDFs to 20 pages.
- PDF reading order is estimated from text coordinates. Pages with little embedded text and image uploads use English OCR. Word extraction includes visible paragraph text from the body, tables, text boxes, headers, footers, and notes. Image-only content inside DOCX is not OCRed.
- Local mode detects headings, contact details, dates, impact statements, and keywords. It keeps resume text in the browser.
- In AI mode, Shortlist sends extracted resume text and the job description to OpenAI after masking detected resume emails and phone numbers. Files are never uploaded. The app does not persist resume text or AI results, and the Responses API request sets `store: false`. See [OpenAI's data controls](https://developers.openai.com/api/docs/guides/your-data) for provider-side handling.
- The AI extracts roles, education, credentials, projects and other entries into a structured schema. The server verifies the cited excerpts against the source text. Job matching can recognize equivalent experience and displays the excerpt behind each semantic match. Editing suggestions are linked to source text and should be reviewed. If the service is unavailable, the report identifies the local parser as its fallback.
- The app calculates the score. The model does not choose the number. Employer ATS criteria vary.
- Repeated or very short accomplishment statements earn no extra impact points. Denied skills earn no keyword credit, and duration or credential requirements need explicit supporting evidence.

| Category | Points |
| --- | ---: |
| ATS readability | 20 |
| Resume structure | 25 |
| Experience and impact | 30 |
| Content coverage or job match | 25 |

When a job description yields usable criteria, weighted job coverage replaces content coverage. Preferred requirements carry half the weight. With AI disabled or without grounded AI criteria, Shortlist compares job keywords using a skills vocabulary, aliases and labeled lists.

## Run in production

```sh
npm ci
npm run models:download
npm run build
npm start
```

The Node server serves the app and API on one port. Use `HOST=0.0.0.0` for a container, `PORT` for the assigned port, and `GET /healthz` for a health check. Replicas can run behind a TLS load balancer without sticky sessions.

- Set `REDIS_URL` to a shared Redis service so per-client and global AI quotas apply across replicas. Without Redis, quotas apply separately to each process. When configured Redis is unavailable, the AI route returns a temporary error and the browser can still produce a local report.
- Tune `AI_CONCURRENCY` per replica and `AI_REQUESTS_PER_MINUTE` for the model quota. Batch uploads process at most two files concurrently in the browser. The API also caps request size, concurrent inference, retries, and inference time.
- `TRUST_PROXY_HOPS` should match the trusted proxy path. Leave it at zero if users can reach the origin directly. For an internal deployment, place the app behind your existing access control.
- The server logs AI request outcome and latency without document contents. CSV and text downloads can contain filenames and resume excerpts.

## Verify

```sh
npm test
npm run models:download
npm run build
npx playwright install chromium
npm run test:browser
```

The automated AI tests use controlled provider responses to exercise the request contract, grounding, quota handling, and report UI without a billed API call. The actual MiniLM browser test runs when local model files are installed. It verifies paraphrase retrieval and that inference keeps document text on the app origin. Local profile and scoring regression tests cover overlaps, uncertain dates, negation, aliases, duplicate bullets, and unsupported credentials.

Model references are available in the [MiniLM model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) and the [ONNX conversion](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/751bff37182d3f1213fa05d7196b954e230abad9).
