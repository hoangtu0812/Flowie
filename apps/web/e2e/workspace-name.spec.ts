import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
const created: Array<{ id: string; name: string }> = [];
test.afterEach(async ({ context }) => {
   test.setTimeout(30000);
   for (const workspace of created.splice(0)) {
      const memberships = await context.request.get(`${api}/workspaces/me`);
      const membership = (await memberships.json()).data.find(
         (item: { workspace: { id: string } }) => item.workspace.id === workspace.id
      );
      const response = await context.request.delete(`${api}/workspaces/${workspace.id}`, {
         data: { confirmationName: membership?.workspace.name ?? workspace.name },
      });
      expect(response.ok() || response.status() === 404).toBeTruthy();
   }
});
test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
});

test('rename keeps URL and aliases, retains failed draft and refreshes sidebar/switcher/title', async ({
   page,
   context,
}, testInfo) => {
   const response = await context.request.post(`${api}/workspaces`, {
      data: { name: `Synthetic names ${Date.now()}` },
   });
   expect(response.ok()).toBeTruthy();
   const workspace = (await response.json()).data.workspaces[0];
   const cleanup = { id: workspace.id, name: workspace.name };
   created.push(cleanup);
   const currentSlug = `name-test-${Date.now()}`;
   expect(
      (
         await context.request.patch(`${api}/workspaces/${workspace.id}`, {
            data: { slug: currentSlug },
         })
      ).ok()
   ).toBeTruthy();
   await page.goto(`/${currentSlug}/settings/workspace`);
   const input = page.getByRole('textbox', { name: 'Workspace name', exact: true });
   const save = page.getByRole('button', { name: 'Save name', exact: true });
   await expect(input).toHaveValue(workspace.name);
   await expect(save).toBeDisabled();
   const writes: unknown[] = [];
   let fail = true;
   let release: (() => void) | undefined;
   await page.route(`${api}/workspaces/${workspace.id}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      writes.push(route.request().postDataJSON());
      if (fail)
         return route.fulfill({ status: 503, json: { message: 'Synthetic rename failure' } });
      await new Promise<void>((resolve) => {
         release = resolve;
      });
      await route.continue();
   });
   for (const invalid of ['  \t ', 'x'.repeat(121)]) {
      await input.fill(invalid);
      await expect(save).toBeDisabled();
      await expect(
         page.getByRole('alert').filter({ hasText: 'Workspace name must' })
      ).toBeVisible();
      await input.press('Enter');
   }
   expect(writes).toEqual([]);
   const name = `Phòng nghiên cứu 📚 ${testInfo.project.name}`;
   await input.fill(`  ${name}  `);
   await save.click();
   await expect(
      page.getByRole('alert').filter({ hasText: 'Synthetic rename failure' })
   ).toBeVisible();
   await expect(input).toHaveValue(`  ${name}  `);
   expect(writes).toEqual([{ name }]);
   fail = false;
   await save.click();
   await expect(input).toBeDisabled();
   await expect(save).toBeDisabled();
   await expect.poll(() => writes.length).toBe(2);
   release!();
   await expect(
      page.getByRole('status').filter({ hasText: 'Workspace name updated.' })
   ).toBeVisible();
   cleanup.name = name;
   await expect(input).toHaveValue(name);
   await expect(page).toHaveURL(new RegExp(`/${currentSlug}/settings/workspace$`));
   await expect(page).toHaveTitle(new RegExp(name));
   await page.getByRole('link', { name: 'Back to app', exact: true }).click();
   const switcher = page.getByRole('button', { name: new RegExp(name) }).first();
   await expect(switcher).toBeVisible();
   await switcher.click();
   await page.getByRole('menuitem', { name: 'Switch Workspace', exact: true }).hover();
   await expect(page.getByRole('menuitem').filter({ hasText: name })).toBeVisible();
   await page.keyboard.press('Escape');
   await page.keyboard.press('Escape');
   await page.goto(`/${currentSlug}/settings/workspace`);
   await expect(input).toHaveValue(name);
   await expect(page.getByRole('textbox', { name: 'Workspace slug', exact: true })).toHaveValue(
      currentSlug
   );
   await page.screenshot({
      path: testInfo.outputPath('workspace-name-desktop.png'),
      fullPage: true,
   });
   await page.setViewportSize({ width: 390, height: 844 });
   expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
   ).toBeTruthy();
   const box = (await save.boundingBox())!;
   expect(box.x + box.width).toBeLessThanOrEqual(390);
   await page.screenshot({
      path: testInfo.outputPath('workspace-name-mobile.png'),
      fullPage: true,
   });
   await page.goto(`/${workspace.slug}/projects?tab=active#timeline`);
   await expect(page).toHaveURL(new RegExp(`/${currentSlug}/projects\\?tab=active#timeline$`));
});

for (const role of ['MEMBER', 'ADMIN_VIEWER']) {
   test(`${role} sees the saved name without name editing controls`, async ({ page }) => {
      let name = '';
      await page.route(`${api}/workspaces/me`, async (route) => {
         const response = await route.fetch();
         const body = await response.json();
         const membership = body.data.find(
            (item: { workspace: { id: string } }) => item.workspace.id === fixture.workspace_id
         );
         name = membership.workspace.name;
         membership.role = role;
         await route.fulfill({ response, json: body });
      });
      await page.goto(`/${fixture.slug}/settings/workspace`);
      await expect(page.getByText('Workspace name', { exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Workspace name', exact: true })).toHaveCount(
         0
      );
      await expect(page.getByRole('button', { name: 'Save name', exact: true })).toHaveCount(0);
      await expect(page.getByText(name, { exact: true }).last()).toBeVisible();
   });
}
