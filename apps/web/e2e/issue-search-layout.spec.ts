import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';

test('issue search matches only identifier or title and preserves list geometry', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const created: string[] = [];
   try {
      const create = async (title: string, description: string) => {
         const response = await context.request.post(`${api}/issues`, {
            data: {
               workspaceId: fixture.workspace_id,
               teamId: fixture.team_id,
               projectId: fixture.projectId,
               title,
               description,
            },
         });
         expect(response.ok()).toBeTruthy();
         const issue = (await response.json()).data;
         created.push(issue.id);
         return issue;
      };
      const issue = await create('Đăng nhập đúng tiêu đề', 'description-only-unique');
      await create('Unrelated issue', 'Đăng nhập đúng tiêu đề');
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`/${fixture.slug}/issues`);
      const row = page
         .locator('.h-11')
         .filter({ has: page.getByRole('link', { name: issue.title, exact: true }) });
      await expect(row).toBeVisible();
      const geometry = () =>
         row.evaluate((el) => ({
            height: el.getBoundingClientRect().height,
            width: el.getBoundingClientRect().width,
         }));
      const initial = await geometry();
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      const input = page.getByPlaceholder('Search issues...', { exact: true });
      const search = async (query: string) => {
         const result = page.waitForResponse(
            (r) =>
               r.url().includes('/api/v1/issues?') &&
               new URL(r.url()).searchParams.get('query') === query &&
               r.ok()
         );
         await input.fill(query);
         return await (await result).json();
      };
      for (const query of ['dang nhap dung tieu de', issue.identifier.toLowerCase()]) {
         const result = await search(query);
         expect(result.meta.total).toBe(1);
         await expect(row).toBeVisible();
         expect(await geometry()).toEqual(initial);
         await expect(page.getByText('Unrelated issue', { exact: true })).toHaveCount(0);
         await expect(
            page.locator('.sticky.top-0').getByText('Project', { exact: true })
         ).toBeVisible();
         await expect(
            row.getByRole('link', { name: 'Regression project', exact: true })
         ).toBeVisible();
      }
      await page.screenshot({ path: testInfo.outputPath('search-list.png'), fullPage: true });
      expect((await search('description-only-unique')).meta.total).toBe(0);
      await expect(page.getByText('No issues to show.', { exact: true })).toBeVisible();
      await input.fill('');
      await expect(row).toBeVisible();
      expect(await geometry()).toEqual(initial);
   } finally {
      for (const id of created.reverse())
         await context.request.delete(`${api}/issues/${id}?workspaceId=${fixture.workspace_id}`);
   }
});
