import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const isolatedDataDir = join(tmpdir(), 'nagarik-signal-e2e', randomUUID());

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  webServer: {
    command: 'npm run build && npm run start -- -p 3001',
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3001',
      NEXT_PUBLIC_NAGARIK_PUBLIC_PREVIEW: '0',
      NAGARIK_ALLOWED_ORIGINS: 'http://127.0.0.1:3001',
      NAGARIK_DATA_DIR: isolatedDataDir,
      NAGARIK_STORAGE_MODE: 'local',
      NAGARIK_COOKIE_SECRET: 'nagarik-e2e-cookie-secret-0123456789',
      NAGARIK_SESSION_DERIVATION_SECRET: 'nagarik-e2e-session-secret-0123456789',
      NAGARIK_UPLOAD_RECEIPT_SECRET: 'nagarik-e2e-upload-secret-0123456789',
      NAGARIK_RATE_LIMIT_SALT: 'nagarik-e2e-rate-salt-0123456789',
      NAGARIK_RATE_LIMIT_PEPPER: 'nagarik-e2e-rate-pepper-0123456789',
      NAGARIK_STEWARD_SECRET: 'nagarik-e2e-steward-secret-0123456789',
    },
  },
});
