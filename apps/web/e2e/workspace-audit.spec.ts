import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';

test('audit filters, recovery and scoped CSV download use real events', async ({
   page,
   context,
}) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const created = await context.request.post(`${api}/documents`, {
      data: {
         workspaceId: fixture.workspace_id,
         title: `Audit export ${Date.now()}`,
         content: 'Private body must not be exported',
      },
   });
   expect(created.ok()).toBeTruthy();
   const document = (await created.json()).data;
   let fail = true;
   await page.route('**/api/v1/audit?*', async (route) => {
      if (fail) return route.fulfill({ status: 503, json: { message: 'Synthetic audit outage' } });
      const url = new URL(route.request().url());
      url.searchParams.set('limit', '1');
      await route.continue({ url: url.toString() });
   });
   try {
      expect(
         (
            await context.request.delete(
               `${api}/documents/${document.id}?workspaceId=${fixture.workspace_id}`
            )
         ).ok()
      ).toBeTruthy();
      await page.goto(`/${fixture.slug}/settings/audit`);
      await expect(
         page.getByRole('alert').filter({ hasText: 'Synthetic audit outage' })
      ).toBeVisible();
      fail = false;
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.getByRole('combobox', { name: 'Audit entity', exact: true }).click();
      await page.getByRole('option', { name: 'document', exact: true }).click();
      await page.getByRole('button', { name: 'Apply audit filters', exact: true }).click();
      await expect(page.getByText(/1 of \d+ audit events loaded/)).toBeVisible();
      await page.getByRole('button', { name: 'Load more audit events', exact: true }).click();
      await expect(page.getByText(/2 of \d+ audit events loaded/)).toBeVisible();
      const [download] = await Promise.all([
         page.waitForEvent('download'),
         page.getByRole('button', { name: 'Export filtered audit CSV', exact: true }).click(),
      ]);
      expect(download.suggestedFilename()).toBe('flowie-audit.csv');
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      const csv = Buffer.concat(chunks).toString('utf8');
      expect(csv).toContain(document.id);
      expect(csv).not.toContain('Private body must not be exported');
      await page.getByLabel('From date (UTC)', { exact: true }).fill('2026-02-30');
      await page.getByRole('button', { name: 'Apply audit filters', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Use valid dates' })).toBeVisible();
   } finally {
      await context.request.delete(
         `${api}/documents/${document.id}?workspaceId=${fixture.workspace_id}`
      );
   }
});
