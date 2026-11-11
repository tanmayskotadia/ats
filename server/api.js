import express from 'express';
import { parseResume, redactContact } from '../src/resume.js';
import { requestSchema } from './analysis.js';
import { createAnalyzer } from './provider.js';
import { createLimiter, integer } from './limits.js';

export function createApi(env, { analyze = createAnalyzer(env), log = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', integer(env.TRUST_PROXY_HOPS, 0, 0, 8));
  const limiter = analyze ? createLimiter(env) : null;
  const concurrency = integer(env.AI_CONCURRENCY, 6, 1, 100);
  const timeout = integer(env.AI_TIMEOUT_MS, 45000, 1000, 120000);
  let inFlight = 0;
  app.use('/api', (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/healthz', (request, response) => response.json({ ok: true }));
  app.get('/api/status', (request, response) => response.json({ aiEnabled: Boolean(analyze) }));

  app.post('/api/analyze', (request, response, next) => {
    if (request.get('sec-fetch-site') === 'cross-site') return response.status(403).json({ error: 'Use the app on the same origin.' });
    if (!request.is('application/json')) return response.status(415).json({ error: 'Send a JSON request.' });
    if (!analyze) return response.status(503).json({ error: 'AI parsing is not configured on this server.' });
    next();
  }, express.json({ limit: '512kb', inflate: false }), async (request, response) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Resume or job text is missing or exceeds the analysis limit.' });
    if (inFlight >= concurrency) {
      return response.set('Retry-After', '3').status(429).json({ error: 'AI parsing is busy. Try again in a few seconds.' });
    }
    inFlight += 1;
    const disconnected = new AbortController();
    const deadline = AbortSignal.timeout(timeout);
    const signal = AbortSignal.any([deadline, disconnected.signal]);
    const abortOnClose = () => { if (!response.writableEnded) disconnected.abort(); };
    response.once('close', abortOnClose);
    const started = Date.now();
    try {
      if (!await limiter.allow(request.ip || request.socket.remoteAddress || 'unknown')) {
        const retryAfter = 60 - Math.floor(Date.now() / 1000) % 60;
        return response.set('Retry-After', String(retryAfter)).status(429).json({ error: 'AI scan limit reached. Try again in a minute.' });
      }
      const input = parsed.data;
      const resume = parseResume(input.resume);
      const sanitized = { ...input, resume: redactContact(resume.text, resume.contact) };
      const analysis = await analyze(sanitized, signal);
      log.info(JSON.stringify({ event: 'ai_analysis', status: 'ok', durationMs: Date.now() - started }));
      return response.json(analysis);
    } catch {
      if (disconnected.signal.aborted) return;
      log.warn(JSON.stringify({ event: 'ai_analysis', status: deadline.aborted ? 'timeout' : 'failed', durationMs: Date.now() - started }));
      return response.status(deadline.aborted ? 504 : 503).json({ error: deadline.aborted ?
        'AI parsing timed out. Try again.' : 'AI parsing is temporarily unavailable. Try again.' });
    } finally {
      response.off('close', abortOnClose);
      inFlight -= 1;
    }
  });
  app.use('/api', (request, response) => response.status(404).json({ error: 'Unknown API route.' }));
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    return response.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid or oversized request body.' });
  });
  return { app, close: () => limiter?.close() };
}
