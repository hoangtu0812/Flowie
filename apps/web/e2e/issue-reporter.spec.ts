import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';

test('issue properties show the creator as reporter and save a reporter change', async ({
   page,
   context,
}) => {
   const created: string[] = [];
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await page.waitForLoadState('networkidle');
   await page.goto(`/${fixture.slug}/team/GEN/all`);
   await page
      .getByRole('button', { name: /^Create issue in / })
      .first()
      .click();
   const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
   await expect(dialog.getByRole('button', { name: /GEN/ })).toBeEnabled();
   try {
      await dialog.getByLabel('Issue title', { exact: true }).fill(`Reporter ${Date.now()}`);
      const saved = page.waitForResponse(
         (response) => response.url() === `${api}/issues` && response.request().method() === 'POST'
      );
      await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
      const issue = (await (await saved).json()).data;
      created.push(issue.id);
      expect(issue.reporter.id).toBe(issue.creator.id);

      await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
      const reporter = page.getByRole('button', {
         name: new RegExp(`^(Reporter|Người báo): ${issue.creator.name}$`),
      });
      await expect(reporter).toBeVisible();
      await reporter.click();
      const patched = page.waitForResponse(
         (response) =>
            response.url().startsWith(`${api}/issues/${issue.id}`) &&
            response.request().method() === 'PATCH'
      );
      await page.getByRole('menuitem', { name: /^(Creator|Người tạo)$/ }).click();
      const response = await patched;
      expect(response.ok()).toBeTruthy();
      expect(response.request().postDataJSON()).toEqual({ reporterId: null });
      expect((await response.json()).data.reporter.id).toBe(issue.creator.id);
   } finally {
      for (const id of created)
         await context.request.delete(`${api}/issues/${id}?workspaceId=${fixture.workspace_id}`);
   }
});
