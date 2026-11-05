import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';

// The Approvals page lists a submitted document, opens it, and moves it to Handled once approved.
// VI: Trang Phê duyệt liệt kê tài liệu đã gửi, mở được nó và chuyển sang Đã xử lý sau khi duyệt.
test('a document waiting for approval moves to Handled once approved', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const query = `workspaceId=${fixture.workspace_id}`;
   const title = `Approval list spec ${Date.now()}`;
   const created = await context.request.post(`${api}/documents`, {
      data: { workspaceId: fixture.workspace_id, title, content: '# Spec', docType: 'FDS' },
   });
   expect(created.ok(), await created.text()).toBeTruthy();
   const document = (await created.json()).data;
   try {
      const submitted = await context.request.patch(`${api}/documents/${document.id}?${query}`, {
         data: { status: 'IN_REVIEW' },
      });
      expect(submitted.ok(), await submitted.text()).toBeTruthy();
      const lists = await (await context.request.get(`${api}/approvals?${query}`)).json();
      const waiting = lists.data.waiting.length;

      await page.goto(`/${fixture.slug}/approvals`);
      const tab = (name: RegExp) => page.getByRole('tab', { name });
      await expect(tab(/^(Waiting for me|Chờ tôi xử lý)/)).toHaveText(
         new RegExp(`\\(${waiting}\\)`)
      );
      const sidebarItem = page
         .getByRole('listitem')
         .filter({ has: page.getByRole('link', { name: /^(Approvals|Phê duyệt)$/ }) });
      await expect(sidebarItem).toContainText(String(waiting));

      const row = page.getByRole('tabpanel').getByRole('button', { name: title });
      await page.screenshot({ path: testInfo.outputPath('approvals-empty-preview.png') });
      await row.click();
      await expect(page.getByRole('region', { name: /^(Review|Duyệt tài liệu)$/ })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('approvals-selected.png') });
      await page.getByRole('button', { name: /^(Approve|Duyệt)$/ }).click();
      await page.getByRole('button', { name: 'Confirm approval v1', exact: true }).click();

      await expect(row).toHaveCount(0);
      await expect(tab(/^(Waiting for me|Chờ tôi xử lý)/)).toHaveText(
         new RegExp(`\\(${waiting - 1}\\)`)
      );
      await tab(/^(Handled|Đã xử lý)$/).click();
      await expect(row).toBeVisible();
      await expect(page.getByRole('tabpanel')).toContainText(/Approved v1|Đã duyệt v1/);

      // On a phone the document replaces the list until it is closed.
      // VI: Trên điện thoại, tài liệu thay chỗ danh sách cho tới khi đóng.
      await page.setViewportSize({ width: 390, height: 800 });
      await expect(row).toHaveCount(0);
      await page.getByRole('button', { name: /^(Close|Đóng)$/ }).click();
      await row.click();
      await expect(row).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath('approvals-mobile-document.png') });
      await page.getByRole('button', { name: /^(Close|Đóng)$/ }).click();
      await expect(row).toBeVisible();
   } finally {
      await context.request.delete(`${api}/documents/${document.id}?${query}`);
   }
});
