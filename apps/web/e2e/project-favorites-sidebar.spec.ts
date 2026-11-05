import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   projectId: string;
};

// Starring a project adds it under Projects in the sidebar at once, it survives a reload and opens
// the project from another page; removing the star removes the entry and leaves no favorite behind
// for other specs.
// VI: Gắn sao thêm dự án vào dưới Projects ở sidebar ngay lập tức, còn nguyên sau khi tải lại và mở
// VI: được dự án từ trang khác; bỏ sao xoá mục đó và không để lại yêu thích cho các spec khác.
test('starred projects appear under Projects in the sidebar', async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   await page.goto(`/${fixture.slug}/project/${fixture.projectId}/overview`);
   const shortcut = page.locator('[data-sidebar="menu-sub"]').getByRole('link', {
      name: 'Regression project',
   });
   await expect(page.getByRole('heading', { name: 'Regression project' })).toBeVisible();
   await expect(shortcut).toHaveCount(0);

   await page.getByRole('button', { name: 'Add project to favorites' }).click();
   await expect(shortcut).toBeVisible();

   await page.goto(`/${fixture.slug}/issues`);
   await shortcut.click();
   await expect(page).toHaveURL(new RegExp(`/project/[^/]+/overview`));

   await page.getByRole('button', { name: 'Remove project from favorites' }).click();
   await expect(shortcut).toHaveCount(0);
});
