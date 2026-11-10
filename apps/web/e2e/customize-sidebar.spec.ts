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

// Team rows carry a screen-reader-only "More" label too, so match the Workspace menu button whose whole
// text is "More" instead of any element with that text.
// VI: Dòng team cũng có nhãn "More" chỉ dành cho trình đọc màn hình, nên chọn nút menu Workspace có toàn bộ
// VI: nội dung là "More" thay vì bất kỳ phần tử nào chứa chữ đó.
async function openCustomize(page: Page) {
   await page.locator('[data-sidebar="menu-button"]', { hasText: /^More$/ }).click();
   await page.getByRole('menuitem', { name: 'Customize sidebar' }).click();
   return page.getByRole('dialog', { name: 'Customize sidebar' });
}

// Settings saved by the old dropdown ('badged', 'never', keys missing from older versions) show as
// the matching switch and checkbox states; a switch flipped from the keyboard hides or shows the
// item in the sidebar at once and the choice survives a reload.
// VI: Cấu hình lưu từ dropdown cũ ('badged', 'never', khoá thiếu ở bản cũ) hiển thị đúng trạng thái
// VI: switch và checkbox; gạt switch bằng bàn phím ẩn hoặc hiện mục trong sidebar ngay và lựa chọn
// VI: vẫn giữ sau khi tải lại.
test('customize sidebar uses switches and keeps saved settings', async ({ page }) => {
   await page.addInitScript(() => {
      if (localStorage.getItem('sidebar-prefs')) return;
      localStorage.setItem(
         'sidebar-prefs',
         JSON.stringify({ state: { visibility: { inbox: 'badged', docs: 'never' } }, version: 0 })
      );
   });
   await signIn(page);
   await page.goto(`/${fixture.slug}/issues`);

   const initiativesLink = page.getByRole('link', { name: 'Initiatives', exact: true });
   await expect(initiativesLink).toBeVisible();

   let dialog = await openCustomize(page);
   await expect(dialog.getByText('Always show')).toHaveCount(0);
   await expect(dialog.getByText("Don't show")).toHaveCount(0);
   await expect(dialog.getByRole('button', { name: /Count/ })).toBeVisible();

   const docs = dialog.getByRole('switch', { name: 'Show Docs in sidebar' });
   const inbox = dialog.getByRole('switch', { name: 'Show Inbox in sidebar' });
   const initiatives = dialog.getByRole('switch', { name: 'Show Initiatives in sidebar' });
   await expect(docs).toHaveAttribute('aria-checked', 'false');
   await expect(inbox).toHaveAttribute('aria-checked', 'true');
   await expect(
      dialog.getByRole('checkbox', { name: 'Show Inbox only when badged' })
   ).toBeChecked();
   await expect(initiatives).toHaveAttribute('aria-checked', 'true');

   await initiatives.focus();
   await page.keyboard.press('Space');
   await expect(initiatives).toHaveAttribute('aria-checked', 'false');
   await docs.click();
   await expect(docs).toHaveAttribute('aria-checked', 'true');
   await page.keyboard.press('Escape');
   await expect(initiativesLink).toHaveCount(0);

   await page.reload();
   await expect(initiativesLink).toHaveCount(0);
   dialog = await openCustomize(page);
   await expect(
      dialog.getByRole('switch', { name: 'Show Initiatives in sidebar' })
   ).toHaveAttribute('aria-checked', 'false');
   await expect(dialog.getByRole('switch', { name: 'Show Docs in sidebar' })).toHaveAttribute(
      'aria-checked',
      'true'
   );
});
