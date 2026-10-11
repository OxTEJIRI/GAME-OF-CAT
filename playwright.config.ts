import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'chrome', viewport: { width: 1280, height: 800 }, screenshot: 'only-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 30_000 },
});
