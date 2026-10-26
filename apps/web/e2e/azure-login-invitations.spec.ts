import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';

test('Azure-only sign-in hides local entry points and recovers provider discovery errors', async ({
   page,
}) => {
   let fail = true;
   await page.route('**/auth/providers', (route) =>
      route.fulfill({
         status: fail ? 503 : 200,
         json: { data: { microsoft: { enabled: true }, password: { enabled: false } } },
      })
   );
   await page.goto('/auth/login?next=%2Fsome-workspace%2Fmembers');
   await expect(
      page.getByRole('alert').filter({ hasText: 'Could not load sign-in options' })
   ).toBeVisible();
   await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
   fail = false;
   await page.getByRole('button', { name: 'Retry', exact: true }).click();
   const microsoft = page.getByRole('link', { name: 'Sign in with Microsoft' });
   await expect(microsoft).toBeVisible();
   await expect(microsoft).toHaveAttribute('href', /next=%2Fsome-workspace%2Fmembers/);
   await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
   await expect(page.getByRole('link', { name: 'Create account' })).toHaveCount(0);
   await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveCount(0);
   for (const path of [
      '/auth/register',
      '/auth/forgot-password',
      '/auth/reset-password?token=example',
   ]) {
      await page.goto(path);
      await expect(
         page.getByText('Your organization uses Microsoft sign-in.', { exact: false })
      ).toBeVisible();
      await expect(page.locator('input[type="password"], input[type="email"]')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Sign in with Microsoft' })).toBeVisible();
   }
});

test('member invitation offers searchable existing users with retry and keyboard selection', async ({
   page,
   context,
}, testInfo) => {
   const errors: string[] = [];
   page.on('pageerror', (error) => errors.push(error.message));
   const signed = await context.request.post(`${api}/auth/login`, {
      data: { email: fixture.email, password: fixture.password },
   });
   expect(signed.ok()).toBeTruthy();
   let fail = false;
   const queries: string[] = [];
   const people = [
      { id: 'directory-alice', name: 'Alice Nguyen', email: 'alice@example.test' },
      { id: 'directory-phuc', name: 'Phuc Pham', email: 'phucph@example.test' },
   ];
   await page.route('**/invitation-candidates?*', async (route) => {
      const query = new URL(route.request().url()).searchParams.get('q') ?? '';
      queries.push(query);
      await route.fulfill({
         status: fail ? 503 : 200,
         json: {
            data: people.filter((user) =>
               `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())
            ),
            meta: { hasMore: false },
         },
      });
   });
   let invitation: { email: string; role: string } | undefined;
   await page.route(`**/workspaces/${fixture.workspace_id}/invitations`, async (route) => {
      invitation = route.request().postDataJSON();
      await route.fulfill({ status: 200, json: { data: {} } });
   });
   await page.goto(`/${fixture.slug}/members`);
   await page.getByRole('button', { name: 'Invite', exact: true }).click();
   const dialog = page.getByRole('dialog', { name: 'Invite member' });
   const input = dialog.getByRole('combobox', { name: 'Person' });
   await expect(input).toBeVisible();
   await input.focus();
   await expect(page.getByRole('option', { name: /Alice Nguyen/ })).toBeVisible();
   await expect(page.getByRole('option', { name: /Phuc Pham/ })).toContainText(
      'phucph@example.test'
   );
   await page.screenshot({ path: testInfo.outputPath('invitation-desktop.png') });
   await page.setViewportSize({ width: 390, height: 844 });
   await expect(page.getByRole('option', { name: /Phuc Pham/ })).toBeVisible();
   await page.screenshot({ path: testInfo.outputPath('invitation-mobile.png') });
   await expect(dialog.getByRole('button', { name: 'Invite', exact: true })).toBeDisabled();
   await input.fill('nobody');
   await expect(
      page.getByRole('listbox').getByText('No matching users available to invite.')
   ).toBeVisible();
   fail = true;
   await input.fill('phuc');
   await expect(dialog.getByRole('alert')).toContainText('Could not load users');
   fail = false;
   await dialog.getByRole('button', { name: 'Retry user search' }).click();
   await input.fill('phucph@');
   await expect(page.getByRole('option', { name: /Phuc Pham/ })).toBeVisible();
   await input.press('Enter');
   await expect(dialog.getByRole('button', { name: 'Invite', exact: true })).toBeEnabled();
   await expect(dialog.getByText('phucph@example.test', { exact: true })).toBeVisible();
   await dialog.getByRole('button', { name: 'Invite', exact: true }).click();
   await expect(dialog).toBeHidden();
   expect(invitation).toEqual({ email: 'phucph@example.test', role: 'MEMBER' });
   expect(queries).toContain('');
   expect(queries).toContain('phucph@');
   expect(errors).toEqual([]);
});
