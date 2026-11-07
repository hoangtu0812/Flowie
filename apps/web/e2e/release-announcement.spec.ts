import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   userId: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1',
   endpoint = `${api}/users/me/ui-preferences`;
const semver = /^\d+\.\d+\.\d+$/;

test('a new release announces itself once per account and stays closed afterwards', async ({
   page,
   context,
}) => {
   test.setTimeout(90000);
   const errors: string[] = [];
   page.on('pageerror', (value) => errors.push(value.message));
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const read = async () => (await (await context.request.get(endpoint)).json()).data;
   const announcement = page.getByRole('dialog', { name: "What's new in Flowie" });
   const original = await read();
   // Writes the version this account has supposedly seen. The open page records
   // the running version by itself, so a write of ours can lose the optimistic
   // version race; retrying on 409 keeps the fixture deterministic. Locale is
   // pinned because the accessible names below are the English ones.
   const record = async (version: string | null) => {
      await expect
         .poll(
            async () => {
               const current = await read();
               const response = await context.request.put(endpoint, {
                  data: {
                     accountId: fixture.userId,
                     expectedVersion: current.version,
                     values: { ...current.values, locale: 'en', lastSeenReleaseVersion: version },
                  },
               });
               return response.status();
            },
            { timeout: 20000 }
         )
         .toBe(200);
   };
   try {
      // An account that has never been told about a release is not interrupted:
      // the running version is recorded silently and no dialog opens.
      await record(null);
      await page.goto(`/${fixture.slug}/dashboard`);
      await page.waitForLoadState('networkidle');
      await expect
         .poll(async () => (await read()).values.lastSeenReleaseVersion, { timeout: 20000 })
         .toMatch(semver);
      await expect(announcement).toHaveCount(0);
      const running = (await read()).values.lastSeenReleaseVersion as string;

      // An account that last saw an older release is told about this one, once.
      await record('0.0.1');
      await page.goto(`/${fixture.slug}/dashboard`);
      await expect(announcement).toBeVisible();
      await expect(announcement).toContainText(`Flowie v${running}`);
      await announcement.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(announcement).toHaveCount(0);
      await expect
         .poll(async () => (await read()).values.lastSeenReleaseVersion, { timeout: 20000 })
         .toBe(running);

      // Closing it is remembered on the account, not in this page's state.
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(announcement).toHaveCount(0);

      // The same notes stay reachable on demand from Help & feedback.
      await page.getByRole('button', { name: 'Help and keyboard shortcuts', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Read release notes', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Flowie help' })).toContainText(
         `Flowie v${running}`
      );
      expect(errors).toEqual([]);
   } finally {
      const current = await read();
      await context.request.put(endpoint, {
         data: {
            accountId: fixture.userId,
            expectedVersion: current.version,
            values: original.values,
         },
      });
   }
});
