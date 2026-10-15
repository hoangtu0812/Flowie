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

test.beforeEach(async ({ page }) => {
   await page.emulateMedia({ colorScheme: 'dark' });
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   const ready = page.waitForResponse(
      (response) => response.url().startsWith(`${api}/teams?`) && response.ok()
   );
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await ready;
   await page.waitForLoadState('networkidle');
});

test('list commands stay in the toolbar, report errors recover and dialogs restore keyboard focus', async ({
   page,
   browserName,
}) => {
   const errors: string[] = [];
   page.on('pageerror', (error) => errors.push(error.message));
   let reports = 0;
   await page.route('**/api/v1/issues/bug-report?**', async (route) => {
      reports++;
      expect(new URL(route.request().url()).searchParams.get('teamId')).toBe(fixture.team_id);
      if (reports === 1)
         await route.fulfill({ status: 503, json: { message: 'Report temporarily unavailable' } });
      else await route.continue();
   });
   await page.goto(`/${fixture.slug}/team/GEN/all`);
   const actions = page.getByRole('button', { name: 'Issue actions', exact: true });
   await expect(actions).toBeEnabled();
   await expect(page.getByRole('button', { name: 'Bulk changes', exact: true })).toHaveCount(0);
   await expect(page.getByRole('button', { name: 'Bug report', exact: true })).toHaveCount(0);
   await expect(
      page.getByRole('button', { name: 'Export matching issues CSV', exact: true })
   ).toHaveCount(0);
   await expect(page.getByRole('button', { name: 'Load more issues', exact: true })).toHaveCount(0);
   expect(reports).toBe(0);
   const displayBox = await page
      .getByRole('button', { name: 'Display', exact: true })
      .boundingBox();
   const actionBox = await actions.boundingBox();
   expect(Math.abs(actionBox!.y - displayBox!.y)).toBeLessThan(3);
   await page.screenshot({
      path: `test-results/issue-toolbar-${browserName}.png`,
      animations: 'disabled',
      fullPage: true,
   });
   await actions.focus();
   await page.keyboard.press('Enter');
   await page.getByRole('menuitem', { name: 'Bug report', exact: true }).focus();
   await page.keyboard.press('Enter');
   const report = page.getByRole('dialog', { name: 'Bug report', exact: true });
   await expect(report).toBeVisible();
   await expect(report.getByRole('alert')).toContainText('Report temporarily unavailable');
   await report.getByRole('button', { name: 'Refresh bug report', exact: true }).click();
   await expect(report.getByText(/bugs in accessible team issues/)).toBeVisible();
   await page.keyboard.press('Escape');
   await expect(report).not.toBeVisible();
   await expect(actions).toBeFocused();
   await page.setViewportSize({ width: 390, height: 844 });
   await actions.click();
   const menu = page.getByRole('menu');
   await expect(menu).toBeVisible();
   const bounds = await menu.boundingBox();
   expect(bounds!.x).toBeGreaterThanOrEqual(0);
   expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
   await page.screenshot({
      path: `test-results/issue-toolbar-mobile-${browserName}.png`,
      animations: 'disabled',
      fullPage: true,
   });
   await page.getByRole('menuitem', { name: 'Bulk changes', exact: true }).click();
   const bulk = page.getByRole('dialog', { name: 'Bulk issue changes', exact: true });
   await expect(bulk).toBeVisible();
   await expect(bulk.getByRole('button', { name: 'Preview changes', exact: true })).toBeDisabled();
   await page.keyboard.press('Escape');
   await expect(bulk).not.toBeVisible();
   await expect(actions).toBeFocused();
   await page.waitForLoadState('networkidle');
   await page.goto(`/${fixture.slug}/project/${fixture.projectId}/issues`);
   await expect(actions).toBeEnabled();
   await expect(page.getByRole('button', { name: 'AI scheduling', exact: true })).toBeVisible();
   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
   await page.screenshot({
      path: `test-results/project-toolbar-mobile-${browserName}.png`,
      animations: 'disabled',
      fullPage: true,
   });
   await actions.click();
   await expect(page.getByRole('menuitem', { name: 'Bug report', exact: true })).toHaveCount(0);
   expect(errors).toEqual([]);
});

test('partial lists paginate at the bottom and remove the footer after the last page', async ({
   page,
}) => {
   // Keep real database cursors while reducing page size to exercise pagination with a small fixture.
   await page.route('**/api/v1/issues?**', async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('limit', '1');
      await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
   });
   await page.goto(`/${fixture.slug}/team/GEN/all`);
   const footer = page.getByRole('contentinfo');
   await expect(footer).toContainText(/1 of \d+ issues loaded/);
   const header = page.getByText('Title', { exact: true });
   const footBox = await footer.boundingBox();
   const headBox = await header.boundingBox();
   expect(footBox!.y).toBeGreaterThan(headBox!.y);
   for (let index = 0; index < 10 && (await footer.isVisible()); index++) {
      const before = await footer.textContent();
      await footer.getByRole('button', { name: 'Load more issues', exact: true }).click();
      await expect
         .poll(async () => ((await footer.isVisible()) ? footer.textContent() : 'complete'))
         .not.toBe(before);
   }
   await expect(footer).toHaveCount(0);
   await expect(page.getByRole('button', { name: 'Issue actions', exact: true })).toBeEnabled();
});
