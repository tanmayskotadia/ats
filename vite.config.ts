import { defineConfig, loadEnv } from 'vite';
import type { Connect } from 'vite';
import { createApi } from './server/api.ts';

export default defineConfig(({ mode }) => ({
  plugins: [{
    name: 'shortlist-api',
    configureServer(server) {
      const { app, close } = createApi({ ...loadEnv(mode, process.cwd(), ''), ...process.env });
      const apiMiddleware: Connect.NextHandleFunction = app;
      server.middlewares.use((request, response, next) => {
        if (request.url && /^\/(?:api(?:\/|\?|$)|healthz(?:\?|$))/.test(request.url)) {
          apiMiddleware(request, response, next);
          return;
        }
        next();
      });
      server.httpServer?.once('close', close);
    },
  }],
}));
