import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';

test('bulk changes preview without mutation, execute and resume after reload', async ({
   page,
   context,
}) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const query = new URLSearchParams({ workspaceId: fixture.workspace_id, limit: '100' });
   const before = (await (await context.request.get(`${api}/issues?${query}`)).json()).data as {
      id: string;
      priority: string;
   }[];
   expect(before.length).toBeGreaterThan(0);
   try {
      await page.goto(`/${fixture.slug}/team/GEN/all`);
      await page.getByRole('button', { name: 'Bulk changes', exact: true }).click();
      await page.getByRole('combobox', { name: 'Selection scope', exact: true }).click();
      await page.getByRole('option', { name: 'All matching filtered issues', exact: true }).click();
      await page
         .getByRole('checkbox', { name: 'Include all matching issues, including unloaded pages' })
         .check();
      await page.getByRole('combobox', { name: 'New value', exact: true }).click();
      await page.getByRole('option', { name: 'URGENT', exact: true }).click();
      await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
      await expect(
         page.getByRole('button', { name: 'Apply previewed changes', exact: true })
      ).toBeVisible();
      const unchanged = (await (await context.request.get(`${api}/issues?${query}`)).json())
         .data as { id: string; priority: string }[];
      expect(unchanged.map(({ id, priority }) => ({ id, priority }))).toEqual(
         before.map(({ id, priority }) => ({ id, priority }))
      );
      await page.getByRole('button', { name: 'Apply previewed changes', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'DONE' })).toBeVisible({
         timeout: 20000,
      });
      const changed = (await (await context.request.get(`${api}/issues?${query}`)).json()).data as {
         priority: string;
      }[];
      expect(changed.every((row) => row.priority === 'URGENT')).toBeTruthy();
      await page.reload();
      await page.getByRole('button', { name: 'Bulk changes', exact: true }).click();
      await page.getByRole('combobox', { name: 'Recent operations', exact: true }).click();
      await page.getByRole('option').filter({ hasText: 'DONE' }).first().click();
      await expect(page.getByRole('status').filter({ hasText: 'DONE' })).toBeVisible();
   } finally {
      for (const row of before) {
         const restored = await context.request.patch(
            `${api}/issues/${row.id}?workspaceId=${fixture.workspace_id}`,
            { data: { priority: row.priority } }
         );
         expect(restored.ok()).toBeTruthy();
      }
   }
});
