import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
let created: string[] = [];

test.afterEach(async ({ context }) => {
   test.setTimeout(30000);
   const ids = created;
   created = [];
   for (const id of ids.reverse()) {
      const response = await context.request.delete(
         `${api}/issues/${id}?workspaceId=${fixture.workspace_id}`
      );
      expect(response.ok()).toBeTruthy();
   }
});

test('parent picker bounds long names, retries failed search and supports keyboard selection', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const create = async (title: string) => {
      const response = await context.request.post(`${api}/issues`, {
         data: {
            workspaceId: fixture.workspace_id,
            teamId: fixture.team_id,
            projectId: fixture.projectId,
            title,
         },
      });
      expect(response.ok()).toBeTruthy();
      const item = (await response.json()).data;
      created.push(item.id);
      return item;
   };
   const parent = await create('Picker parent ' + 'LongUnbrokenName'.repeat(24));
   const child = await create('Picker child');
   let fail = true;
   await page.route('**/api/v1/issues?*', async (route) => {
      if (fail)
         return route.fulfill({ status: 503, json: { message: 'Synthetic search failure' } });
      await route.continue();
   });
   await page.goto(`/${fixture.slug}/issue/${child.identifier}`);
   await page.getByRole('button', { name: 'Set parent', exact: true }).click();
   const dialog = page.getByRole('dialog', { name: 'Set parent', exact: true });
   const search = dialog.getByRole('textbox', { name: 'Search issues', exact: true });
   await expect(dialog.getByRole('alert')).toHaveText('Could not search issues.');
   await expect(dialog.getByText('No issues found.', { exact: true })).toHaveCount(0);
   fail = false;
   await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
   await search.fill(parent.identifier);
   const row = dialog.getByRole('listitem').filter({ hasText: parent.title });
   await expect(row).toBeVisible();
   await row.hover();
   await expect(page.getByRole('tooltip')).toHaveText(`${parent.identifier} · ${parent.title}`);
   await search.hover();
   await expect(page.getByRole('tooltip')).toHaveCount(0);
   for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
      expect(
         await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      ).toBeTruthy();
      const inputBox = await search.boundingBox(),
         dialogBox = await dialog.boundingBox();
      expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width);
   }
   await page.screenshot({ path: testInfo.outputPath('parent-picker-mobile.png'), fullPage: true });
   await row.getByRole('button').focus();
   await page.keyboard.press('Enter');
   await expect(dialog).toHaveCount(0);
   await page.reload();
   await expect(
      page.getByRole('link', { name: new RegExp(parent.identifier) }).first()
   ).toBeVisible();
});
