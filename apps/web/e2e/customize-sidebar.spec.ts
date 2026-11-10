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

// Every row is one fixed-height line, including Inbox with its "Only when badged" checkbox, and a
// keyboard reorder (Space, arrows, Space on the grip) is saved: the modal and the sidebar show the
// new order, and both keep it after a reload.
// VI: Mọi dòng là một hàng cao cố định, kể cả Inbox có checkbox "Only when badged", và đổi thứ tự
// VI: bằng bàn phím (Space, mũi tên, Space trên grip) được lưu: modal và sidebar hiển thị thứ tự
// VI: mới và vẫn giữ sau khi tải lại.
test('customize sidebar rows share one height and reorder from the keyboard', async ({ page }) => {
   await signIn(page);
   await page.goto(`/${fixture.slug}/issues`);

   let dialog = await openCustomize(page);
   const rows = dialog.locator('[data-sidebar-pref-row]');
   await expect(rows).toHaveCount(15);
   await expect(
      dialog.getByRole('checkbox', { name: 'Show Inbox only when badged' })
   ).toBeVisible();
   const heights = await rows.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height)
   );
   expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);

   const personalKeys = () =>
      rows.evaluateAll((elements) =>
         elements.map((element) => element.getAttribute('data-sidebar-pref-row')).slice(0, 6)
      );
   expect(await personalKeys()).toEqual([
      'inbox',
      'reviews',
      'approvals',
      'service-desk',
      'my-issues',
      'agent',
   ]);

   await dialog.getByRole('button', { name: 'Reorder Agent' }).focus();
   await page.keyboard.press('Space');
   for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowUp');
   await page.keyboard.press('Space');
   await expect
      .poll(personalKeys)
      .toEqual(['agent', 'inbox', 'reviews', 'approvals', 'service-desk', 'my-issues']);
   await page.keyboard.press('Escape');
   await expect(dialog).toHaveCount(0);

   const agentAboveMyIssues = async () => {
      const agent = await page.getByRole('link', { name: 'Agent', exact: true }).boundingBox();
      const myIssues = await page
         .getByRole('link', { name: 'My issues', exact: true })
         .boundingBox();
      return Boolean(agent && myIssues && agent.y < myIssues.y);
   };
   await expect.poll(agentAboveMyIssues).toBe(true);

   await page.reload();
   await expect.poll(agentAboveMyIssues).toBe(true);
   dialog = await openCustomize(page);
   await expect
      .poll(personalKeys)
      .toEqual(['agent', 'inbox', 'reviews', 'approvals', 'service-desk', 'my-issues']);
});
