import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';

test('headers cycle sorts, combine Shift priorities and truncate project names', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const projectName = 'Integrated Business Platform ' + 'Complete project name '.repeat(3);
   const response = await context.request.post(`${api}/projects`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: fixture.team_id,
         name: projectName,
         identifier: `C${Date.now().toString(36).slice(-7).toUpperCase()}`,
      },
   });
   expect(response.ok(), await response.text()).toBeTruthy();
   const project = (await response.json()).data;
   const issues: Array<{ id: string; identifier: string }> = [];
   const token = `ColumnSort${Date.now()}`;
   try {
      for (const [name, effort] of [
         ['Alpha', 3],
         ['Alpha', 1],
         ['Zulu', 2],
      ] as const) {
         const result = await context.request.post(`${api}/issues`, {
            data: {
               workspaceId: fixture.workspace_id,
               teamId: fixture.team_id,
               projectId: project.id,
               title: `${name} ${token}`,
               estimatedEffort: effort,
            },
         });
         expect(result.ok()).toBeTruthy();
         issues.push((await result.json()).data);
      }
      await page.setViewportSize({ width: 1800, height: 1000 });
      await page.goto(`/${fixture.slug}/issues`);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page.getByPlaceholder('Search issues...', { exact: true }).fill(token);
      const rows = page.locator('.h-11').filter({ has: page.locator('a[href*="/issue/"]') });
      await expect(rows).toHaveCount(3);
      await page.getByRole('button', { name: /^Display(?: options)?$/ }).click();
      await page.getByRole('combobox').filter({ hasText: 'Priority' }).first().click();
      await page.getByRole('option', { name: 'Manual', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-order-id]')).toHaveCount(3);
      const header = page.locator('.sticky.top-0');
      const title = header.getByRole('button', { name: /^Title:/ });
      const sorted = async (action: () => Promise<unknown>) => {
         const saved = page.waitForResponse(
            (r) =>
               r.url().includes('/api/v1/issues?') &&
               new URL(r.url()).searchParams.has('sort') &&
               r.ok()
         );
         await action();
         await saved;
      };
      await sorted(() => title.click());
      await expect(title).toHaveAccessibleName('Title: ascending (1)');
      await expect(page.locator('[data-order-id]')).toHaveCount(0);
      await expect(rows.first()).toContainText('Alpha');
      await expect(rows.last()).toContainText('Zulu');
      await sorted(() =>
         header.getByRole('button', { name: /^Est. effort:/ }).click({ modifiers: ['Shift'] })
      );
      await expect(
         header.getByRole('button', { name: 'Est. effort: ascending (2)', exact: true })
      ).toBeVisible();
      const ids = () =>
         rows.evaluateAll((els) =>
            els.map((el) =>
               el.querySelector('a[href*="/issue/"]')!.getAttribute('href')!.split('/').pop()
            )
         );
      await expect
         .poll(ids)
         .toEqual([issues[1].identifier, issues[0].identifier, issues[2].identifier]);
      const projectLink = rows.first().getByRole('link', { name: projectName, exact: true });
      const text = projectLink.locator('.astryx-text');
      await expect(text).toBeVisible();
      expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBeTruthy();
      expect(await text.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
      await projectLink.hover();
      await expect(page.getByRole('tooltip')).toHaveText(projectName);
      await page.screenshot({
         path: testInfo.outputPath('column-sorting-project.png'),
         fullPage: true,
      });
      await page.mouse.move(0, 0);
      await sorted(() => title.click());
      await expect(title).toHaveAccessibleName('Title: descending (1)');
      await expect(rows.first()).toContainText('Zulu');
      const reset = page.waitForResponse(
         (r) =>
            r.url().includes('/api/v1/issues?') &&
            !new URL(r.url()).searchParams.has('sort') &&
            r.ok()
      );
      await title.click();
      await reset;
      await expect(title).toHaveAccessibleName('Title: default order');
      await expect(page.locator('[data-order-id]')).toHaveCount(3);
   } finally {
      for (const issue of issues.reverse())
         await context.request.delete(
            `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`
         );
      await context.request.delete(
         `${api}/projects/${project.id}?workspaceId=${fixture.workspace_id}`
      );
   }
});
