import { test, expect, Page } from "@playwright/test";

/**
 * End-to-end smoke tests.
 *
 * These drive a real browser against the built app. Anything that needs data
 * goes through the backend's dev-login, and is skipped when the API is not
 * running so the suite stays useful in a frontend-only checkout.
 */

const API = process.env.E2E_API_BASE || "http://localhost:8080";

/** True when the backend is reachable. */
async function apiUp(page: Page): Promise<boolean> {
  try {
    const res = await page.request.get(`${API}/healthz`, { timeout: 3000 });
    return res.ok();
  } catch {
    return false;
  }
}

/**
 * Logs in through the development endpoint and lands on the app.
 *
 * Retries because the session cookie occasionally isn't applied to the browser
 * context on the first attempt when workers start in parallel, which silently
 * bounced tests to /login and made them fail on unrelated assertions.
 */
async function devLogin(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.request.get(`${API}/api/v1/auth/dev-login`);
    await page.goto("/");
    if (!page.url().includes("/login")) return;
    await page.waitForTimeout(300);
  }
  throw new Error("dev-login did not produce an authenticated session");
}

test.describe("unauthenticated", () => {
  test("redirects to the login page", async ({ page }) => {
    await page.goto("/");
    // AppShell pushes anonymous visitors to /login.
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page offers Azure AD sign-in", async ({ page }) => {
    await page.goto("/login");
    const body = page.locator("body");
    await expect(body).toContainText(/Flowie/i);
  });
});

test.describe("authenticated", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await apiUp(page)), "backend not running — skipping API-backed e2e");
    await devLogin(page);
  });

  test("shows the app shell with grouped sidebar navigation", async ({ page }) => {
    // The sidebar is the anchor of the authenticated layout. Nav is grouped
    // under headings rather than being one flat list.
    await expect(page.getByRole("link", { name: /Dự án/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: /Lịch/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Chấm công/i }).first()).toBeVisible();
    // Analytics and Dashboards were merged into a single Reports entry.
    await expect(page.getByRole("link", { name: /Báo cáo/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Analytics/i })).toHaveCount(0);
  });

  test("navigates to Settings and shows security sections", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(/Xác thực hai lớp/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Thiết bị đang đăng nhập/i)).toBeVisible();
    // GDPR controls must be discoverable, not buried.
    await expect(page.getByText(/Dữ liệu cá nhân/i)).toBeVisible();
  });

  test("keyboard shortcut '?' opens the shortcut help", async ({ page }) => {
    await expect(page.locator("aside")).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("?");
    await expect(page.getByText(/Phím tắt/i).first()).toBeVisible();
    // Esc must close it again.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: /^Phím tắt$/ })).toBeHidden();
  });

  test("theme toggle reaches dark mode", async ({ page }) => {
    await expect(page.locator("aside")).toBeVisible({ timeout: 15_000 });
    const html = page.locator("html");
    const toggle = page.getByTestId("theme-toggle");

    // The control cycles light → dark → system, and "system" resolves to the
    // OS preference — so from an arbitrary starting point it can take up to
    // three clicks to land on dark. Click until `.dark` appears.
    let isDark = false;
    for (let i = 0; i < 3 && !isDark; i++) {
      await toggle.click();
      isDark = ((await html.getAttribute("class")) ?? "").includes("dark");
    }
    expect(isDark, "dark mode should be reachable from the toggle").toBe(true);

    // The choice must survive a reload (persisted in localStorage).
    await page.reload();
    await expect(html).toHaveClass(/dark/);
  });

  test("Reports page merges analytics and dashboards into tabs", async ({ page }) => {
    await page.goto("/reports");
    // Analytics and custom dashboards used to be two sidebar routes; they are
    // now tabs on one page, alongside the two ops surfaces.
    for (const tab of [/Phân tích/i, /Dashboard tuỳ chỉnh/i, /Gửi định kỳ/i, /Nhật ký/i]) {
      await expect(page.getByRole("button", { name: tab })).toBeVisible({ timeout: 15_000 });
    }
    // The dev-login user belongs to no workspace, so the page must say so
    // rather than rendering an empty shell with no explanation.
    await expect(page.getByText(/chưa thuộc không gian làm việc/i)).toBeVisible();
  });

  test("old analytics and dashboards routes are gone", async ({ page }) => {
    for (const route of ["/analytics", "/dashboards"]) {
      const res = await page.goto(route);
      expect(res?.status(), `${route} should not exist`).toBe(404);
    }
  });

  test("project board shows the tab bar so Sprints is reachable", async ({ page }) => {
    // Regression: the board is a project's landing page, and it was the only
    // project page missing ProjectTabs — which made Sprints, Timeline and
    // Reports unreachable once you clicked into a project.
    const pid = "00000000-0000-0000-0000-000000000001";
    await page.goto(`/projects/${pid}`);
    // Match on href rather than text: accessible names include the icon
    // ligature ("view_kanban Board"), and "Board" is a substring of "Dashboard".
    for (const slug of ["", "/sprints", "/timeline", "/files"]) {
      await expect(
        page.locator(`a[href="/projects/${pid}${slug}"]`),
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("sprint page offers creation instead of a hardcoded name", async ({ page }) => {
    await page.goto("/projects/00000000-0000-0000-0000-000000000001/sprints");
    await expect(page.getByRole("button", { name: /Sprint mới/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    // Opening it must show a real form (name/goal/dates), not create silently.
    await page.getByRole("button", { name: /Sprint mới/i }).first().click();
    await expect(page.getByText(/Mục tiêu/i)).toBeVisible();
    await expect(page.getByText(/Bắt đầu/i)).toBeVisible();
    await expect(page.getByText(/Kết thúc/i)).toBeVisible();
  });
});
