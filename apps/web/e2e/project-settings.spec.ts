import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   projectId: string;
};
const api = 'http://localhost:4000/api/v1';

test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
});

// The "…" menu opens Project settings; a new name and icon show in the header and the
// Overview at once, survive a reload, and an empty name cannot be saved. The test restores
// the seeded name so other specs keep finding "Regression project".
// VI: Menu "…" mở Project settings; tên và icon mới hiển thị ngay ở header và Overview, còn
// nguyên sau khi tải lại, và không lưu được tên rỗng. Test trả lại tên gốc để các spec khác
// vẫn tìm thấy "Regression project".
test('Project settings renames the project and changes its icon', async ({ page }) => {
   const overview = `/${fixture.slug}/project/${fixture.projectId}/overview`;
   await page.goto(overview);
   await expect(page.getByRole('heading', { name: 'Regression project' })).toBeVisible();

   const openSettings = async () => {
      await page.getByRole('button', { name: 'Project actions' }).click();
      await page.getByRole('menuitem', { name: 'Project settings' }).click();
      return page.getByRole('dialog', { name: 'Project settings' });
   };

   let dialog = await openSettings();
   await dialog.getByRole('textbox', { name: 'Name' }).fill('   ');
   await expect(dialog.getByText('Project name must have at least 2 characters.')).toBeVisible();
   await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();

   await dialog.getByRole('textbox', { name: 'Name' }).fill('Renamed regression project');
   await dialog.getByRole('textbox', { name: 'Icon' }).fill('🚀');
   const saved = page.waitForResponse(
      (response) =>
         response.url().startsWith(`${api}/projects/${fixture.projectId}?`) &&
         response.request().method() === 'PATCH' &&
         response.ok()
   );
   await dialog.getByRole('button', { name: 'Save' }).click();
   await saved;
   await expect(page.getByText('Project updated.')).toBeVisible();
   await expect(page.getByRole('heading', { name: 'Renamed regression project' })).toBeVisible();
   await expect(page.getByRole('button', { name: 'Change project icon' })).toContainText('🚀');

   await page.reload();
   await expect(page.getByRole('heading', { name: 'Renamed regression project' })).toBeVisible();
   await expect(page.getByRole('button', { name: 'Change project icon' })).toContainText('🚀');

   // Quick edit: click the name, type, press Enter.
   // VI: Sửa nhanh: bấm vào tên, gõ, nhấn Enter.
   await page.getByRole('button', { name: 'Renamed regression project' }).click();
   const nameInput = page.getByLabel('Project name');
   await nameInput.fill('Regression project');
   await nameInput.press('Enter');
   await expect(page.getByRole('heading', { name: 'Regression project' })).toBeVisible();

   dialog = await openSettings();
   await dialog.getByRole('textbox', { name: 'Icon' }).fill('');
   await dialog.getByRole('button', { name: 'Save' }).click();
   await expect(dialog).toHaveCount(0);
   await expect(page.getByRole('button', { name: 'Change project icon' })).not.toContainText('🚀');
});
