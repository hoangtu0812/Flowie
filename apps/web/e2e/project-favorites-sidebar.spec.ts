import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   projectId: string;
};

// Starring a project adds it under Projects in the sidebar at once and opens the project from
// another page; removing the star removes the entry and leaves no favorite behind for other specs.
// The sidebar also lists current projects, so the seeded project is reported as Completed in the
// unstarred lists: only the star can then put it in the sidebar.
// VI: Gắn sao thêm dự án vào dưới Projects ở sidebar ngay lập tức và mở được dự án từ trang khác;
// VI: bỏ sao xoá mục đó và không để lại yêu thích cho các spec khác. Sidebar cũng liệt kê dự án
// VI: đang chạy, nên dự án mẫu được trả về là Completed trong các danh sách không lọc sao: khi đó
// VI: chỉ có sao mới đưa được nó vào sidebar.
test('starred projects appear under Projects in the sidebar', async ({ page }) => {
   await page.route(/\/api\/v1\/projects\?/, async (route) => {
      if (new URL(route.request().url()).searchParams.get('favorite') === 'true')
         return route.continue();
      const response = await route.fetch();
      const body = (await response.json()) as { data: { id: string; status: string }[] };
      body.data = body.data.map((row) =>
         row.id === fixture.projectId ? { ...row, status: 'completed' } : row
      );
      return route.fulfill({ response, json: body });
   });
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
