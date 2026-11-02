import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';

test('long project lead stays inside its column and remains selectable', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const me = (await (await context.request.get(`${api}/users/me`)).json()).data;
   const project = (
      await (
         await context.request.get(
            `${api}/projects/${fixture.projectId}?workspaceId=${fixture.workspace_id}`
         )
      ).json()
   ).data;
   const name = 'Đinh Đoàn Mỹ Huyền với tên đầy đủ rất dài để kiểm tra cột Lead';
   try {
      expect(
         (await context.request.patch(`${api}/users/me`, { data: { name } })).ok()
      ).toBeTruthy();
      expect(
         (
            await context.request.patch(
               `${api}/projects/${fixture.projectId}?workspaceId=${fixture.workspace_id}`,
               { data: { leadId: me.id } }
            )
         ).ok()
      ).toBeTruthy();
      for (const width of [1280, 1600]) {
         await page.setViewportSize({ width, height: 800 });
         await page.goto(`/${fixture.slug}/projects`);
         const trigger = page.getByRole('combobox', { name, exact: true });
         await expect(trigger).toBeVisible();
         const fits = await trigger.evaluate((button) => {
            const bounds = button.getBoundingClientRect();
            const cell =
               button.parentElement!.parentElement!.parentElement!.getBoundingClientRect();
            return bounds.left >= cell.left && bounds.right <= cell.right + 1;
         });
         expect(fits).toBeTruthy();
         await expect(trigger).toHaveAttribute('title', name);
      }
      await page.screenshot({ path: testInfo.outputPath('project-lead.png'), fullPage: true });
      await page.getByRole('combobox', { name, exact: true }).click();
      await page.getByRole('option', { name: new RegExp(name) }).click();
      await page.reload();
      await expect(page.getByRole('combobox', { name, exact: true })).toBeVisible();
   } finally {
      await context.request.patch(`${api}/users/me`, { data: { name: me.name } });
      await context.request.patch(
         `${api}/projects/${fixture.projectId}?workspaceId=${fixture.workspace_id}`,
         { data: { leadId: project.leadId } }
      );
   }
});
