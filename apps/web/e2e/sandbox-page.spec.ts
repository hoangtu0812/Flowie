import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
};

// The fixture API has no sandbox-manager, so these tests answer /sandbox themselves and check
// only the page: the sidebar entry, start, the embedded terminal and stop.
// VI: API fixture không có sandbox-manager, nên các test này tự trả lời /sandbox và chỉ kiểm
// VI: tra trang: mục sidebar, khởi động, terminal nhúng và dừng.
async function signIn(page: Page) {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
}

test('The Sandbox page starts the sandbox, shows its terminal and stops it', async ({ page }) => {
   let state = 'none';
   await page.route('**/api/v1/sandbox', (route) => {
      if (route.request().method() === 'PUT') state = 'running';
      return route.fulfill({ json: { data: { state } } });
   });
   await page.route('**/api/v1/sandbox/stop', (route) => {
      state = 'exited';
      return route.fulfill({ json: { data: { state } } });
   });
   await page.route('**/api/v1/sandbox/ui/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>termi is here</p>' })
   );
   await signIn(page);

   await page.getByRole('link', { name: 'Sandbox' }).click();
   await page.getByRole('button', { name: 'Start sandbox' }).click();
   await expect(page.getByTestId('sandbox-state')).toHaveText('Running');
   await expect(
      page.frameLocator('iframe[title="Sandbox terminal"]').getByText('termi is here')
   ).toBeVisible();

   await page.getByRole('button', { name: 'Stop' }).click();
   await expect(page.getByTestId('sandbox-state')).toHaveText('Stopped');
   await expect(page.locator('iframe[title="Sandbox terminal"]')).toHaveCount(0);
});

test('People without sandbox access see no Sandbox entry', async ({ page }) => {
   await page.route('**/api/v1/sandbox', (route) =>
      route.fulfill({ status: 403, json: { message: 'Sandbox is not enabled for this account.' } })
   );
   await signIn(page);
   await expect(page.getByRole('link', { name: 'Inbox' })).toBeVisible();
   await expect(page.getByRole('link', { name: 'Sandbox' })).toHaveCount(0);

   await page.goto(`/${fixture.slug}/sandbox`);
   await expect(page.getByText('Sandbox is not enabled for your account.')).toBeVisible();
});
