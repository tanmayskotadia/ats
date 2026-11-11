import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  timeout: 60000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'npm start',
    env: { PORT: '4173', HOST: '127.0.0.1', OPENAI_API_KEY: '', REDIS_URL: '' },
    url: 'http://127.0.0.1:4173',
  },
});
