import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';

test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   const ready = page.waitForResponse(
      (response) => response.url().startsWith(`${api}/teams?`) && response.ok()
   );
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await ready;
   await page.waitForLoadState('networkidle');
});

test('initiative Activity composes updates, keeps failed drafts and refreshes Overview without resetting the form', async ({
   page,
   context,
   browserName,
}) => {
   const errors: string[] = [];
   page.on('pageerror', (error) => errors.push(error.message));
   const created = await context.request.post(`${api}/initiatives`, {
      data: { workspaceId: fixture.workspace_id, name: 'Activity regression initiative' },
   });
   expect(created.ok()).toBeTruthy();
   const id = (await created.json()).data.id as string;
   const body = 'Progress update: **release checks** completed.\nNext: review the remaining risks.';
   let posts = 0,
      reads = 0;
   try {
      await page.route(`**/api/v1/initiatives/${id}/updates**`, async (route) => {
         if (route.request().method() === 'POST') {
            posts++;
            if (posts === 1) {
               await route.fulfill({ status: 503, json: { message: 'Temporary update failure' } });
               return;
            }
         } else if (++reads === 1) {
            await route.fulfill({ status: 503, json: { message: 'Temporary history failure' } });
            return;
         }
         await route.continue();
      });
      await page.goto(`/${fixture.slug}/initiative/${id}?tab=activity`);
      const composer = page.getByRole('form', { name: 'Initiative update', exact: true });
      await expect(composer).toBeVisible();
      await expect(
         page.getByRole('alert').filter({ hasText: 'Temporary history failure' })
      ).toContainText('Temporary history failure');
      await expect(page.getByRole('heading', { name: 'No updates yet', exact: true })).toHaveCount(
         0
      );
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect(
         page.getByRole('heading', { name: 'No updates yet', exact: true })
      ).toBeVisible();
      await expect(
         composer.getByRole('button', { name: 'Post update', exact: true })
      ).toBeDisabled();
      const bounds = await composer.boundingBox();
      expect(bounds!.width).toBeLessThan(800);
      await page.getByRole('button', { name: 'Update health', exact: true }).click();
      await page.getByRole('menuitem', { name: 'At risk', exact: true }).click();
      const input = page.getByRole('textbox', { name: 'Initiative update text', exact: true });
      await input.fill(body);
      await page.getByRole('button', { name: 'Post update', exact: true }).click();
      await expect(composer.getByRole('alert')).toContainText('Temporary update failure');
      await expect(input).toHaveValue(body);
      await input.press('Control+Enter');
      await expect(composer.getByRole('status')).toHaveText('Update posted');
      await expect(input).toHaveValue('');
      await expect(page.getByRole('article')).toHaveCount(1);
      await expect(page.getByRole('article').getByText('At risk', { exact: true })).toBeVisible();
      await expect(page.getByRole('article').locator('strong')).toHaveText('release checks');
      expect(posts).toBe(2);
      await page.screenshot({
         path: `test-results/initiative-activity-${browserName}.png`,
         fullPage: true,
         animations: 'disabled',
      });
      await input.fill('Draft kept while browsing history');
      await page.getByRole('button', { name: 'Change history', exact: true }).click();
      await expect(
         page.getByRole('article').getByText('Posted an update', { exact: true })
      ).toBeVisible();
      await expect(input).toHaveValue('Draft kept while browsing history');
      await page.getByRole('button', { name: 'Updates', exact: true }).click();
      await expect(page.getByRole('article')).toHaveCount(1);
      await input.fill('');
      await page.getByRole('button', { name: 'overview', exact: true }).click();
      await expect(page.getByText(body, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'See all', exact: true }).click();
      await page.waitForLoadState('networkidle');
      await page.reload();
      await expect(page.getByRole('article')).toHaveCount(1);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(composer).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
         390
      );
      await page.screenshot({
         path: `test-results/initiative-activity-mobile-${browserName}.png`,
         fullPage: true,
         animations: 'disabled',
      });
      expect(errors).toEqual([]);
   } finally {
      await context.request.delete(`${api}/initiatives/${id}?workspaceId=${fixture.workspace_id}`);
   }
});

test('initiative history keeps real cursor pagination and readonly membership hides the composer', async ({
   page,
   context,
}) => {
   const created = await context.request.post(`${api}/initiatives`, {
      data: { workspaceId: fixture.workspace_id, name: 'Paged initiative activity' },
   });
   expect(created.ok()).toBeTruthy();
   const id = (await created.json()).data.id as string;
   try {
      for (const body of ['Earlier recorded update', 'Latest recorded update']) {
         expect(
            (
               await context.request.post(`${api}/initiatives/${id}/updates`, {
                  data: { workspaceId: fixture.workspace_id, body, health: 'on-track' },
               })
            ).ok()
         ).toBeTruthy();
      }
      await page.route(`**/api/v1/initiatives/${id}/updates?**`, async (route) => {
         const url = new URL(route.request().url());
         url.searchParams.set('limit', '1');
         await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
      });
      await page.goto(`/${fixture.slug}/initiative/${id}?tab=activity`);
      await expect(page.getByRole('article')).toHaveCount(1);
      await expect(page.getByRole('article')).toContainText('Latest recorded update');
      await expect(page.getByText('1 of 2 loaded', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Load more', exact: true }).click();
      await expect(page.getByRole('article')).toHaveCount(2);
      await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);
      await page.route('**/api/v1/workspaces/me', async (route) => {
         const response = await route.fetch();
         const payload = await response.json();
         payload.data = payload.data.map(
            (membership: { role: string; workspace: { id: string } }) =>
               membership.workspace.id === fixture.workspace_id
                  ? { ...membership, role: 'MEMBER' }
                  : membership
         );
         await route.fulfill({ response, json: payload });
      });
      await page.waitForLoadState('networkidle');
      await page.reload();
      await expect(page.getByRole('article')).toHaveCount(1);
      await expect(page.getByRole('form', { name: 'Initiative update', exact: true })).toHaveCount(
         0
      );
      await page.getByRole('button', { name: 'Change history', exact: true }).click();
      await expect(page).toHaveURL(/history=activity/);
      await expect(page.getByRole('article').filter({ hasText: 'Posted an update' })).toHaveCount(
         2
      );
      await page.waitForLoadState('networkidle');
      await page.reload();
      await expect(
         page.getByRole('button', { name: 'Change history', exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('form', { name: 'Initiative update', exact: true })).toHaveCount(
         0
      );
   } finally {
      await context.request.delete(`${api}/initiatives/${id}?workspaceId=${fixture.workspace_id}`);
   }
});
