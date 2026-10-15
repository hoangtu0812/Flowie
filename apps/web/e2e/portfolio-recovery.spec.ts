import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   email: string;
   password: string;
   projectId: string;
};
const api = 'http://localhost:4000/api/v1';
test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
});

test('project list recovers and loads a real second cursor page', async ({ page, context }) => {
   const response = await context.request.post(`${api}/projects`, {
      data: {
         workspaceId: fixture.workspace_id,
         name: 'Portfolio paging regression',
         identifier: `PAGE${Date.now()}`,
      },
   });
   expect(response.ok()).toBeTruthy();
   const project = (await response.json()).data;
   let fail = true;
   await page.route('**/api/v1/projects?*', async (route) => {
      if (fail)
         return route.fulfill({
            status: 503,
            json: { message: 'Synthetic temporary portfolio outage' },
         });
      const url = new URL(route.request().url());
      url.searchParams.set('limit', '1');
      await route.continue({ url: url.toString() });
   });
   try {
      await page.goto(`/${fixture.slug}/projects`);
      await expect(
         page.getByRole('heading', { name: 'Could not load projects', exact: true })
      ).toBeVisible();
      fail = false;
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect(page.getByText(/Loaded projects: 1 of/)).toBeVisible();
      await page.getByRole('button', { name: 'Load more projects', exact: true }).click();
      await expect(page.getByText(/Loaded projects: 2 of/)).toBeVisible();
   } finally {
      await context.request.delete(
         `${api}/projects/${project.id}?workspaceId=${fixture.workspace_id}`
      );
   }
});

test('project detail exposes recovery when its API fails', async ({ page }) => {
   let fail = true;
   await page.route(`**/api/v1/projects/${fixture.projectId}?*`, async (route) => {
      if (fail)
         return route.fulfill({ status: 503, json: { message: 'Synthetic project outage' } });
      await route.continue();
   });
   await page.goto(`/${fixture.slug}/project/${fixture.projectId}/overview`);
   await expect(
      page.getByRole('heading', { name: 'Could not load project', exact: true })
   ).toBeVisible();
   fail = false;
   await page.getByRole('button', { name: 'Try again', exact: true }).click();
   await expect(
      page.getByRole('heading', { name: 'Could not load project', exact: true })
   ).not.toBeVisible();
   await expect(page.getByText('Regression project', { exact: true }).first()).toBeVisible();
});

test('initiative detail separates temporary failure from a missing initiative and retries', async ({
   page,
   context,
}) => {
   const response = await context.request.post(`${api}/initiatives`, {
      data: { workspaceId: fixture.workspace_id, name: 'Recoverable initiative regression' },
   });
   expect(response.ok()).toBeTruthy();
   const initiative = (await response.json()).data;
   for (const body of ['History regression first', 'History regression second']) {
      const update = await context.request.post(`${api}/initiatives/${initiative.id}/updates`, {
         data: { workspaceId: fixture.workspace_id, body },
      });
      expect(update.ok()).toBeTruthy();
   }
   let fail = true;
   await page.route(`**/api/v1/initiatives/${initiative.id}?*`, async (route) => {
      if (fail)
         return route.fulfill({ status: 503, json: { message: 'Synthetic initiative outage' } });
      await route.continue();
   });
   try {
      await page.goto(`/${fixture.slug}/initiative/${initiative.id}`);
      await expect(
         page.getByRole('heading', { name: 'Could not load initiative', exact: true })
      ).toBeVisible();
      fail = false;
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect(
         page.getByRole('heading', { name: 'Could not load initiative', exact: true })
      ).not.toBeVisible();
      await expect(page.getByText(initiative.name, { exact: true }).first()).toBeVisible();
      await page.route(`**/api/v1/initiatives/${initiative.id}/updates?*`, async (route) => {
         const url = new URL(route.request().url());
         url.searchParams.set('limit', '1');
         await route.continue({ url: url.toString() });
      });
      await page.goto(`/${fixture.slug}/initiative/${initiative.id}?tab=activity`);
      await expect(page.getByText('1 of 2 history events loaded', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Load more history events', exact: true }).click();
      await expect(page.getByText('2 of 2 history events loaded', { exact: true })).toBeVisible();
      await expect(page.getByText('History regression first', { exact: true })).toBeVisible();
      await expect(page.getByText('History regression second', { exact: true })).toBeVisible();
   } finally {
      await context.request.delete(
         `${api}/initiatives/${initiative.id}?workspaceId=${fixture.workspace_id}`
      );
   }
});
