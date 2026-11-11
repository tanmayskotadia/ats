import express from 'express';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';
import { integer } from './limits.js';

const { app, close } = createApi(process.env);
app.use('/assets', express.static(fileURLToPath(new URL('../dist/assets/', import.meta.url)), { immutable: true, maxAge: '1y' }));
app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url))));
const port = integer(process.env.PORT, 5173, 1, 65535);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => console.log('Shortlist listening on http://' + host + ':' + port));
server.requestTimeout = 15000;
server.headersTimeout = 10000;
for (const event of ['SIGINT', 'SIGTERM']) {
  process.once(event, () => {
    server.close(() => { close(); process.exitCode = 0; });
    setTimeout(() => process.exit(1), 65000).unref();
  });
}
