import { defineConfig, devices } from '@playwright/test';
const apiUrl = 'http://localhost:4000';
export default defineConfig({
   testDir: './e2e',
   fullyParallel: false,
   workers: 1,
   timeout: 45000,
   expect: { timeout: 10000 },
   retries: 0,
   reporter: [['list']],
   use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
   projects: [
      {
         name: 'chromium',
         use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
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
            API_CORS_ORIGIN: 'http://localhost:3000',
            MCP_ENABLED: 'true',
            MCP_WRITES_ENABLED: 'true',
            APP_URL: 'http://localhost:3000',
            DISCORD_BOT_TOKEN: '',
            SMTP_HOST: '',
         },
      },
      {
         command: 'pnpm exec next start --hostname 127.0.0.1 --port 3000',
         url: 'http://localhost:3000/auth/login',
         reuseExistingServer: !process.env.CI,
         timeout: 60000,
      },
   ],
});
