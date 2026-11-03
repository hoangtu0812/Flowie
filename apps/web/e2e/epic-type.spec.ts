import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';

test('Epic is independent of workflow and can be changed and filtered', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await page.goto(`/${fixture.slug}/issues`);
   await page.getByRole('button', { name: 'Create issue', exact: true }).first().click();
   const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
   await dialog.getByRole('button', { name: 'Epic', exact: true }).click();
   await expect(dialog.getByRole('button', { name: 'Epic', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
   );
   await expect(dialog.getByRole('combobox').filter({ hasText: 'Backlog' })).toBeVisible();
   const title = `Epic goal ${testInfo.project.name} ${Date.now()}`;
   await dialog.getByLabel('Issue title', { exact: true }).fill(title);
   const saved = page.waitForResponse(
      (r) => r.url() === `${api}/issues` && r.request().method() === 'POST'
   );
   await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
   const response = await saved;
   expect(response.ok()).toBeTruthy();
   const issue = (await response.json()).data;
   try {
      expect(issue.issueType).toBe('EPIC');
      expect(issue.status.category).toBe('BACKLOG');
      await expect(dialog).toHaveCount(0);
      await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
      await expect(page.getByRole('button', { name: 'Epic', exact: true })).toHaveAttribute(
         'aria-pressed',
         'true'
      );
      for (const type of ['Task', 'Epic']) {
         const changed = page.waitForResponse(
            (r) => r.url().includes(`/issues/${issue.id}?`) && r.request().method() === 'PATCH'
         );
         await page.getByRole('button', { name: type, exact: true }).click();
         expect((await changed).ok()).toBeTruthy();
         await expect(page.getByRole('button', { name: type, exact: true })).toHaveAttribute(
            'aria-pressed',
            'true'
         );
      }
      await page.reload();
      await expect(page.getByRole('button', { name: 'Epic', exact: true })).toHaveAttribute(
         'aria-pressed',
         'true'
      );
      expect(
         (
            await (
               await context.request.get(
                  `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`
               )
            ).json()
         ).data.status.category
      ).toBe('BACKLOG');
      await page.screenshot({ path: testInfo.outputPath('epic-properties.png'), fullPage: true });
      await page.goto(`/${fixture.slug}/issues`);
      await page.getByRole('button', { name: 'Filter', exact: true }).click();
      await page.getByRole('option', { name: 'Issue type', exact: true }).click();
      await page.getByRole('option', { name: 'Epic', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
      await expect(
         page.getByRole('link', { name: fixture.issues[0].title, exact: true })
      ).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
   } finally {
      await context.request.delete(`${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`);
   }
});
