import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
};

async function signIn(page: Page) {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
}

// Workspace, Cycles and the team's Projects collapse from their own triggers, stay collapsed after
// a reload, clicking the "Cycles" text still navigates, and opening a project from the sidebar
// reopens the Workspace section that holds it.
// VI: Workspace, Cycles và Projects của team thu gọn bằng trigger riêng, vẫn thu gọn sau khi tải
// VI: lại, bấm chữ "Cycles" vẫn điều hướng, và mở một dự án từ sidebar sẽ mở lại khối Workspace
// VI: chứa nó.
test('sidebar sections collapse and keep their state across a reload', async ({ page }) => {
   await signIn(page);
   await page.goto(`/${fixture.slug}/issues`);

   const workspace = page.getByRole('button', { name: 'Workspace', exact: true });
   const cycles = page.getByRole('button', { name: 'Toggle Cycles' });
   const teamProjects = page.getByRole('button', { name: 'Toggle Projects' }).last();
   const dashboard = page.getByRole('link', { name: 'Dashboard', exact: true });
   const current = page.getByRole('link', { name: 'Current', exact: true });
   const project = page.locator('[data-sidebar="menu-sub"]').getByRole('link', {
      name: 'Regression project',
   });

   await expect(workspace).toHaveAttribute('aria-expanded', 'true');
   await expect(cycles).toHaveAttribute('aria-expanded', 'true');
   await expect(current).toBeVisible();
   // The seeded project is current, so it is listed for the workspace and for its team.
   // VI: Dự án mẫu đang chạy nên có trong danh sách của workspace và của team.
   await expect(project).toHaveCount(2);

   await workspace.click();
   await cycles.click();
   await teamProjects.click();
   await expect(workspace).toHaveAttribute('aria-expanded', 'false');
   await expect(dashboard).toHaveCount(0);
   await expect(current).toHaveCount(0);
   await expect(project).toHaveCount(0);

   await page.reload();
   await expect(workspace).toHaveAttribute('aria-expanded', 'false');
   await expect(cycles).toHaveAttribute('aria-expanded', 'false');
   await expect(teamProjects).toHaveAttribute('aria-expanded', 'false');
   await expect(dashboard).toHaveCount(0);

   await page.getByRole('link', { name: 'Cycles', exact: true }).click();
   await expect(page).toHaveURL(/\/team\/[^/]+\/cycles$/);
   await expect(cycles).toHaveAttribute('aria-expanded', 'false');

   await teamProjects.click();
   await project.click();
   await expect(page).toHaveURL(/\/project\/[^/]+\/overview$/);
   await expect(workspace).toHaveAttribute('aria-expanded', 'true');
   await expect(dashboard).toBeVisible();
});

// A browser that blocks this key in localStorage still gets the default sidebar, and the
// triggers still work for the page.
// VI: Trình duyệt chặn khoá này trong localStorage vẫn có sidebar mặc định, và trigger vẫn hoạt
// VI: động trong trang.
test('sidebar sections render with defaults when storage fails', async ({ page }) => {
   await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key: string) {
         if (key === 'sidebar-collapse') throw new Error('blocked');
         return getItem.call(this, key);
      };
      Storage.prototype.setItem = function (key: string, value: string) {
         if (key === 'sidebar-collapse') throw new Error('blocked');
         setItem.call(this, key, value);
      };
   });
   await signIn(page);

   const workspace = page.getByRole('button', { name: 'Workspace', exact: true });
   await expect(workspace).toHaveAttribute('aria-expanded', 'true');
   await workspace.click();
   await expect(workspace).toHaveAttribute('aria-expanded', 'false');
   await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
});
