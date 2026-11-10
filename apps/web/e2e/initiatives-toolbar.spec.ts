import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
};

// The toolbar buttons are icon-only, so they are found by their Lucide icon class.
// VI: Các nút toolbar chỉ có icon nên được tìm theo class icon Lucide của chúng.
test('initiatives toolbar opens the filter and display options menus', async ({ page }) => {
   const errors: string[] = [];
   page.on('pageerror', (error) => errors.push(error.message));
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   await page.goto(`/${fixture.slug}/initiatives`);
   await page.locator('button:has(svg.lucide-list-filter)').click();
   await expect(page.getByPlaceholder('Add filter...')).toBeVisible();
   await page.getByRole('option', { name: 'Status' }).click();
   await expect(page.getByPlaceholder('Filter...')).toBeVisible();
   await page.keyboard.press('Escape');
   await expect(page.getByPlaceholder('Filter...')).toBeHidden();

   await page.locator('button:has(svg.lucide-sliders-horizontal)').click();
   await expect(page.getByText('Display properties')).toBeVisible();
   await expect(page.getByRole('button', { name: 'Target date' })).toBeVisible();
   expect(errors).toEqual([]);
});
