import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   superAdminEmail: string;
   adminViewerEmail: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';

async function openUsers(page: Page, email: string) {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).not.toHaveURL(/\/auth\/login/);
   await page.goto('/admin');
   await page.getByRole('button', { name: 'Users', exact: true }).click();
}

const role = (page: Page, name: string) =>
   page.getByRole('combobox', { name: `Platform role of ${name}` });

// A super admin grants and revokes a role, and the change survives a reload. Their own row stays
// locked because nobody changes their own access. The test ends with the role revoked.
// VI: Super admin cấp và thu hồi vai trò, thay đổi còn nguyên sau khi tải lại. Dòng của chính họ bị
// VI: khoá vì không ai tự đổi quyền của mình. Test kết thúc khi vai trò đã được thu hồi.
test('super admins grant and revoke platform roles', async ({ page }) => {
   await openUsers(page, fixture.superAdminEmail);
   await expect(role(page, 'Regression Super Admin')).toBeDisabled();

   const plain = role(page, 'Regression Plain User');
   await expect(plain).toHaveText('No admin role');
   await plain.click();
   await page.getByRole('option', { name: 'Admin view only' }).click();
   await expect(plain).toHaveText('Admin view only');

   await page.reload();
   await page.getByRole('button', { name: 'Users', exact: true }).click();
   await expect(plain).toHaveText('Admin view only');

   await plain.click();
   await page.getByRole('option', { name: 'No admin role' }).click();
   await expect(plain).toHaveText('No admin role');
});

// A view-only administrator reads every account, finds every control locked, and is refused by the
// API when the locked control is bypassed.
// VI: Admin chỉ xem đọc được mọi tài khoản, thấy mọi điều khiển bị khoá và bị API từ chối khi vượt
// VI: qua điều khiển đã khoá.
test('view-only administrators cannot change accounts', async ({ page }) => {
   await openUsers(page, fixture.adminViewerEmail);
   await expect(role(page, 'Regression Plain User')).toBeDisabled();
   await expect(page.getByRole('button', { name: 'Suspend' }).first()).toBeDisabled();

   const refused = await page.evaluate(async (url) => {
      const users = await (await fetch(`${url}/admin/users`, { credentials: 'include' })).json();
      const target = users.data[0].id;
      const response = await fetch(`${url}/admin/users/${target}`, {
         method: 'PATCH',
         credentials: 'include',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ platformRole: 'SUPER_ADMIN' }),
      });
      return response.status;
   }, api);
   expect(refused).toBe(403);
});
