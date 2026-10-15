import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   team_id: string;
   userId: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';
const scope = new URLSearchParams({ workspaceId: fixture.workspace_id }).toString();
test.use({ screenshot: 'only-on-failure' });
test('business SLA revision, pause, override, reopen, history and mobile recovery', async ({
   page,
   context,
   browserName,
}) => {
   page.setDefaultTimeout(10000);
   const exceptions: string[] = [];
   page.on('pageerror', (error) => exceptions.push(error.message));
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await page.setViewportSize({ width: 390, height: 844 });
   const name = `Business SLA browser ${Date.now()}`;
   let policyId: string | undefined, issue: { id: string; identifier: string } | undefined;
   const row = () =>
      page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) });
   const policy = async () =>
      (
         (
            await (
               await context.request.get(`${api}/slas?${scope}&limit=100&includeArchived=true`)
            ).json()
         ).data as { id: string; name: string; version: number }[]
      ).find((value) => value.name === name)!;
   try {
      await page.goto(`/${fixture.slug}/settings/slas`);
      await page.getByRole('button', { name: 'New SLA', exact: true }).click();
      await page.getByRole('textbox', { name: /^SLA name/ }).fill(name);
      await page.getByRole('combobox', { name: 'Policy team', exact: true }).click();
      await page.getByRole('option', { name: 'General', exact: true }).click();
      await page.getByRole('combobox', { name: 'Policy priority', exact: true }).click();
      await page.getByRole('option', { name: 'Urgent', exact: true }).click();
      await page.getByRole('textbox', { name: /^Deadline duration/ }).fill('60');
      await page
         .getByRole('textbox', { name: 'Warning minutes remaining', exact: true })
         .fill('15');
      await page.getByRole('combobox', { name: 'Clock calendar', exact: true }).click();
      await page.getByRole('option', { name: 'Business working hours', exact: true }).click();
      await page
         .getByRole('textbox', { name: 'Holiday dates', exact: true })
         .fill('2026-12-25\n2027-01-01');
      await page.getByRole('button', { name: 'Pause in statuses', exact: true }).click();
      await page.getByRole('option', { name: 'Paused', exact: true }).click();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Preview deadline', exact: true }).click();
      await expect(
         page.getByRole('status').filter({ hasText: 'Starting now, deadline:' })
      ).toBeVisible();
      await page.screenshot({
         path: `test-results/sla-calendar-${browserName}.png`,
         animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Create SLA', exact: true }).click();
      await expect(row().getByRole('button', { name: 'Edit SLA', exact: true })).toBeVisible();
      policyId = (await policy()).id;
      for (const button of await row().getByRole('button').all()) {
         const bounds = await button.boundingBox();
         expect(bounds).not.toBeNull();
         expect(bounds!.x).toBeGreaterThanOrEqual(0);
         expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      }
      const created = await context.request.post(`${api}/issues`, {
         data: {
            workspaceId: fixture.workspace_id,
            teamId: fixture.team_id,
            title: name + ' task',
            priority: 'URGENT',
         },
      });
      expect(created.ok()).toBeTruthy();
      issue = (await created.json()).data;
      await row().getByRole('button', { name: 'Edit SLA', exact: true }).click();
      await page.getByRole('textbox', { name: /^Deadline duration/ }).fill('120');
      await page.getByRole('button', { name: 'Save SLA', exact: true }).click();
      await row().getByRole('button', { name: 'Policy history', exact: true }).click();
      await expect(page.getByText('Revision 2 · CHANGED', { exact: true })).toBeVisible();
      const teamReport = page.waitForResponse(
         (response) =>
            response.url().includes('/slas/report?') &&
            response.request().method() === 'POST' &&
            response.request().postDataJSON()?.teamId === fixture.team_id
      );
      await page.getByRole('combobox', { name: 'SLA report team', exact: true }).click();
      await page.getByRole('option', { name: 'General', exact: true }).click();
      expect((await (await teamReport).json()).data.total).toBeGreaterThanOrEqual(1);
      await page.waitForLoadState('networkidle');
      await page.goto(`/${fixture.slug}/issue/${issue!.identifier}`);
      const panel = page.getByRole('region', { name: 'Issue SLA', exact: true });
      await expect(
         panel.getByText(name + ' · Revision 1 · Cycle 1', { exact: true })
      ).toBeVisible();
      await panel.getByRole('button', { name: 'Use current SLA policy', exact: true }).click();
      await panel.getByRole('button', { name: 'Confirm current SLA', exact: true }).click();
      await expect(
         panel.getByText(name + ' · Revision 2 · Cycle 2', { exact: true })
      ).toBeVisible();
      const options = (
         await (
            await context.request.get(`${api}/issues/options?${scope}&teamId=${fixture.team_id}`)
         ).json()
      ).data;
      const statuses = options.statuses as { id: string; name: string }[];
      const changeStatus = async (name: string) => {
         const result = await context.request.patch(`${api}/issues/${issue!.id}?${scope}`, {
            data: { statusId: statuses.find((row) => row.name === name)!.id },
         });
         expect(result.ok()).toBeTruthy();
         await page.waitForLoadState('networkidle');
         await page.reload();
      };
      await changeStatus('Paused');
      await expect(panel.getByText('PAUSED', { exact: true })).toBeVisible();
      await changeStatus('In Progress');
      await expect(panel.getByText('ACTIVE', { exact: true })).toBeVisible();
      const manual = await context.request.patch(`${api}/issues/${issue!.id}?${scope}`, {
         data: { dueDate: new Date(Date.now() + 86400000).toISOString() },
      });
      expect(manual.ok()).toBeTruthy();
      await page.waitForLoadState('networkidle');
      await page.reload();
      await expect(panel.getByText('Manual deadline', { exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Use current SLA policy', exact: true }).click();
      await panel.getByRole('button', { name: 'Confirm current SLA', exact: true }).click();
      await expect(
         panel.getByText(name + ' · Revision 2 · Cycle 3', { exact: true })
      ).toBeVisible();
      await changeStatus('Done');
      await expect(panel.getByText('COMPLETED', { exact: true })).toBeVisible();
      await expect(
         panel.getByRole('button', { name: 'Use current SLA policy', exact: true })
      ).toBeDisabled();
      await changeStatus('Todo');
      await expect(
         panel.getByText(name + ' · Revision 2 · Cycle 4', { exact: true })
      ).toBeVisible();
      await panel.getByRole('button', { name: 'Show SLA history', exact: true }).click();
      await expect(panel.getByText('4 of 4 accessible SLA cycles', { exact: true })).toBeVisible();
      await page.screenshot({
         path: `test-results/sla-task-${browserName}.png`,
         animations: 'disabled',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
         390
      );
      for (const button of await panel.getByRole('button').all()) {
         const bounds = await button.boundingBox();
         expect(bounds).not.toBeNull();
         expect(bounds!.x).toBeGreaterThanOrEqual(0);
         expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      }
      await page.waitForLoadState('networkidle');
      let fail = true;
      await page.route(`**/slas/issues/${issue!.id}/clock?**`, async (route) => {
         if (fail) {
            fail = false;
            await route.fulfill({
               status: 503,
               contentType: 'application/json',
               body: JSON.stringify({ message: 'Synthetic SLA recovery' }),
            });
         } else await route.continue();
      });
      await page.reload();
      await panel.getByRole('button', { name: 'Reload SLA', exact: true }).click();
      await expect(
         panel.getByText(name + ' · Revision 2 · Cycle 4', { exact: true })
      ).toBeVisible();
      expect(exceptions).toEqual([]);
   } finally {
      if (issue) await context.request.delete(`${api}/issues/${issue.id}?${scope}`);
      if (policyId) {
         const current = await policy();
         await context.request.post(`${api}/slas/${policyId}/archive?${scope}`, {
            data: { expectedVersion: current.version },
         });
      }
   }
});
