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
const api = 'http://localhost:4000/api/v1';
test.use({ screenshot: 'only-on-failure' });
test('original dashboard composition keeps complete scoped data and advanced reports separate', async ({
   page,
   context,
   browserName,
}) => {
   test.setTimeout(90000);
   const errors: string[] = [];
   page.on('pageerror', (error) => errors.push(error.message));
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   const workspace = page.waitForResponse((r) => r.url().startsWith(`${api}/teams?`) && r.ok());
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await workspace;
   await page.waitForLoadState('networkidle');
   const scope = new URLSearchParams({ workspaceId: fixture.workspace_id }).toString();
   const loaded = page.waitForResponse((r) => r.url().includes('/reports/dashboard?') && r.ok());
   await page.goto(`/${fixture.slug}/dashboard`);
   const data = (await (await loaded).json()).data;
   await expect(
      page.getByRole('heading', { name: 'Workspace dashboard', exact: true })
   ).toBeVisible();
   for (const name of ['Created', 'Done', 'Completion rate', 'Open now', 'Overdue']) {
      await expect(page.getByRole('group', { name, exact: true })).toBeVisible();
   }
   await expect(
      page
         .getByRole('group', { name: 'Created', exact: true })
         .getByText(String(data.summary.created_in_range), { exact: true })
   ).toBeVisible();
   const throughput = page.getByRole('figure', { name: 'Issue throughput', exact: true });
   const status = page.getByRole('figure', { name: 'Open work by status', exact: true });
   const left = (await throughput.boundingBox())!,
      right = (await status.boundingBox())!;
   await page.screenshot({
      path: `test-results/dashboard-desktop-${browserName}.png`,
      animations: 'disabled',
   });
   const openStatus = data.statuses.find(
      (row: { category: string }) => !['COMPLETED', 'CANCELED'].includes(row.category)
   );
   if (openStatus) {
      const statusRequest = page.waitForResponse(
         (response) =>
            response.url().includes('/reports/dashboard?') &&
            response.request().postDataJSON()?.selection.filters?.[0]?.values?.[0] === openStatus.id
      );
      await status
         .getByRole('button', { name: `${openStatus.name} (${openStatus.count})`, exact: true })
         .click();
      expect((await statusRequest).ok()).toBeTruthy();
      await page.getByRole('button', { name: 'Clear focus', exact: true }).click();
   }
   await page.getByRole('button', { name: 'Show daily activity', exact: true }).click();
   await expect(page.getByRole('heading', { name: /^Captured activity:/ })).toBeVisible();
   await page.getByRole('button', { name: 'Close day activity', exact: true }).click();
   expect(Math.abs(left.y - right.y)).toBeLessThan(10);
   expect(left.width / right.width).toBeGreaterThan(1.7);
   if (data.projectThroughput.some((row: { created: number }) => row.created > 0)) {
      await expect(
         page
            .getByRole('figure', { name: 'Throughput by project', exact: true })
            .locator('.recharts-bar-rectangle path')
            .first()
      ).toBeVisible();
   }
   await page.setViewportSize({ width: 1600, height: 1600 });
   await page.mouse.move(0, 0);
   await page.screenshot({
      path: `test-results/dashboard-wide-${browserName}.png`,
      animations: 'disabled',
   });
   await page.setViewportSize({ width: 1280, height: 800 });
   await page.getByRole('combobox', { name: 'Project', exact: true }).click();
   const project = (
      await (await context.request.get(`${api}/projects/${fixture.projectId}?${scope}`)).json()
   ).data;
   await page.getByRole('option', { name: project.name, exact: true }).click();
   const filtered = page.waitForResponse(
      (r) =>
         r.url().includes('/reports/dashboard?') &&
         r.request().postDataJSON()?.selection.projectId === fixture.projectId
   );
   await page.getByRole('button', { name: 'Apply', exact: true }).click();
   expect((await filtered).ok()).toBeTruthy();
   await expect(page.getByRole('heading', { name: 'Effort trend', exact: true })).toBeVisible();
   const week = page.waitForRequest(
      (r) =>
         r.url().includes('/reports/dashboard?') &&
         r.method() === 'POST' &&
         r.postDataJSON()?.selection.projectId === fixture.projectId
   );
   await page.getByRole('button', { name: '1 week', exact: true }).click();
   const query = (await week).postDataJSON();
   expect((Date.parse(query.toDate) - Date.parse(query.fromDate)) / 86400000).toBe(6);
   await page.waitForLoadState('networkidle');
   await page.setViewportSize({ width: 390, height: 844 });
   await page
      .getByRole('heading', { name: 'Workspace dashboard', exact: true })
      .scrollIntoViewIfNeeded();
   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
   await page.screenshot({
      path: `test-results/dashboard-mobile-${browserName}.png`,
      animations: 'disabled',
   });
   for (const name of ['Effort trend', 'Throughput by project', 'Effort by project'])
      await expect(page.getByRole('figure', { name, exact: true })).toBeVisible();
   await page.getByRole('figure', { name: 'Effort trend', exact: true }).scrollIntoViewIfNeeded();
   await page.screenshot({
      path: `test-results/dashboard-effort-${browserName}.png`,
      animations: 'disabled',
   });
   let fail = true;
   await page.route('**/reports/dashboard?**', async (route) => {
      if (fail) {
         fail = false;
         await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Synthetic dashboard recovery' }),
         });
      } else await route.continue();
   });
   await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
   await expect(
      page.getByRole('alert').filter({ hasText: 'Synthetic dashboard recovery' })
   ).toBeVisible();
   await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
   await expect(page.getByRole('group', { name: 'Open now', exact: true })).toBeVisible();
   await page.waitForLoadState('networkidle');
   await page.getByRole('link', { name: 'Advanced reports', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/reports$`));
   await expect(
      page.getByRole('heading', { name: 'Workspace analytics', exact: true })
   ).toBeVisible();
   await page
      .getByRole('button', { name: 'More filters and calendar settings', exact: true })
      .click();
   await expect(page.getByRole('textbox', { name: 'Report timezone', exact: true })).toBeVisible();
   await page.waitForLoadState('networkidle');
   await page.getByRole('link', { name: 'Back to dashboard', exact: true }).click();
   await expect(
      page.getByRole('heading', { name: 'Workspace dashboard', exact: true })
   ).toBeVisible();
   expect(errors).toEqual([]);
});
