import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  globalSetup: './apps/web/e2e/global-setup.ts',
  globalTeardown: './apps/web/e2e/global-teardown.ts',
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  workers: 1,
});
