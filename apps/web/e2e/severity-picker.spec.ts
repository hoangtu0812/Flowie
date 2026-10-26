import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';

test('severity picker supports keyboard dismissal, every level and clearing in bug creation', async ({
   page,
   context,
}, testInfo) => {
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
      await dialog.getByRole('button', { name: 'Bug', exact: true }).click();
      const severity = dialog.getByRole('combobox', { name: 'Severity', exact: true });
      await severity.focus();
      await severity.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'CRITICAL', exact: true })).toBeVisible();
      await page.screenshot({
         path: testInfo.outputPath('severity-menu.png'),
         animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await expect(severity).toBeFocused();
      await expect(severity).toContainText('Unspecified');
      for (const level of ['LOW', 'MEDIUM', 'CRITICAL', 'Unspecified', 'HIGH']) {
         await severity.click();
         await page.getByRole('option', { name: level, exact: true }).click();
         await expect(severity).toContainText(level);
      }
      await dialog.getByRole('switch', { name: 'Create more', exact: true }).check();
      for (const clear of [false, true]) {
         if (clear) {
            await dialog.getByRole('button', { name: 'Bug', exact: true }).click();
            await page.setViewportSize({ width: 390, height: 844 });
            await severity.click();
            await page.getByRole('option', { name: 'CRITICAL', exact: true }).click();
            await severity.click();
            await page.getByRole('option', { name: 'Unspecified', exact: true }).click();
            await dialog.getByRole('switch', { name: 'Create more', exact: true }).uncheck();
         }
         await dialog
            .getByLabel('Issue title', { exact: true })
            .fill(`Severity ${clear ? 'cleared' : 'high'} ${Date.now()}`);
         const saved = page.waitForResponse(
            (response) =>
               response.url() === `${api}/issues` && response.request().method() === 'POST'
         );
         await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
         const response = await saved;
         expect(response.ok()).toBeTruthy();
         const issue = (await response.json()).data;
         created.push(issue.id);
         expect(issue.issueType).toBe('BUG');
         expect(issue.severity).toBe(clear ? null : 'HIGH');
         if (!clear)
            await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue('');
      }
      await expect(dialog).toHaveCount(0);
   } finally {
      for (const id of created)
         await context.request.delete(`${api}/issues/${id}?workspaceId=${fixture.workspace_id}`);
   }
});
