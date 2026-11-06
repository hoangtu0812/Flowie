import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';

test('description actions stay inside one composer and retain save/cancel/paste recovery', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   // This spec checks the Markdown textarea; Rich Text editing has its own spec.
   // VI: Spec này kiểm tra textarea Markdown; sửa Rich Text có spec riêng.
   await page.evaluate(() => localStorage.setItem('flowie.issue-description-mode', 'markdown'));
   const response = await context.request.post(`${api}/issues`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: fixture.team_id,
         title: 'Synthetic description composer',
         description: 'Original description',
      },
   });
   expect(response.ok()).toBeTruthy();
   const issue = (await response.json()).data;
   try {
      await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
      const edit = page.getByRole('button', { name: 'Edit description', exact: true });
      const group = page.getByRole('group', { name: 'Issue description', exact: true });
      const field = group.getByRole('textbox', { name: 'Issue description', exact: true });
      const inside = async () => {
         await expect
            .poll(async () => {
               const box = (await group.boundingBox())!;
               const buttons = await Promise.all(
                  ['Save', 'Cancel'].map((name) =>
                     group.getByRole('button', { name, exact: true }).boundingBox()
                  )
               );
               return buttons.every(
                  (button) =>
                     button &&
                     button.x >= box.x &&
                     button.y >= box.y &&
                     button.x + button.width <= box.x + box.width + 1 &&
                     button.y + button.height <= box.y + box.height + 1
               );
            })
            .toBeTruthy();
         expect(await field.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px');
      };
      await edit.click();
      await inside();
      await field.fill('Discarded draft');
      await group.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(group).toHaveCount(0);
      await expect(page.getByText('Original description', { exact: true })).toBeVisible();
      await edit.click();
      await field.fill('Saved draft');
      await field.press('Escape');
      await expect(field).toHaveValue('Saved draft');
      await page.getByRole('tab', { name: 'Activity', exact: true }).click();
      await page.getByRole('tab', { name: 'Overview', exact: true }).click();
      await expect(field).toBeVisible();
      await expect(page).not.toHaveURL(/tab=activity/);
      await expect(field).toHaveValue('Saved draft');
      const pattern = `**/api/v1/issues/${issue.id}?*`;
      await page.route(pattern, async (route) => {
         if (route.request().method() === 'PATCH')
            await route.fulfill({
               status: 503,
               contentType: 'application/json',
               body: JSON.stringify({ message: 'Synthetic save failure' }),
            });
         else await route.continue();
      });
      await group.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(group.getByRole('alert')).toContainText('Synthetic save failure');
      await expect(field).toHaveValue('Saved draft');
      await page.unroute(pattern);
      await field.press('Control+Enter');
      await expect(group).toHaveCount(0);
      await expect(page.getByText('Saved draft', { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText('Saved draft', { exact: true })).toBeVisible();
      await edit.click();
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
         release = resolve;
      });
      await page.route('**/api/v1/attachments', async (route) => {
         await pending;
         await route.continue();
      });
      await field.evaluate((el) => {
         const bytes = Uint8Array.from(
            atob(
               'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM3sAAAAASUVORK5CYII='
            ),
            (c) => c.charCodeAt(0)
         );
         const data = new DataTransfer();
         data.items.add(new File([bytes], 'synthetic.png', { type: 'image/png' }));
         // Firefox ignores clipboardData in the ClipboardEvent constructor, so it is set on the instance.
         // VI: Firefox bỏ qua clipboardData trong constructor ClipboardEvent nên phải gán trên đối tượng.
         const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
         Object.defineProperty(paste, 'clipboardData', { value: data });
         el.dispatchEvent(paste);
      });
      await expect(group.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
      release();
      await expect(field).toHaveValue(/\/attachments\//);
      await expect(group.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
      await page.setViewportSize({ width: 390, height: 844 });
      await inside();
      expect(await group.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
      await page.screenshot({
         path: testInfo.outputPath('description-composer-mobile.png'),
         fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 800 });
      await inside();
      await group.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('description-composer-desktop.png') });
      await group.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(group).toHaveCount(0);
      const saved = await context.request.get(
         `${api}/issues/lookup/${issue.identifier}?workspaceId=${fixture.workspace_id}`
      );
      expect((await saved.json()).data.description).toMatch(/\/attachments\//);
   } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await context.request.delete(`${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`);
   }
});
