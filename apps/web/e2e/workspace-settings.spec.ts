import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';

test('stable workspace links and owner deletion preserve other workspaces', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.workspace_id}/`));
   await page.goto(`/${fixture.legacy_slug}/projects?tab=active#timeline`);
   await expect(page).toHaveURL(
      new RegExp(`/${fixture.workspace_id}/projects\\?tab=active#timeline$`)
   );
   await page.goto(`/${fixture.legacy_slug}/settings/workspace`);
   await expect(page).toHaveURL(new RegExp(`/${fixture.workspace_id}/settings/workspace$`));
   await expect(
      page.getByRole('heading', { name: 'Workspace settings', exact: true })
   ).toBeVisible();

   const name = `Phòng Chuyển đổi số ${testInfo.project.name} ${Date.now()}`;
   const created = await context.request.post(`${api}/workspaces`, { data: { name } });
   expect(created.ok(), await created.text()).toBeTruthy();
   const workspace = (await created.json()).data.workspaces[0];
   let deleted = false;
   try {
      await page.goto(`/${workspace.id}/settings/workspace`);
      await page.getByRole('button', { name: 'Delete workspace', exact: true }).click();
      const dialog = page.getByRole('alertdialog', { name: 'Delete workspace?' });
      const confirm = dialog.getByRole('button', { name: 'Delete workspace permanently' });
      await expect(confirm).toBeDisabled();
      await dialog.getByLabel('Workspace name', { exact: true }).fill(name.toLowerCase());
      await expect(confirm).toBeDisabled();
      await dialog.getByLabel('Workspace name', { exact: true }).fill(name);
      await expect(confirm).toBeEnabled();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: 'Delete workspace', exact: true }).click();
      await expect(dialog.getByLabel('Workspace name', { exact: true })).toHaveValue('');
      await dialog.getByLabel('Workspace name', { exact: true }).fill(name);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
         path: testInfo.outputPath('delete-workspace-mobile.png'),
         fullPage: true,
      });
      expect(
         await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)
      ).toBeTruthy();
      await page.route(`${api}/workspaces/${workspace.id}`, async (route) => {
         if (route.request().method() === 'DELETE')
            await route.fulfill({
               status: 503,
               contentType: 'application/json',
               body: JSON.stringify({ message: 'Temporary failure. Try again.' }),
            });
         else await route.continue();
      });
      await confirm.click();
      await expect(dialog.getByRole('alert')).toHaveText('Temporary failure. Try again.');
      await expect(dialog.getByLabel('Workspace name', { exact: true })).toHaveValue(name);
      await expect(confirm).toBeEnabled();
      await page.unroute(`${api}/workspaces/${workspace.id}`);
      await confirm.click();
      await expect(page).toHaveURL(new RegExp(`/${fixture.workspace_id}/`));
      deleted = true;
      const memberships = (await (await context.request.get(`${api}/workspaces/me`)).json()).data;
      expect(
         memberships.some(
            (item: { workspace: { id: string } }) => item.workspace.id === workspace.id
         )
      ).toBeFalsy();
      expect(
         memberships.some(
            (item: { workspace: { id: string } }) => item.workspace.id === fixture.workspace_id
         )
      ).toBeTruthy();
   } finally {
      if (!deleted)
         await context.request.delete(`${api}/workspaces/${workspace.id}`, {
            data: { confirmationName: name },
         });
   }
   await page.route(`${api}/workspaces/me`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data = body.data.map((item: object) => ({ ...item, role: 'MEMBER' }));
      await route.fulfill({ response, json: body });
   });
   await page.goto(`/${fixture.workspace_id}/settings/workspace`);
   await expect(page.getByText('Workspace URL', { exact: true })).toBeVisible();
   await expect(page.getByText(`/${fixture.workspace_id}`, { exact: true })).toBeVisible();
   await expect(page.getByRole('button', { name: 'Delete workspace', exact: true })).toHaveCount(0);
   await page.waitForLoadState('networkidle');
   await page.unrouteAll({ behavior: 'wait' });
});
