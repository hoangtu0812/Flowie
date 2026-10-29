import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   issues: { id: string; identifier: string; title: string }[];
};

test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
});

// The sidebar search button opens the command palette, which finds a settings page and a loaded
// issue by typed text and opens each of them.
// VI: Nút tìm kiếm ở sidebar mở command palette; palette tìm được trang settings và issue đã tải
// VI: theo chữ đã gõ và mở từng mục.
test('the sidebar search opens the palette for settings pages and issues', async ({ page }) => {
   const issue = fixture.issues[0];
   await page.goto(`/${fixture.slug}/my-issues`);
   await expect(page.getByRole('link', { name: issue.title, exact: true })).toBeVisible();

   await page.getByRole('button', { name: /^Search…/ }).click();
   const palette = page.getByRole('dialog', { name: 'Command menu' });
   await palette.getByRole('combobox').fill('labels');
   await palette
      .getByRole('option')
      .filter({ hasText: /Issues ·\s*Labels/ })
      .click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/settings/issue-labels$`));

   await page.goto(`/${fixture.slug}/my-issues`);
   await expect(page.getByRole('link', { name: issue.title, exact: true })).toBeVisible();
   await page.getByRole('button', { name: /^Search…/ }).click();
   await palette.getByRole('combobox').fill(issue.identifier);
   await palette.getByRole('option').filter({ hasText: issue.title }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/issue/${issue.identifier}$`));
});
