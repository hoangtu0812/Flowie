import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   userId: string;
   workspace_id: string;
   documentId: string;
   email: string;
   password: string;
   issues: { identifier: string; title: string }[];
};
const api = 'http://localhost:4000/api/v1';
let restoreValues: Record<string, unknown> | undefined;
let restoreIssue: { id: string; issueType: string } | undefined;

// Teardown has its own timeout budget, so a failed locator cannot leave the shared account in Vietnamese.
// VI: Teardown có ngân sách thời gian riêng, nên locator lỗi không để tài khoản dùng chung ở tiếng Việt.
test.afterEach(async ({ context }) => {
   test.setTimeout(30000);
   const values = restoreValues;
   const issue = restoreIssue;
   restoreValues = undefined;
   restoreIssue = undefined;
   if (!values) return;
   try {
      if (issue) {
         const response = await context.request.patch(
            `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`,
            { data: { issueType: issue.issueType } }
         );
         expect(response.ok()).toBeTruthy();
      }
   } finally {
      const endpoint = `${api}/users/me/ui-preferences`;
      const current = (await (await context.request.get(endpoint)).json()).data;
      const restored = await context.request.put(endpoint, {
         data: { accountId: fixture.userId, expectedVersion: current.version, values },
      });
      expect(restored.ok()).toBeTruthy();
   }
});

test('Vietnamese core routes retain user content and controls remain usable on mobile', async ({
   page,
   context,
   browserName,
}) => {
   test.setTimeout(120000);
   const errors: string[] = [];
   page.on('pageerror', (value) => errors.push(value.message));
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const endpoint = `${api}/users/me/ui-preferences`,
      original = (await (await context.request.get(endpoint)).json()).data;
   restoreValues = original.values;
   {
      await page.waitForLoadState('networkidle');
      await page.goto(`/${fixture.slug}/settings/preferences`);
      await page.getByRole('combobox', { name: 'Language', exact: true }).click();
      await page.getByRole('option', { name: 'Tiếng Việt', exact: true }).click();
      await expect(page.getByText('Đã lưu tùy chọn tài khoản.', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Mục đã lưu trữ', exact: true })).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      for (const [route, title] of [
         ['settings/archive', 'Mục đã lưu trữ'],
         ['settings/data-exchange', 'Nhập và xuất'],
         ['settings/recurring', 'Lịch định kỳ'],
         ['settings/slas', 'Chính sách SLA'],
         ['settings/security', 'Bảo mật và truy cập'],
         ['dashboard', 'Dashboard workspace'],
         ['reports', 'Báo cáo workspace'],
      ]) {
         await page.waitForLoadState('networkidle');
         await page.goto(`/${fixture.slug}/${route}`);
         await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
         expect(
            await page.evaluate(() => document.documentElement.scrollWidth)
         ).toBeLessThanOrEqual(390);
      }
      await page.waitForLoadState('networkidle');
      await page.goto(`/${fixture.slug}/issue/${fixture.issues[0].identifier}`);
      await expect(
         page.getByRole('heading', { name: fixture.issues[0].title, exact: true })
      ).toBeVisible();
      restoreIssue = (
         await (
            await context.request.get(
               `${api}/issues/${fixture.issues[0].identifier}?workspaceId=${fixture.workspace_id}`
            )
         ).json()
      ).data;
      await page.getByRole('button', { name: 'Thuộc tính', exact: true }).click();
      await page.getByRole('button', { name: 'Bug', exact: true }).click();
      await page.getByRole('button', { name: 'Sửa thông tin bug', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Môi trường', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Hủy sửa bug', exact: true }).click();
      const document = (
         await (
            await context.request.get(
               `${api}/documents/${fixture.documentId}?workspaceId=${fixture.workspace_id}`
            )
         ).json()
      ).data;
      await page.waitForLoadState('networkidle');
      await page.goto(`/${fixture.slug}/documents/${fixture.documentId}`);
      await page.getByRole('button', { name: 'Sửa', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(
         dialog.getByRole('textbox', { name: 'Tiêu đề tài liệu Bắt buộc', exact: true })
      ).toHaveValue(document.title);
      await expect(
         dialog.getByRole('textbox', { name: 'Nội dung Markdown', exact: true })
      ).toHaveValue(document.content);
      await page.screenshot({
         path: `test-results/core-locales-${browserName}.png`,
         animations: 'disabled',
      });
      for (const button of await dialog.getByRole('button').all()) {
         const box = await button.boundingBox();
         if (!box) continue;
         expect(box.x).toBeGreaterThanOrEqual(0);
         expect(box.x + box.width).toBeLessThanOrEqual(390);
      }
      await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
      expect(errors).toEqual([]);
   }
});
