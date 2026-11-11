import { defineConfig, loadEnv } from 'vite';
import { createApi } from './server/api.js';

export default defineConfig(({ mode }) => ({
  plugins: [{
    name: 'shortlist-api',
    configureServer(server) {
      const { app, close } = createApi({ ...loadEnv(mode, process.cwd(), ''), ...process.env });
      server.middlewares.use((request, response, next) => {
        if (/^\/(?:api(?:\/|\?|$)|healthz(?:\?|$))/.test(request.url)) return app(request, response, next);
        next();
      });
      server.httpServer?.once('close', close);
    },
  }],
}));
