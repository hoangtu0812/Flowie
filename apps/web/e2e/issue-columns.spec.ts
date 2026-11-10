import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   userId: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';
const DEFAULT_ORDER = [
   'labels',
   'project',
   'startDate',
   'targetDate',
   'estimatedEffort',
   'actualEffort',
   'created',
   'dueDate',
   'assignee',
];

// The fixture account is shared by every spec, so its issue columns start and
// end unconfigured. Each write reads the current version first, as the app does.
// VI: Tài khoản fixture dùng chung cho mọi spec, nên cột issue của nó bắt đầu và
// kết thúc ở trạng thái chưa cấu hình. Mỗi lần ghi đọc version hiện tại trước,
// giống cách ứng dụng làm.
async function clearColumns(request: APIRequestContext) {
   const current = (await (await request.get(`${api}/users/me/ui-preferences`)).json()).data;
   const saved = await request.put(`${api}/users/me/ui-preferences`, {
      data: {
         accountId: fixture.userId,
         expectedVersion: current.version,
         values: { issueColumns: null },
      },
   });
   expect(saved.ok(), await saved.text()).toBeTruthy();
}

const storedColumns = async (request: APIRequestContext) =>
   (await (await request.get(`${api}/users/me/ui-preferences`)).json()).data.values.issueColumns;

const headers = (page: Page) => page.locator('[data-issue-column]');
const headerKeys = (page: Page) =>
   headers(page).evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-issue-column')));
const width = async (locator: Locator) => (await locator.boundingBox())!.width;

async function dragBy(page: Page, handle: Locator, dx: number) {
   const box = (await handle.boundingBox())!;
   await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
   await page.mouse.down();
   await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 8 });
   await page.mouse.up();
}

test.beforeEach(async ({ page, context }) => {
   await page.setViewportSize({ width: 1600, height: 900 });
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await clearColumns(context.request);
});

test.afterEach(async ({ context }) => {
   await clearColumns(context.request);
});

test('issue columns resize, hide and reorder, persist per account and reset', async ({
   page,
   context,
}) => {
   // Navigating after the reset hands PreferenceSync the new preference version.
   // VI: Điều hướng sau khi reset để PreferenceSync nhận version preferences mới.
   await page.goto(`/${fixture.slug}/team/GEN/all`);
   await expect(headers(page).first()).toBeVisible();
   expect(await headerKeys(page)).toEqual(DEFAULT_ORDER);

   // Resize: the title grows past its old width, Labels takes the dragged width.
   // VI: Resize: Title rộng hơn độ rộng cũ, Labels nhận đúng độ rộng đã kéo.
   const title = page.getByRole('separator', { name: 'Resize Title' });
   const titleBefore = await width(title.locator('..'));
   await dragBy(page, title, 250);
   await expect.poll(() => width(title.locator('..'))).toBeGreaterThan(titleBefore + 200);
   const labels = page.locator('[data-issue-column="labels"]');
   await dragBy(page, page.getByRole('separator', { name: 'Resize Labels' }), 60);
   await expect.poll(() => width(labels)).toBeGreaterThan(215);
   expect(await width(labels)).toBeLessThan(225);

   // Right-click → Hide column.
   // VI: Chuột phải → Hide column.
   await page.locator('[data-issue-column="project"]').click({ button: 'right' });
   await page.getByRole('menuitem', { name: 'Hide column' }).click();
   await expect(page.locator('[data-issue-column="project"]')).toHaveCount(0);

   // Drag Assignee's header in front of Labels; a drag never toggles sorting.
   // VI: Kéo header Assignee lên trước Labels; thao tác kéo không đổi sort.
   const assignee = page.locator('[data-issue-column="assignee"]');
   const from = (await assignee.boundingBox())!;
   const to = (await labels.boundingBox())!;
   await page.mouse.move(from.x + 20, from.y + from.height / 2);
   await page.mouse.down();
   await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 4 });
   await expect(page.locator('[data-issue-column="assignee"]')).toHaveClass(/outline-dashed/);
   await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 20 });
   await page.mouse.up();
   await expect.poll(() => headerKeys(page)).toEqual([
      'assignee',
      'labels',
      'startDate',
      'targetDate',
      'estimatedEffort',
      'actualEffort',
      'created',
      'dueDate',
   ]);
   await expect(page.getByRole('button', { name: 'Assignee: default order' })).toBeVisible();

   // Saved on the account: a browser without the local copy gets the same columns.
   // VI: Lưu theo tài khoản: trình duyệt không có bản sao cục bộ vẫn nhận đúng cột.
   await expect
      .poll(async () => {
         const stored = await storedColumns(context.request);
         return [stored?.order?.[0], stored?.visible?.project, stored?.widths?.labels];
      })
      .toEqual(['assignee', false, 220]);
   await page.evaluate(() => localStorage.removeItem('ui-preferences'));
   await page.reload();
   await expect.poll(() => headerKeys(page)).toEqual([
      'assignee',
      'labels',
      'startDate',
      'targetDate',
      'estimatedEffort',
      'actualEffort',
      'created',
      'dueDate',
   ]);
   expect(Math.round(await width(labels))).toBe(220);

   // Display → List options shows the same order; switches and the grip edit it.
   // VI: Display → List options hiển thị cùng thứ tự; switch và grip chỉnh được nó.
   await page.getByRole('button', { name: 'Display', exact: true }).click();
   const rows = page.locator('[data-issue-column-row]');
   await expect(rows.first()).toHaveAttribute('data-issue-column-row', 'assignee');
   const project = page.getByRole('switch', { name: 'Show Project' });
   await expect(project).toHaveAttribute('aria-checked', 'false');
   await project.click();
   await expect(page.locator('[data-issue-column="project"]')).toHaveCount(1);
   await page.getByRole('button', { name: 'Reorder Assignee' }).focus();
   await page.keyboard.press('Space');
   await page.keyboard.press('ArrowDown');
   await page.keyboard.press('Space');
   await expect(rows.first()).toHaveAttribute('data-issue-column-row', 'labels');
   await expect.poll(async () => (await headerKeys(page)).slice(0, 2)).toEqual([
      'labels',
      'assignee',
   ]);

   // Reset restores the default columns everywhere.
   // VI: Reset khôi phục cột mặc định ở mọi nơi.
   await page.getByRole('button', { name: 'Reset', exact: true }).click();
   await expect.poll(() => headerKeys(page)).toEqual(DEFAULT_ORDER);
   await expect.poll(async () => Math.round(await width(labels))).toBe(160);
   await expect
      .poll(async () => (await storedColumns(context.request))?.order?.[0])
      .toBe('labels');
});
