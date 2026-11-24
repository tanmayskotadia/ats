# Shortlist

Shortlist reads a resume, shows what it extracted, and returns an ATS readiness score out of 100. Analyze one file or upload up to 20 resumes against a shared job description. Each file has its own report, and a batch can be exported as a CSV summary.

Use **Edit text and rescan** from a report to correct OCR mistakes or try a resume edit. You can update the job description in the same editor. The app recomputes the profile, score, feedback, and enabled model results and marks reports that use edited text. It keeps the original extraction available to restore during the session. Changes are held in browser memory, and the updated batch row stays associated with its source file. **Profile JSON** in the Parsed resume tab exports structured fields, evidence, feedback, and the current score. Reports also highlight specific passages with vague wording, repeated statements, or missing role details.

## Run locally

Requires Node.js 22.13+.

The browser app, workers, API, and scripts use TypeScript. Vite builds the browser bundle, and Node runs the API and scripts directly with native type stripping. `npm run build` checks types before bundling.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Local parsing works immediately.

For optional AI-assisted parsing, copy `.env.example` to `.env`, configure a server-side key, and restart the server. Enable **AI-assisted parsing** before scanning.

- **Groq** uses `GROQ_API_KEY` and defaults to `openai/gpt-oss-120b`. Set `GROQ_MODEL` to override it with a model that supports strict Structured Outputs. [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs)
- **OpenAI** uses `OPENAI_API_KEY` and defaults to `gpt-5.6-terra`. Set `OPENAI_MODEL` to override it with a model that supports Structured Outputs on the OpenAI Responses API.

Groq takes priority when both keys are set. Leave both keys empty to disable AI-assisted parsing. Keep keys in the server environment or local `.env` file.

## Local ML and profile reading

**Local ML evidence search** uses BGE Base v1.5 to shortlist resume passages and DeBERTa-v3 to check how closely each passage supports the job criterion. Both pretrained English models run in a browser worker with ONNX Runtime. Enable the checkbox and add a job description to use them. No API key or Python service is required.

To serve the pinned model files from your app, download them before starting or building.

```sh
npm run models:download
npm run dev
```

The two models and their tokenizers take about 210 MB, plus the browser ML runtime. When files are missing from the app host, the browser downloads the pinned assets from Hugging Face and caches them where supported. Resume and job text stay in the browser during local inference. `public/models/` and generated runtime assets are ignored by Git. Run the download command before the production build to include the weights in `dist/`.

- Profiles group employment, education, projects, and credentials with their source lines. Skills are detected in both the Skills section and role descriptions, including common aliases.
- Employment duration uses the union of explicit month ranges, so overlapping roles count once. Year-only, missing, reversed, and future dates are flagged. The month total is an estimate from calendar months and includes internships that appear under Experience.
- ML compares up to 36 job criteria against 160 resume passages, with a 420-character limit per chunk and a 192-token model input limit. An app tab handles one ML scan at a time and reuses loaded models and job embeddings across a batch.
- Criterion extraction skips company and benefits sections and preserves concise tools, credentials, and experience requirements. Passage selection filters clearly negated or prospective statements and samples across resume sections when coverage is limited.
- BGE shortlists up to six passages per criterion. DeBERTa compares each shortlisted passage with the requirement and the report shows up to two that pass its relevance cutoff. Review exact tools, credentials, durations, and responsibilities against the source. These suggestions earn no ATS score points.
- If DeBERTa is unavailable, the related-experience view uses BGE similarity and identifies the fallback. If the encoder fails or the scan times out, the profile, scoring, and keyword report remain available.

## Parsing and scoring

- Text-based or scanned PDF, DOCX, TXT, PNG, and JPEG. Files are limited to 15 MB and PDFs to 20 pages.
- PDF reading order is estimated from text coordinates. Pages with little embedded text and image uploads use English OCR. Word extraction includes visible paragraph text from the body, tables, text boxes, headers, footers, and notes. Image-only content inside DOCX is not OCRed.
- Local mode detects headings, contact details, dates, impact statements, and keywords. It keeps resume text in the browser.
- In AI mode, Shortlist sends extracted resume text and the job description to the configured provider after masking detected resume emails and phone numbers. Resume files stay in the browser. Shortlist processes the text and AI result in memory.
- Groq retains usage metadata and may keep inference inputs and outputs for up to 30 days to investigate reliability issues or suspected abuse, subject to legal obligations. Organization admins can enable Zero Data Retention for inference logs. [Groq data controls](https://console.groq.com/docs/your-data)
- The OpenAI Responses API request sets `store: false`. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)
- The AI extracts roles, education, credentials, projects and other entries into a structured schema. The server verifies the cited excerpts against the source text. Job matching can recognize equivalent experience and displays the excerpt behind each semantic match. Editing suggestions are linked to source text and should be reviewed. If the service is unavailable, the report identifies the local parser as its fallback.
- The app calculates the score. The model does not choose the number. Employer ATS criteria vary.
- Repeated or very short accomplishment statements earn no extra impact points. Denied or prospective skills earn no keyword credit, and duration or credential requirements need supporting evidence.

| Category | Points |
| --- | ---: |
| ATS readability | 20 |
| Resume structure | 25 |
| Experience and impact | 30 |
| Content coverage or job match | 25 |

When a job description yields usable criteria, weighted job coverage replaces content coverage. Preferred requirements carry half the weight. With AI disabled or without grounded AI criteria, Shortlist compares job keywords using a skills vocabulary, aliases and labeled lists.

Rubric 2.0 separates job coverage (15 points) from supporting work or study context (10 points). Skill lists and summaries earn half the supporting credit. Company descriptions and benefits are excluded from criteria, and uncovered local criteria stay in the denominator when an AI response covers only part of a posting. Named skill durations use explicit claims or non-overlapping dated roles that cite the skill. Duration inference from a role is an estimate of tool use during that role.

Structure checks use detected fields and valid date coverage across roles. Projects can supply the work-evidence check when employment is absent. Impact checks distinguish measured changes (up to 12 points) from qualitative outcomes and scale counts. Numeric variants of a statement count once, and scale counts alone earn at most two outcome points. A substantive summary is optional when work descriptions provide sufficient context. Clear OCR and reconstructed layouts produce review notes. Poor extraction signals reduce credit.

These are transparent heuristics with regression tests. Employer-specific calibration and hiring-outcome validation are unavailable. The report includes the rubric version and evidence for each check so scores can be interpreted consistently.

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
npm run typecheck
npm test
npm run models:download
npm run build
npx playwright install chromium
npm run test:browser
```

The automated AI tests use controlled provider responses to exercise the request contract, grounding, quota handling, and report UI without a billed API call. With the local files installed, browser tests run real BGE and DeBERTa inference on the app origin and check that ML leaves the ATS score unchanged. Local profile and scoring regression tests cover overlaps, uncertain dates, negation, aliases, duplicate bullets, and unsupported credentials.

To compare ranking and false positives with the previous MiniLM model, run the offline benchmark against the manually labeled synthetic requirements and resume excerpts.

```sh
npm run models:download -- --baseline
npm run models:benchmark
```

Model references include the [BGE Base v1.5 model card](https://huggingface.co/BAAI/bge-base-en-v1.5) and the [DeBERTa-v3 NLI model card](https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall).
