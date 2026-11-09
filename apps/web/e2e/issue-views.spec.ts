import { expect, test } from '@playwright/test';
import { openFilterSection } from './filter-menu';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
});
test('team filters save, reopen, clear, clone, edit and delete through UI', async ({
   page,
   context,
}, testInfo) => {
   const ids: string[] = [];
   try {
      await page.goto(`/${fixture.slug}/team/${fixture.team_id}/all`);
      await expect(
         page.getByRole('link', { name: 'Assigned regression task', exact: true })
      ).toBeVisible();
      for (const [section, value] of [
         ['Assignee', 'Regression Owner'],
         ['Project', 'Regression project'],
      ]) {
         await openFilterSection(page, section);
         await page.getByRole('option', { name: new RegExp(`${value}$`) }).click();
         await page.keyboard.press('Escape');
         // The next Filter click must land after this menu has closed; while it
         // is still closing, the click is taken as the dismissal and opens nothing.
         // VI: Lần bấm Filter kế tiếp phải tới sau khi menu này đóng hẳn; khi menu
         // VI: còn đang đóng, cú bấm bị coi là thao tác đóng và không mở gì cả.
         await expect(page.getByRole('option', { name: section, exact: true })).toHaveCount(0);
      }
      await expect(
         page.getByRole('link', { name: 'Unassigned regression bug', exact: true })
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Save as view', exact: true }).click();
      let dialog = page.getByRole('dialog', { name: 'Save as view', exact: true });
      await dialog.getByRole('textbox', { name: /^Name/ }).fill('Saved team queue');
      await dialog.getByRole('button', { name: 'Save as view', exact: true }).click();
      await expect(page).toHaveURL(/\/view\//);
      const original = page.url().split('/view/')[1].split('?')[0];
      ids.push(original);
      await expect(page.getByText('1 issues', { exact: true })).toBeVisible();
      await page.reload();
      await expect(
         page.getByRole('link', { name: 'Assigned regression task', exact: true })
      ).toBeVisible();
      await expect(
         page.getByRole('link', { name: 'Unassigned regression bug', exact: true })
      ).toHaveCount(0);
      const saved = (
         await (
            await context.request.get(
               `${api}/views/${original}?workspaceId=${fixture.workspace_id}`
            )
         ).json()
      ).data;
      expect(saved.filters.teamId).toBe(fixture.team_id);
      expect(saved.filters.query.filters).toHaveLength(2);
      await page.screenshot({ path: testInfo.outputPath('saved-issue-view.png'), fullPage: true });
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(page.getByText('2 issues', { exact: true })).toBeVisible();
      await page.reload();
      await expect(
         page.getByRole('link', { name: 'Unassigned regression bug', exact: true })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Save as new', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Save as view', exact: true });
      await dialog.getByRole('textbox', { name: /^Name/ }).fill('Cloned team queue');
      await dialog.getByRole('button', { name: 'Save as view', exact: true }).click();
      await expect(page.getByText('Cloned team queue', { exact: true })).toBeVisible();
      const clone = page.url().split('/view/')[1].split('?')[0];
      ids.push(clone);
      expect(clone).not.toBe(original);
      const unchanged = (
         await (
            await context.request.get(
               `${api}/views/${original}?workspaceId=${fixture.workspace_id}`
            )
         ).json()
      ).data;
      expect(unchanged.filters.query.filters).toHaveLength(2);
      await openFilterSection(page, 'Assignee');
      await page.getByRole('option', { name: 'Unassigned', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByText('1 issues', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Edit view', exact: true });
      await dialog.getByRole('textbox', { name: /^Name/ }).fill('Shared team queue');
      await dialog.getByLabel('Share with workspace', { exact: true }).check();
      await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(page.getByText('Shared team queue', { exact: true })).toBeVisible();
      await page.reload();
      await expect(
         page.getByRole('link', { name: 'Unassigned regression bug', exact: true })
      ).toBeVisible();
      await expect(
         page.getByRole('link', { name: 'Assigned regression task', exact: true })
      ).toHaveCount(0);
      await page.goto(`/${fixture.slug}/team/${fixture.team_id}/views`);
      await expect(page.getByRole('link', { name: /Shared team queue/ })).toBeVisible();
      await page.getByRole('link', { name: /Shared team queue/ }).click();
      await page.getByRole('button', { name: 'Delete view', exact: true }).click();
      await page
         .getByRole('dialog', { name: 'Delete view', exact: true })
         .getByRole('button', { name: 'Delete view', exact: true })
         .click();
      await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/views$`));
      await expect(page.getByRole('link', { name: /Shared team queue/ })).toHaveCount(0);
      ids.pop();
   } finally {
      for (const id of ids)
         await context.request.delete(`${api}/views/${id}?workspaceId=${fixture.workspace_id}`);
   }
});
test('stale edits show conflict and preserve entered name', async ({ page, context }) => {
   const view = (
      await (
         await context.request.post(`${api}/views`, {
            data: { workspaceId: fixture.workspace_id, name: 'Conflict view', entityType: 'issue' },
         })
      ).json()
   ).data;
   try {
      await page.goto(`/${fixture.slug}/view/${view.id}`);
      await page.getByRole('button', { name: 'Edit view', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Edit view', exact: true });
      await dialog.getByRole('textbox', { name: /^Name/ }).fill('Keep this draft');
      const updated = await context.request.patch(
         `${api}/views/${view.id}?workspaceId=${fixture.workspace_id}`,
         {
            data: {
               name: 'Changed elsewhere',
               description: '',
               filters: view.filters,
               isShared: false,
               expectedUpdatedAt: view.updatedAt,
            },
         }
      );
      expect(updated.ok()).toBeTruthy();
      await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(
         dialog.getByText('This view changed in another session. Reload before saving.', {
            exact: true,
         })
      ).toBeVisible();
      await expect(dialog.getByRole('textbox', { name: /^Name/ })).toHaveValue('Keep this draft');
      await expect(
         dialog.getByRole('button', { name: 'Save changes', exact: true })
      ).toBeDisabled();
   } finally {
      await context.request.delete(`${api}/views/${view.id}?workspaceId=${fixture.workspace_id}`);
   }
});
