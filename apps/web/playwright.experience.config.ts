import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
   testDir: './e2e',
   testMatch: 'workspace-experience.spec.ts',
   workers: 1,
   timeout: 45000,
   expect: { timeout: 10000 },
   reporter: 'list',
   use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
   projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
   webServer: {
      command: 'pnpm exec next start --hostname 127.0.0.1 --port 3100',
      url: 'http://localhost:3100/auth/login',
      reuseExistingServer: false,
      timeout: 60000,
   },
});
