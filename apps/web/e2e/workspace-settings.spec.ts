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
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   // Links by id move to the slug and keep the whole destination.
   // VI: Link theo id được chuyển sang slug và giữ nguyên toàn bộ đích.
   await page.goto(`/${fixture.workspace_id}/projects?tab=active#timeline`);
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/projects\\?tab=active#timeline$`));
   await page.goto(`/${fixture.workspace_id}/settings/workspace`);
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/settings/workspace$`));
   await expect(
      page.getByRole('heading', { name: 'Workspace settings', exact: true })
   ).toBeVisible();

   // An owner changes the slug: the tab moves, the old slug redirects, then the seed slug is
   // restored (a workspace may go back to its own earlier slug).
   // VI: Owner đổi slug: tab chuyển địa chỉ, slug cũ chuyển hướng, rồi trả lại slug của seed
   // VI: (workspace được quay lại slug cũ của chính nó).
   const slugInput = page.getByRole('textbox', { name: 'Workspace slug' });
   await expect(slugInput).toHaveValue(fixture.slug);
   await slugInput.fill('Bad Slug');
   await expect(page.getByRole('button', { name: 'Save URL' })).toBeDisabled();
   const renamed = `e2e-${Date.now()}`;
   const saveSlug = async (value: string) => {
      await slugInput.fill(value);
      const saved = page.waitForResponse(
         (response) =>
            response.url() === `${api}/workspaces/${fixture.workspace_id}` &&
            response.request().method() === 'PATCH'
      );
      await page.getByRole('button', { name: 'Save URL' }).click();
      expect((await saved).ok()).toBeTruthy();
   };
   await saveSlug(renamed);
   await expect(page).toHaveURL(new RegExp(`/${renamed}/settings/workspace$`));
   await page.goto(`/${fixture.slug}/projects?tab=active`);
   await expect(page).toHaveURL(new RegExp(`/${renamed}/projects\\?tab=active$`));
   await page.goto(`/${renamed}/settings/workspace`);
   await saveSlug(fixture.slug);
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/settings/workspace$`));

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
      await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
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
   // Members see the full slug URL but cannot edit it or delete the workspace.
   // VI: Thành viên thấy URL slug đầy đủ nhưng không sửa được và không xoá được workspace.
   await expect(page.getByText(new RegExp(`/${fixture.slug}$`))).toBeVisible();
   await expect(page.getByRole('textbox', { name: 'Workspace slug' })).toHaveCount(0);
   await expect(page.getByRole('button', { name: 'Delete workspace', exact: true })).toHaveCount(0);
   await page.waitForLoadState('networkidle');
   await page.unrouteAll({ behavior: 'wait' });
});
