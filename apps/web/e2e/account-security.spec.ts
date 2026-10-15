import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   team_id: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1',
   scope = new URLSearchParams({ workspaceId: fixture.workspace_id }).toString();
test.use({ screenshot: 'only-on-failure' });
test('account security revokes one live device and an owned AI credential with mobile history recovery', async ({
   page,
   context,
   browser,
   browserName,
}) => {
   test.setTimeout(90000);
   page.setDefaultTimeout(10000);
   const errors: string[] = [];
   page.on('pageerror', (error) => errors.push(error.message));
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const secondary = await browser.newContext({ userAgent: 'FlowieSecuritySecondary/1.0 Android' });
   let credential: string | undefined;
   const name = `Account security browser ${Date.now()}`;
   try {
      const signed = await secondary.request.post(`${api}/auth/login`, {
         data: { email: fixture.email, password: fixture.password },
         headers: { 'user-agent': 'FlowieSecuritySecondary/1.0 Android' },
      });
      expect(signed.ok()).toBeTruthy();
      const cookie = (await secondary.cookies()).find((row) => row.name === 'flowie_access')!;
      expect(
         JSON.parse(Buffer.from(cookie.value.split('.')[1], 'base64url').toString()).exp
      ).toBeGreaterThan(Date.now() / 1000 + 60);
      const created = await context.request.post(`${api}/mcp/connections?${scope}`, {
         data: {
            name,
            scopes: ['issues:read'],
            teamIds: [fixture.team_id],
            projectIds: [],
            expiresInDays: 1,
         },
      });
      expect(created.status()).toBe(201);
      credential = (await created.json()).data.id;
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${fixture.slug}/settings/security`);
      const devices = page.getByRole('region', { name: 'Device sessions', exact: true });
      const otherDevice = devices
         .getByRole('listitem')
         .filter({ has: page.getByText('Unknown browser on Android', { exact: true }) })
         .first();
      await otherDevice.getByRole('button', { name: 'Revoke this device', exact: true }).click();
      await devices.getByRole('button', { name: 'Confirm device revocation', exact: true }).click();
      await expect(
         devices.getByRole('status').filter({ hasText: 'Sessions revoked.' })
      ).toBeVisible();
      expect((await secondary.request.get(`${api}/users/me`)).status()).toBe(401);
      expect((await secondary.request.post(`${api}/auth/refresh`)).status()).toBe(401);
      expect((await context.request.get(`${api}/users/me`)).status()).toBe(200);
      await page.getByRole('tab', { name: 'Credentials', exact: true }).click();
      const inventory = page.getByRole('region', { name: 'Credential inventory', exact: true });
      const row = inventory
         .getByRole('listitem')
         .filter({ has: page.getByText(name, { exact: true }) });
      await row.getByRole('button', { name: 'Revoke credential', exact: true }).click();
      await inventory
         .getByRole('button', { name: 'Confirm credential revocation', exact: true })
         .click();
      await expect(inventory.getByText(name, { exact: true })).toHaveCount(0);
      await inventory
         .getByRole('checkbox', { name: 'Include revoked credentials', exact: true })
         .check();
      await expect(row.getByText('Revoked', { exact: true })).toBeVisible();
      for (const button of await inventory.getByRole('button').all()) {
         const box = await button.boundingBox();
         expect(box).not.toBeNull();
         expect(box!.x).toBeGreaterThanOrEqual(0);
         expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      }
      await page.getByRole('tab', { name: 'History', exact: true }).click();
      const history = page.getByRole('region', { name: 'Security history', exact: true });
      await history.getByRole('combobox', { name: 'Security event filter', exact: true }).click();
      await page.getByRole('option', { name: 'Device revocations', exact: true }).click();
      await expect(
         history.getByText('session revoked · BROWSER', { exact: true }).first()
      ).toBeVisible();
      await page.screenshot({
         path: `test-results/account-security-${browserName}.png`,
         animations: 'disabled',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
         390
      );
      await page.getByRole('tab', { name: 'Devices', exact: true }).click();
      let fail = true;
      await page.route('**/account-security/sessions?**', async (route) => {
         if (fail) {
            fail = false;
            await route.fulfill({
               status: 503,
               contentType: 'application/json',
               body: JSON.stringify({ message: 'Synthetic session recovery' }),
            });
         } else await route.continue();
      });
      await devices.getByRole('button', { name: 'Refresh devices', exact: true }).click();
      await expect(
         devices.getByRole('alert').filter({ hasText: 'Synthetic session recovery' })
      ).toBeVisible();
      await devices.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect(devices.getByText('Current device', { exact: true })).toBeVisible();
      expect(errors).toEqual([]);
   } finally {
      if (credential)
         await context.request.post(`${api}/account-security/credentials/MCP/${credential}/revoke`);
      await secondary.close();
   }
});
