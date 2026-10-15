import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   team_id: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1',
   scope = new URLSearchParams({ workspaceId: fixture.workspace_id }).toString();
test.use({ screenshot: 'only-on-failure' });
test('recurring settings preview, run once, edit and pause with real history', async ({
   page,
   context,
   browserName,
}) => {
   page.setDefaultTimeout(10000);
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await page.setViewportSize({ width: 390, height: 844 });
   const name = `Schedule browser ${Date.now()}`,
      title = `Scheduled browser issue ${Date.now()}`;
   let identifier: string | undefined;
   const scheduleRow = (value: string) =>
      page.getByRole('listitem').filter({ has: page.getByText(value, { exact: true }) });
   try {
      await page.goto(`/${fixture.slug}/settings/recurring`);
      await page.getByRole('button', { name: 'New recurring schedule', exact: true }).click();
      await page.getByRole('textbox', { name: /^Schedule name/ }).fill(name);
      await page.getByRole('combobox', { name: 'Repeat frequency', exact: true }).click();
      await page.getByRole('option', { name: 'DAILY', exact: true }).click();
      await page
         .getByRole('button', { name: 'Preview next five occurrences', exact: true })
         .click();
      await expect(
         page.getByRole('status').filter({ hasText: 'Next occurrences (UTC)' })
      ).toBeVisible();
      await page.getByRole('textbox', { name: /^Recurring issue title/ }).fill(title);
      await page.getByRole('combobox', { name: 'Recurring issue type', exact: true }).click();
      await page.getByRole('option', { name: 'BUG', exact: true }).click();
      await page.getByRole('combobox', { name: 'Recurring bug severity', exact: true }).click();
      await page.getByRole('option', { name: 'HIGH', exact: true }).click();
      await page.getByLabel('Due after minutes', { exact: true }).fill('30');
      await page.screenshot({
         path: `test-results/recurring-preview-${browserName}.png`,
         animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Create schedule', exact: true }).click();
      await expect(
         scheduleRow(name).getByRole('button', { name: 'History', exact: true })
      ).toBeVisible();
      const list = (await (await context.request.get(`${api}/recurring-schedules?${scope}`)).json())
         .data as { id: string; name: string }[];
      identifier = list.find((row) => row.name === name)!.id;
      await scheduleRow(name).getByRole('button', { name: 'Run now', exact: true }).click();
      await expect(
         page.getByRole('heading', { name: `Run history: ${name}`, exact: true })
      ).toBeVisible();
      await expect
         .poll(
            async () => {
               await page.getByRole('button', { name: 'Refresh run history', exact: true }).click();
               return page.getByText(/^DONE · GEN-\d+$/).count();
            },
            { timeout: 15000 }
         )
         .toBe(1);
      const issues = (
         await (
            await context.request.get(`${api}/issues?${scope}&query=${encodeURIComponent(title)}`)
         ).json()
      ).data;
      expect(issues).toHaveLength(1);
      expect(issues[0].issueType).toBe('BUG');
      expect(issues[0].severity).toBe('HIGH');
      await scheduleRow(name).getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByRole('textbox', { name: /^Schedule name/ }).fill(name + ' revised');
      await page.getByRole('button', { name: 'Save recurring schedule', exact: true }).click();
      await expect(
         scheduleRow(name + ' revised').getByRole('button', { name: 'Pause', exact: true })
      ).toBeVisible();
      await scheduleRow(name + ' revised')
         .getByRole('button', { name: 'Pause', exact: true })
         .click();
      await expect(
         scheduleRow(name + ' revised').getByRole('button', { name: 'Resume', exact: true })
      ).toBeVisible();
      await expect(
         scheduleRow(name + ' revised').getByRole('button', { name: 'Run now', exact: true })
      ).toBeDisabled();
      await page.screenshot({
         path: `test-results/recurring-list-${browserName}.png`,
         animations: 'disabled',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
         390
      );
      await page.waitForLoadState('networkidle');
      for (const button of await scheduleRow(name + ' revised')
         .getByRole('button')
         .all()) {
         const bounds = await button.boundingBox();
         expect(bounds).not.toBeNull();
         expect(bounds!.x).toBeGreaterThanOrEqual(0);
         expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      }
      await page.reload();
      await scheduleRow(name + ' revised')
         .getByRole('button', { name: 'History', exact: true })
         .click();
      await expect(page.getByText(/^DONE · GEN-\d+$/)).toBeVisible();
   } finally {
      if (identifier) {
         const detail = (
            await (
               await context.request.get(`${api}/recurring-schedules/${identifier}?${scope}`)
            ).json()
         ).data;
         if (detail.active)
            await context.request.post(`${api}/recurring-schedules/${identifier}/pause?${scope}`, {
               data: { expectedVersion: detail.version },
            });
      }
      const results = (
         await (
            await context.request.get(`${api}/issues?${scope}&query=${encodeURIComponent(title)}`)
         ).json()
      ).data as { id: string }[];
      for (const issue of results)
         await context.request.delete(`${api}/issues/${issue.id}?${scope}`);
   }
});
