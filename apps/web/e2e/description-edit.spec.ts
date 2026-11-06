import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
const png =
   'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM3sAAAAASUVORK5CYII=';

// Task detail edits the description with the shared Create issue editor and still saves Markdown.
// VI: Chi tiết task sửa mô tả bằng editor dùng chung của Create issue và vẫn lưu Markdown.
test('task detail description edits in Rich Text, Markdown and Preview and saves Markdown', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const response = await context.request.post(`${api}/issues`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: fixture.team_id,
         title: 'Synthetic description edit',
         description: 'Original **bold** text',
      },
   });
   expect(response.ok()).toBeTruthy();
   const issue = (await response.json()).data;
   try {
      await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
      const edit = page.getByRole('button', { name: 'Edit description', exact: true });
      const group = page.getByRole('group', { name: 'Issue description', exact: true });
      const field = group.getByRole('textbox', { name: 'Issue description', exact: true });
      await edit.click();
      await expect(group.getByRole('button', { name: 'Rich Text', exact: true })).toHaveAttribute(
         'aria-pressed',
         'true'
      );
      await expect(field.locator('strong')).toHaveText('bold');
      // Opening Rich Text must not rewrite the source, so Esc still leaves an unchanged draft.
      // VI: Mở Rich Text không được ghi lại nguồn, nên Esc vẫn thoát khi bản nháp chưa đổi.
      await field.press('Escape');
      await expect(group).toHaveCount(0);

      await edit.click();
      await field.click();
      await field.press('ControlOrMeta+End');
      await field.press('Enter');
      await page.keyboard.insertText('Second paragraph');
      await group.getByRole('button', { name: 'Markdown', exact: true }).click();
      await expect(field).toHaveValue('Original **bold** text\n\nSecond paragraph');
      await group.getByRole('button', { name: 'Preview', exact: true }).click();
      const preview = group.getByTestId('description-preview');
      await expect(preview.locator('strong')).toHaveText('bold');
      await expect(preview).toContainText('Second paragraph');
      await group.getByRole('button', { name: 'Rich Text', exact: true }).click();
      await expect(field.locator('p').nth(1)).toHaveText('Second paragraph');

      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
         release = resolve;
      });
      await page.route('**/api/v1/attachments', async (route) => {
         await pending;
         await route.continue();
      });
      await field.evaluate((el, data) => {
         const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
         const transfer = new DataTransfer();
         transfer.items.add(new File([bytes], 'synthetic.png', { type: 'image/png' }));
         const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
         Object.defineProperty(paste, 'clipboardData', { value: transfer });
         el.dispatchEvent(paste);
      }, png);
      await expect(field.locator('img[src^="blob:"]')).toHaveCount(1);
      await expect(group.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
      release();
      await expect(field.locator('img[src*="/attachments/"]')).toHaveCount(1);
      await expect(group.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
      await group.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('description-edit-rich.png') });

      await field.press('ControlOrMeta+Enter');
      await expect(group).toHaveCount(0);
      const saved = await context.request.get(
         `${api}/issues/lookup/${issue.identifier}?workspaceId=${fixture.workspace_id}`
      );
      const description = (await saved.json()).data.description as string;
      expect(description).toMatch(
         /^Original \*\*bold\*\* text\n\nSecond paragraph!\[synthetic\.png\]\([^)]*\/attachments\/[^)]+\/preview\)$/
      );
      await page.reload();
      await expect(page.getByText('Second paragraph')).toBeVisible();
      await expect(page.locator('strong', { hasText: 'bold' })).toBeVisible();
   } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await context.request.delete(`${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`);
   }
});
