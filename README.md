# Shortlist

Shortlist reads a resume, shows what it extracted, and returns an ATS readiness score out of 100. Analyze one file or upload up to 20 resumes against a shared job description. Each file has its own report, and a batch can be exported as a CSV summary.

## Run locally

Requires Node.js 22.13+.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Local parsing works immediately. For AI, copy `.env.example` to `.env`, set `OPENAI_API_KEY`, and restart the server. Enable **AI-assisted parsing** before scanning. The default model is `gpt-5.6-terra`. Set `OPENAI_MODEL` to override it with a model that supports Structured Outputs on the OpenAI Responses API. Keep the key server-side.

## Parsing and scoring

- Text-based or scanned PDF, DOCX, TXT, PNG, and JPEG. Files are limited to 15 MB and PDFs to 20 pages.
- PDF reading order is estimated from text coordinates. Pages with little embedded text and image uploads use English OCR. Word extraction includes visible paragraph text from the body, tables, text boxes, headers, footers, and notes. Image-only content inside DOCX is not OCRed.
- Local mode detects headings, contact details, dates, impact statements, and keywords. It keeps resume text in the browser.
- In AI mode, Shortlist sends extracted resume text and the job description to OpenAI after masking detected resume emails and phone numbers. Files are never uploaded. The app does not persist resume text or AI results, and the Responses API request sets `store: false`. See [OpenAI's data controls](https://developers.openai.com/api/docs/guides/your-data) for provider-side handling.
- The AI extracts roles, education, credentials, projects and other entries into a structured schema. The server verifies the cited excerpts against the source text. Job matching can recognize equivalent experience and displays the excerpt behind each semantic match. Editing suggestions are linked to source text and should be reviewed. If the service is unavailable, the report identifies the local parser as its fallback.
- The app calculates the score. The model does not choose the number. Employer ATS criteria vary.

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
npm run build
npx playwright install chromium
npm run test:browser
```

The automated AI tests use controlled provider responses to exercise the request contract, grounding, quota handling, and report UI without a billed API call.
