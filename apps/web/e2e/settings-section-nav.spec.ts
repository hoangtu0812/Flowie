import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
};

// Settings pages list their sections in an "On this page" navigation: on a wide screen it is a
// rail beside the content, clicking an entry scrolls to the section and puts it in the URL hash,
// and opening that URL lands on the section; on a phone it is a sticky bar that does not widen
// the page.
// VI: Trang cài đặt liệt kê section trong mục lục "On this page": màn hình rộng là cột bên cạnh
// VI: nội dung, bấm một mục thì cuộn tới section và đưa nó vào hash của URL, mở URL đó thì tới
// VI: thẳng section; trên điện thoại là thanh dính không làm trang rộng ra.
test('Settings pages navigate to their sections from "On this page"', async ({ page }) => {
   await page.setViewportSize({ width: 1440, height: 900 });
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   await page.goto(`/${fixture.slug}/settings/integrations`);
   const heading = page.getByRole('heading', { name: 'Agent instructions' });
   await expect(heading).toBeAttached();
   const nav = page.getByRole('navigation', { name: 'On this page' });
   await expect(nav).toBeVisible();
   for (const name of ['Discord', 'SharePoint', 'AI connections (MCP)', 'Connections']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
   }
   await expect(heading).not.toBeInViewport();

   const entry = nav.getByRole('link', { name: 'Agent instructions', exact: true });
   await entry.click();
   await expect(heading).toBeInViewport();
   await expect(page).toHaveURL(/#agent-instructions$/);
   await expect(entry).toHaveAttribute('aria-current', 'location');

   await page.reload();
   await expect(page.getByRole('heading', { name: 'Agent instructions' })).toBeInViewport();

   await page.setViewportSize({ width: 390, height: 844 });
   await page.goto(`/${fixture.slug}/settings/integrations`);
   await expect(page.getByRole('heading', { name: 'Agent instructions' })).toBeAttached();
   await expect(page.getByRole('navigation', { name: 'On this page' })).toBeVisible();
   expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
   ).toBeTruthy();
});
