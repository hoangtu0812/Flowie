import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';

test('subtasks show aligned parent indicators with hover and keyboard tooltips', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const ids: string[] = [];
   try {
      const create = async (title: string, parentIssueId?: string) => {
         const response = await context.request.post(`${api}/issues`, {
            data: {
               workspaceId: fixture.workspace_id,
               teamId: fixture.team_id,
               title,
               parentIssueId,
            },
         });
         expect(response.ok()).toBeTruthy();
         const item = (await response.json()).data;
         ids.push(item.id);
         return item;
      };
      const root = await create('Indicator root ' + 'Full parent title '.repeat(15));
      const child = await create('Indicator child', root.id);
      await page.goto(`/${fixture.slug}/issues`);
      const rootRow = page
         .locator('.h-11')
         .filter({ has: page.locator(`a[href$="/issue/${root.identifier}"]`) });
      const childRow = page
         .locator('.h-11')
         .filter({ has: page.getByRole('link', { name: child.title, exact: true }) });
      const indicator = childRow.getByRole('button', {
         name: `Parent: ${root.identifier} - ${root.title}`,
         exact: true,
      });
      await expect(indicator).toBeVisible();
      await expect(rootRow.getByRole('button', { name: /^Parent:/ })).toHaveCount(0);
      const geometry = async (row: typeof rootRow, identifier: string) =>
         row.evaluate((el, id) => {
            const idElement = [...el.querySelectorAll('span')].find((n) => n.textContent === id)!;
            const priority = el.querySelector('[role="combobox"]')!;
            return {
               id: idElement.getBoundingClientRect().x,
               priority: priority.getBoundingClientRect().x,
            };
         }, identifier);
      expect(await geometry(rootRow, root.identifier)).toEqual(
         await geometry(childRow, child.identifier)
      );
      await indicator.hover();
      await expect(page.getByRole('tooltip')).toHaveText(
         `Parent: ${root.identifier} - ${root.title}`
      );
      await page.screenshot({ path: testInfo.outputPath('parent-indicator.png') });
      await page.mouse.move(0, 0);
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await indicator.focus();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await indicator.press('Tab');
      await expect(page.getByRole('tooltip')).toHaveCount(0);
   } finally {
      for (const id of ids.reverse())
         await context.request.delete(`${api}/issues/${id}?workspaceId=${fixture.workspace_id}`);
   }
});
