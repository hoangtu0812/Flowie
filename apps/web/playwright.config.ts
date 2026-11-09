import { defineConfig, devices } from '@playwright/test';
const apiUrl = 'http://localhost:4000';
const webPort = Number(process.env.FLOWIE_E2E_WEB_PORT ?? 3000);
if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) {
   throw new Error('FLOWIE_E2E_WEB_PORT must be a valid TCP port.');
}
const webUrl = `http://localhost:${webPort}`;
const webBasePath = process.env.FLOWIE_E2E_BASE_PATH ?? '';
export default defineConfig({
   testDir: './e2e',
   fullyParallel: false,
   workers: 1,
   timeout: 45000,
   expect: { timeout: 10000 },
   // One retry on CI, none locally. The suite shares a single database and runs
   // the browser projects one after another, so a test that times out can leave
   // state behind for a later one; the specs now scope their assertions to their
   // own data so that cannot cascade, and this retry covers what is left — a
   // genuine one-off on a loaded runner. It is deliberately 1: a failure that
   // survives one retry is a real failure, and raising this instead of fixing
   // isolation would hide exactly the regressions this suite exists to catch.
   // VI: Một lần thử lại trên CI, không thử lại ở máy cá nhân. Bộ test dùng chung
   // một database và chạy lần lượt từng project trình duyệt, nên một test hết giờ
   // có thể để lại dữ liệu cho test sau; các spec nay chỉ khẳng định trên dữ liệu
   // của chính mình nên việc đó không lan ra nữa, và lần thử lại này phủ phần còn
   // lại là những trục trặc nhất thời trên máy chạy đang tải nặng. Cố ý để 1: lỗi
   // nào sống sót qua một lần thử lại là lỗi thật, và tăng số này thay vì sửa
   // cách ly sẽ che đúng những hồi quy mà bộ test này sinh ra để bắt.
   retries: process.env.CI ? 1 : 0,
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
         // Uvicorn drops an idle keep-alive connection after 5 s by default, and a
         // request that reused the connection at that moment failed with
         // ECONNRESET. Holding it longer than the client does removes the race.
         // VI: Mặc định uvicorn đóng kết nối keep-alive nhàn rỗi sau 5 giây, và một
         // VI: request dùng lại kết nối đúng lúc đó hỏng với ECONNRESET. Giữ lâu hơn
         // VI: phía client sẽ loại bỏ tranh chấp này.
         command: `${process.env.FLOWIE_E2E_PYTHON ?? 'python'} -m uvicorn ui_regression_api:app --app-dir ../../scripts --host 127.0.0.1 --port 4000 --timeout-keep-alive 75`,
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
         url: `${webUrl}${webBasePath}/auth/login`,
         reuseExistingServer: !process.env.CI,
         timeout: 60000,
      },
   ],
});
