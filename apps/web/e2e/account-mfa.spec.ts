import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   email: string;
   password: string;
   slug: string;
};
const api = 'http://localhost:4000/api/v1';
function code(secret: string) {
   const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
   const bits = [...secret]
      .map((value) => alphabet.indexOf(value).toString(2).padStart(5, '0'))
      .join('');
   const key = Buffer.from(bits.match(/.{8}/g)!.map((value) => parseInt(value, 2)));
   const counter = Buffer.alloc(8);
   counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
   const hash = createHmac('sha1', key).update(counter).digest(),
      offset = hash[19] & 15;
   return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
test('authenticator enrollment, challenge replay rejection, recovery sign-in and disable work on mobile', async ({
   page,
   browser,
   browserName,
}) => {
   test.setTimeout(90000);
   const errors: string[] = [];
   page.on('pageerror', (value) => errors.push(value.message));
   let codes: string[] = [],
      enabled = false;
   try {
      await page.goto('/auth/login');
      await page.getByLabel('Email', { exact: true }).fill(fixture.email);
      await page.getByLabel('Password', { exact: true }).fill(fixture.password);
      const firstWorkspace = page.waitForResponse(
         (response) => response.url().startsWith(`${api}/teams?`) && response.ok()
      );
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
      await firstWorkspace;
      await page.waitForLoadState('networkidle');
      await page.goto(`/${fixture.slug}/settings/security`);
      await page.getByRole('tab', { name: 'Authenticator', exact: true }).click();
      const panel = page.getByRole('region', { name: 'Authenticator settings', exact: true });
      await panel
         .getByRole('textbox', { name: 'Confirm account password', exact: true })
         .fill(fixture.password);
      await panel.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
      const secret = await panel
         .getByRole('textbox', { name: 'Authenticator setup key', exact: true })
         .inputValue();
      const used = code(secret);
      await panel
         .getByRole('textbox', { name: 'Authenticator verification code', exact: true })
         .fill(used);
      const responsePromise = page.waitForResponse((response) =>
         response.url().endsWith('/account-security/mfa/enable')
      );
      await panel.getByRole('button', { name: 'Enable authenticator', exact: true }).click();
      const response = await responsePromise;
      expect(response.ok()).toBeTruthy();
      enabled = true;
      codes = (await response.json()).data.recoveryCodes;
      expect(codes).toHaveLength(10);
      await expect(panel.getByText('Authenticator enabled', { exact: true })).toBeVisible();
      await expect(panel.getByLabel('Recovery codes', { exact: true })).toHaveText(
         codes.join('\n')
      );
      await page.setViewportSize({ width: 390, height: 844 });
      for (const button of await panel.getByRole('button').all()) {
         const box = await button.boundingBox();
         expect(box).not.toBeNull();
         expect(box!.x).toBeGreaterThanOrEqual(0);
         expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      }
      await page.screenshot({
         path: `test-results/account-mfa-${browserName}.png`,
         animations: 'disabled',
      });
      await panel.getByRole('button', { name: 'I saved these codes', exact: true }).click();
      await expect(panel.getByLabel('Recovery codes', { exact: true })).toHaveCount(0);
      await page.waitForLoadState('networkidle');
      await page.goto('/auth/login');
      await page.getByLabel('Email', { exact: true }).fill(fixture.email);
      await page.getByLabel('Password', { exact: true }).fill(fixture.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(/\/auth\/mfa$/);
      expect((await page.context().request.get(`${api}/users/me`)).status()).toBe(401);
      await page.getByRole('textbox', { name: /Verification code/ }).fill(used);
      await page.getByRole('button', { name: 'Verify sign-in', exact: true }).click();
      await expect(
         page.getByRole('alert').filter({ hasText: 'Verification failed' })
      ).toBeVisible();
      await page.getByRole('combobox', { name: 'Verification method', exact: true }).click();
      await page.getByRole('option', { name: 'Recovery code', exact: true }).click();
      await page.getByRole('textbox', { name: /Verification code/ }).fill(codes[0]);
      const verifiedWorkspace = page.waitForResponse(
         (response) => response.url().startsWith(`${api}/teams?`) && response.ok()
      );
      await page.getByRole('button', { name: 'Verify sign-in', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
      await verifiedWorkspace;
      await page.waitForLoadState('networkidle');
      await page.goto(`/${fixture.slug}/settings/security`);
      await page.getByRole('tab', { name: 'Authenticator', exact: true }).click();
      await expect(panel.getByText('9 recovery codes remain.', { exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Disable authenticator', exact: true }).click();
      await panel
         .getByRole('textbox', { name: 'Confirm account password', exact: true })
         .fill(fixture.password);
      await panel.getByRole('combobox', { name: 'Verification method', exact: true }).click();
      await page.getByRole('option', { name: 'Recovery code', exact: true }).click();
      await panel.getByRole('textbox', { name: 'Verification code', exact: true }).fill(codes[1]);
      await panel.getByRole('button', { name: 'Confirm security change', exact: true }).click();
      await expect(panel.getByText('Authenticator off', { exact: true })).toBeVisible();
      await expect(panel.getByLabel('Recovery codes', { exact: true })).toHaveCount(0);
      enabled = false;
      expect(errors).toEqual([]);
   } finally {
      if (enabled && codes.length === 10) {
         const cleanup = await browser.newContext();
         try {
            await cleanup.request.post(`${api}/auth/login`, {
               data: { email: fixture.email, password: fixture.password },
            });
            const signed = await cleanup.request.post(`${api}/auth/mfa/verify`, {
               data: { code: codes[8], kind: 'RECOVERY' },
            });
            expect(signed.ok()).toBeTruthy();
            const disabled = await cleanup.request.post(`${api}/account-security/mfa/disable`, {
               data: { password: fixture.password, code: codes[9], kind: 'RECOVERY' },
            });
            expect(disabled.ok()).toBeTruthy();
         } finally {
            await cleanup.close();
         }
      }
   }
});
