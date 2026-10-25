import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   team_id: string;
   projectId: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1',
   scope = new URLSearchParams({ workspaceId: fixture.workspace_id }).toString();
test.use({ screenshot: 'only-on-failure' });
test('workflow reports use captured events, scoped filters, day drilldown and mobile recovery', async ({
   page,
   context,
   browserName,
}) => {
   test.setTimeout(90000);
   page.setDefaultTimeout(10000);
   const errors: string[] = [];
   page.on('pageerror', (error) => errors.push(error.message));
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const title = `Reporting browser ${Date.now()}`,
      today = new Date().toISOString().slice(0, 10);
   const issues: { id: string; identifier: string }[] = [];
   try {
      const options = (
         await (
            await context.request.get(`${api}/issues/options?${scope}&teamId=${fixture.team_id}`)
         ).json()
      ).data;
      const statuses = options.statuses as { id: string; name: string }[];
      for (const index of [0, 1]) {
         const created = await context.request.post(`${api}/issues`, {
            data: {
               workspaceId: fixture.workspace_id,
               teamId: fixture.team_id,
               title: title + ' ' + index,
               issueType: index === 0 ? 'BUG' : 'TASK',
               severity: index === 0 ? 'HIGH' : null,
               estimatedEffort: index === 0 ? 2 : 3,
               ...(index === 0
                  ? { startDate: today, actualEffort: 1, projectId: fixture.projectId }
                  : {}),
            },
         });
         expect(created.ok()).toBeTruthy();
         issues.push((await created.json()).data);
      }
      for (const name of ['In Progress', 'Done', 'Todo', 'In Progress']) {
         const changed = await context.request.patch(`${api}/issues/${issues[0].id}?${scope}`, {
            data: { statusId: statuses.find((row) => row.name === name)!.id },
         });
         expect(changed.ok()).toBeTruthy();
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${fixture.slug}/reports`);
      await expect(
         page.getByRole('heading', { name: 'Workspace analytics', exact: true })
      ).toBeVisible();
      await page.getByRole('textbox', { name: 'Report from date', exact: true }).fill(today);
      await page.getByRole('textbox', { name: 'Report to date', exact: true }).fill(today);
      await page
         .getByRole('button', { name: 'More filters and calendar settings', exact: true })
         .click();
      await page.getByRole('textbox', { name: 'Report timezone', exact: true }).fill('UTC');
      await page.getByRole('textbox', { name: 'Report task search', exact: true }).fill(title);
      const response = page.waitForResponse(
         (value) =>
            value.url().includes('/reports/workflow?') &&
            value.request().postDataJSON()?.selection.query === title
      );
      await page.getByRole('button', { name: 'Apply report filters', exact: true }).click();
      const data = (await (await response).json()).data;
      expect(data.summary.total).toBe(2);
      expect(data.summary.wip).toBe(1);
      expect(data.summary.estimated_effort).toBe(5);
      expect(data.flow.observed_completions).toBe(1);
      expect(data.flow.lead_samples).toBe(1);
      expect(data.reopens.bugs_reopened).toBe(1);
      await expect(
         page
            .getByRole('group', { name: 'Accessible tasks', exact: true })
            .getByText('2', { exact: true })
      ).toBeVisible();
      await expect(page.getByText('2 of 2 workload groups loaded', { exact: true })).toBeVisible();
      await expect(page.getByText('2 of 2 project groups loaded', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Show daily values', exact: true }).click();
      const day = page
         .getByRole('listitem')
         .filter({ has: page.getByText(today, { exact: true }) });
      await day.click();
      await expect(
         page.getByRole('heading', { name: 'Captured activity: ' + today, exact: true })
      ).toBeVisible();
      await expect(page.getByText('4 of 4 day events loaded', { exact: true })).toBeVisible();
      await page.screenshot({
         path: `test-results/workflow-reports-${browserName}.png`,
         animations: 'disabled',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
         390
      );
      const filters = page
         .locator('form')
         .filter({ has: page.getByRole('button', { name: 'Apply report filters', exact: true }) });
      for (const element of await filters.locator('input,button').all()) {
         if (!(await element.isVisible())) continue;
         const bounds = await element.boundingBox();
         expect(bounds).not.toBeNull();
         expect(bounds!.x).toBeGreaterThanOrEqual(0);
         expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      }
      let fail = true;
      await page.route('**/reports/workflow?**', async (route) => {
         if (fail) {
            fail = false;
            await route.fulfill({
               status: 503,
               contentType: 'application/json',
               body: JSON.stringify({ message: 'Synthetic report recovery' }),
            });
         } else await route.continue();
      });
      await page.getByRole('button', { name: 'Refresh workspace analytics', exact: true }).click();
      await expect(
         page.getByRole('alert').filter({ hasText: 'Synthetic report recovery' })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Refresh workspace analytics', exact: true }).click();
      await expect(
         page
            .getByRole('group', { name: 'Accessible tasks', exact: true })
            .getByText('2', { exact: true })
      ).toBeVisible();
      await page
         .getByRole('textbox', { name: 'Report task search', exact: true })
         .fill(title + ' no match');
      await page.getByRole('button', { name: 'Apply report filters', exact: true }).click();
      await expect(
         page
            .getByRole('group', { name: 'Accessible tasks', exact: true })
            .getByText('0', { exact: true })
      ).toBeVisible();
      expect(errors).toEqual([]);
   } finally {
      for (const issue of issues)
         await context.request.delete(`${api}/issues/${issue.id}?${scope}`);
   }
});
