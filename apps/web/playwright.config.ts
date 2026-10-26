import { defineConfig, devices } from '@playwright/test';
const apiUrl = 'http://localhost:4000';
const webPort = Number(process.env.FLOWIE_E2E_WEB_PORT ?? 3000);
if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) {
   throw new Error('FLOWIE_E2E_WEB_PORT must be a valid TCP port.');
}
const webUrl = `http://localhost:${webPort}`;
export default defineConfig({
   testDir: './e2e',
   fullyParallel: false,
   workers: 1,
   timeout: 45000,
   expect: { timeout: 10000 },
   retries: 0,
   reporter: [['list']],
   use: { baseURL: webUrl, trace: 'retain-on-failure' },
   projects: [
      {
         name: 'chromium',
         use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      },
      {
         name: 'firefox',
         use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
      },
      {
         name: 'webkit',
         use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
      },
   ],
   webServer: [
      {
         command: `${process.env.FLOWIE_E2E_PYTHON ?? 'python'} -m uvicorn ui_regression_api:app --app-dir ../../scripts --host 127.0.0.1 --port 4000`,
         url: `${apiUrl}/api/v1/auth/providers`,
         reuseExistingServer: !process.env.CI,
         timeout: 60000,
         env: {
            DATABASE_URL: process.env.FLOWIE_E2E_DATABASE_URL!,
            AUTH_JWT_SECRET: 'synthetic-ui-regression-secret-at-least-32-characters',
            AUTH_COOKIE_SECURE: 'false',
            API_CORS_ORIGIN: webUrl,
            MCP_ENABLED: 'true',
            MCP_WRITES_ENABLED: 'true',
            APP_URL: webUrl,
            DISCORD_BOT_TOKEN: '',
            SMTP_HOST: '',
         },
      },
      {
         command: `pnpm exec next start --hostname 127.0.0.1 --port ${webPort}`,
         url: `${webUrl}/auth/login`,
         reuseExistingServer: !process.env.CI,
         timeout: 60000,
      },
   ],
});
