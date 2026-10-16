import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   userId: string;
   workspace_id: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1',
   endpoint = `${api}/users/me/ui-preferences`;
test('timezone and week start persist and optional self-assignment respects clearing the field', async ({
   page,
   context,
   browserName,
}) => {
   test.setTimeout(90000);
   const errors: string[] = [];
   page.on('pageerror', (value) => errors.push(value.message));
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const original = (await (await context.request.get(endpoint)).json()).data;
   const actor = (await (await context.request.get(`${api}/users/me`)).json()).data;
   const created: string[] = [];
   try {
      await page.waitForLoadState('networkidle');
      await page.goto(`/${fixture.slug}/settings/preferences`);
      await expect(page.getByText('Account preferences saved.', { exact: true })).toBeVisible();
      await page
         .getByRole('textbox', { name: 'Account timezone', exact: true })
         .fill('America/Los_Angeles');
      await page.getByRole('button', { name: 'Apply timezone', exact: true }).click();
      await page.getByRole('combobox', { name: 'Week starts on', exact: true }).click();
      await page.getByRole('option', { name: 'Saturday', exact: true }).click();
      await page
         .getByRole('checkbox', {
            name: 'Automatically assign new tasks and bugs to me',
            exact: true,
         })
         .check();
      await expect
         .poll(
            async () =>
               (await (await context.request.get(endpoint)).json()).data.values.autoAssignSelf
         )
         .toBe(true);
      await page.reload();
      await expect(
         page.getByRole('textbox', { name: 'Account timezone', exact: true })
      ).toHaveValue('America/Los_Angeles');
      await expect(
         page.getByRole('combobox', { name: 'Week starts on', exact: true })
      ).toContainText('Saturday');
      const reportRequest = page.waitForRequest(
         (request) =>
            request.method() === 'POST' &&
            request.url().includes('/reports/dashboard?') &&
            request.postDataJSON().timezone === 'America/Los_Angeles'
      );
      await page.waitForLoadState('networkidle');
      await page.goto(`/${fixture.slug}/dashboard`);
      const report = (await reportRequest).postDataJSON();
      expect(report.weekStart).toBe(5);
      await page.waitForLoadState('networkidle');
      await page.goto(`/${fixture.slug}/team/GEN/all`);
      for (const clear of [true, false]) {
         await page
            .getByRole('button', { name: /^Create issue in / })
            .first()
            .click();
         const dialog = page.getByRole('dialog');
         const assignee = dialog.getByRole('combobox', { name: 'Assignee', exact: true });
         await expect(assignee).toContainText(actor.name);
         if (clear) {
            await assignee.click();
            await page.getByRole('option', { name: /^Unassigned/ }).click();
         }
         await dialog
            .getByLabel('Issue title', { exact: true })
            .fill(`Account preferences ${clear ? 'cleared' : 'self'} ${Date.now()}`);
         const response = page.waitForResponse(
            (value) => value.request().method() === 'POST' && value.url() === `${api}/issues`
         );
         await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
         const result = await response;
         expect(result.ok()).toBeTruthy();
         const issue = (await result.json()).data;
         created.push(issue.id);
         expect(issue.assignee?.id ?? issue.assigneeId ?? null).toBe(clear ? null : fixture.userId);
         await expect(dialog).toHaveCount(0);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForLoadState('networkidle');
      await page.goto(`/${fixture.slug}/settings/preferences`);
      await expect(
         page.getByRole('textbox', { name: 'Account timezone', exact: true })
      ).toHaveValue('America/Los_Angeles');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
         390
      );
      await page.screenshot({
         path: `test-results/account-time-preferences-${browserName}.png`,
         animations: 'disabled',
      });
      expect(errors).toEqual([]);
   } finally {
      const current = (await (await context.request.get(endpoint)).json()).data;
      await context.request.put(endpoint, {
         data: {
            accountId: fixture.userId,
            expectedVersion: current.version,
            values: original.values,
         },
      });
      for (const id of created)
         await context.request.delete(`${api}/issues/${id}?workspaceId=${fixture.workspace_id}`);
   }
});
