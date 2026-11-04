import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
const basePath = process.env.FLOWIE_E2E_BASE_PATH ?? '';
const appPath = (path: string) => `${basePath}${path}`;
let created: string[] = [];
test.afterEach(async ({ context }) => {
   test.setTimeout(30000);
   for (const id of created.reverse())
      await context.request.delete(`${api}/issues/${id}?workspaceId=${fixture.workspace_id}`);
   created = [];
});

test('subtask badge loads direct children, retries, scrolls and supports hover and keyboard navigation', async ({
   page,
   context,
}, testInfo) => {
   await page.goto(appPath('/auth/login'));
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const create = async (title: string, parentIssueId?: string) => {
      const response = await context.request.post(`${api}/issues`, {
         data: { workspaceId: fixture.workspace_id, teamId: fixture.team_id, title, parentIssueId },
      });
      expect(response.ok()).toBeTruthy();
      const issue = (await response.json()).data;
      created.push(issue.id);
      return issue;
   };
   const parent = await create('Hover parent');
   const children = [];
   for (let index = 0; index < 18; index++)
      children.push(await create(`Direct child ${index}`, parent.id));
   await create('Hidden grandchild', children[0].id);
   let fail = true;
   await page.route(`**/issues/${parent.id}/sub-issues?*`, async (route) => {
      if (fail) return route.fulfill({ status: 503, json: { message: 'Synthetic failure' } });
      await route.continue();
   });
   await page.goto(appPath(`/${fixture.slug}/issues`));
   const badge = page.getByRole('button', {
      name: `Sub-issues of ${parent.identifier}`,
      exact: true,
   });
   const popup = page.getByRole('dialog', {
      name: `Sub-issues of ${parent.identifier}`,
      exact: true,
   });
   await badge.hover();
   await expect(popup.getByRole('alert')).toHaveText('Could not load sub-issues.');
   fail = false;
   await popup.getByRole('button', { name: 'Retry', exact: true }).click();
   await expect(popup.getByRole('link')).toHaveCount(18);
   await expect(popup.getByText('Hidden grandchild')).toHaveCount(0);
   const list = popup.getByTestId('subtask-popover-list');
   expect((await list.boundingBox())!.height).toBeLessThanOrEqual(260);
   expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBeTruthy();
   await popup.hover();
   await expect(popup).toBeVisible();
   await page.screenshot({ path: testInfo.outputPath('subtask-hover.png') });
   await page.mouse.move(0, 0);
   await expect(popup).toHaveCount(0);
   await badge.focus();
   await expect(popup.getByRole('link')).toHaveCount(18);
   await badge.press('Escape');
   await expect(popup).toHaveCount(0);
   await page.mouse.move(0, 0);
   await badge.hover();
   const destination = popup.locator(`a[href$="/issue/${children[17].identifier}"]`);
   const detailPath = appPath(`/${fixture.slug}/issue/${children[17].identifier}`);
   await expect(destination).toHaveAttribute('href', detailPath);
   await destination.scrollIntoViewIfNeeded();
   await destination.click();
   await expect(page).toHaveURL(detailPath);
   await expect(page.getByText(children[17].title, { exact: true }).first()).toBeVisible();
   await page.reload();
   await expect(page).toHaveURL(detailPath);
   await expect(page.getByText(children[17].title, { exact: true }).first()).toBeVisible();
   writeFileSync(
      testInfo.outputPath('subtask-navigation.json'),
      JSON.stringify(
         {
            browser: testInfo.project.name,
            basePath,
            expectedPath: detailPath,
            actualUrlAfterReload: page.url(),
            identifier: children[17].identifier,
         },
         null,
         2
      )
   );
});
