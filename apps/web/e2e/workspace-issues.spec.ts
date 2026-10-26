import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';

test('workspace issues support unassigned backlog, bug views and direct details', async ({
   page,
   context,
}, testInfo) => {
   const created: Array<{ id: string; identifier: string; title: string }> = [];
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await page.waitForLoadState('networkidle');
   await page.getByRole('link', { name: 'All issues', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/issues$`));
   await page.getByRole('button', { name: 'Create issue', exact: true }).first().click();
   const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
   await expect(dialog.getByRole('button', { name: /No team/ })).toBeEnabled();
   await expect(dialog.getByRole('combobox').filter({ hasText: 'Backlog' })).toBeVisible();
   await dialog.getByRole('switch', { name: 'Create more', exact: true }).check();
   try {
      for (const type of ['Task', 'Bug']) {
         if (type === 'Bug') {
            await dialog.getByRole('button', { name: 'Bug', exact: true }).click();
            await dialog.getByRole('switch', { name: 'Create more', exact: true }).uncheck();
         }
         const title = `Workspace ${type} ${testInfo.project.name} ${Date.now()}`;
         await dialog.getByLabel('Issue title', { exact: true }).fill(title);
         const saved = page.waitForResponse(
            (response) =>
               response.url() === `${api}/issues` && response.request().method() === 'POST'
         );
         await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
         const response = await saved;
         expect(response.ok(), await response.text()).toBeTruthy();
         const issue = (await response.json()).data;
         created.push(issue);
         expect(issue.teamId).toBeNull();
         expect(issue.projectId).toBeNull();
         expect(issue.status.category).toBe('BACKLOG');
         expect(issue.identifier).toMatch(/^WS_\d+$/);
         if (type === 'Task')
            await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue('');
      }
      await expect(dialog).toHaveCount(0);
      for (const segment of ['', '/backlog', '/no-team', '/no-project']) {
         await page.goto(`/${fixture.slug}/issues${segment}`);
         for (const issue of created)
            await expect(page.getByText(issue.title, { exact: true }).first()).toBeVisible();
      }
      await page.goto(`/${fixture.slug}/issues/bugs`);
      await expect(page.getByText(created[1].title, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(created[0].title, { exact: true })).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
         path: testInfo.outputPath('workspace-issues-mobile.png'),
         fullPage: true,
      });
      expect(
         await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBeTruthy();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/${fixture.slug}/issue/${created[1].identifier}`);
      await expect(
         page.getByRole('heading', { name: created[1].title, exact: true })
      ).toBeVisible();
      await expect(page.getByText('Add sub-issues', { exact: true })).toBeVisible();
      for (const destination of ['GEN', 'No team']) {
         await page.getByRole('button', { name: 'Issue actions', exact: true }).click();
         await page.getByRole('menuitem', { name: 'Move to team...', exact: true }).click();
         const moveDialog = page.getByRole('dialog', { name: 'Move issue', exact: true });
         await moveDialog.getByRole('combobox').click();
         await page
            .getByRole('option', { name: destination === 'GEN' ? /\(GEN\)/ : 'No team' })
            .click();
         const moved = page.waitForResponse(
            (response) =>
               response.url().includes(`/issues/${created[1].id}/move`) &&
               response.request().method() === 'POST'
         );
         await moveDialog.getByRole('button', { name: 'Save', exact: true }).click();
         const result = await moved;
         expect(result.ok(), await result.text()).toBeTruthy();
         const issue = (await result.json()).data;
         await expect(page).toHaveURL(new RegExp(`/issue/${issue.identifier}$`));
         await expect(
            page.getByRole('heading', { name: created[1].title, exact: true })
         ).toBeVisible();
      }
      await page.reload();
      await expect(
         page.getByRole('heading', { name: created[1].title, exact: true })
      ).toBeVisible();
   } finally {
      for (const issue of created)
         await context.request.delete(
            `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`
         );
   }
});
