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

test('operations separates liveness, readiness and scoped browser error reports', async ({
   page,
   context,
}) => {
   const live = await context.request.get('http://localhost:4000/livez');
   expect(live.ok()).toBeTruthy();
   const rejected = await context.request.post(`${api}/operations/client-errors`, {
      data: {
         workspaceId: fixture.workspace_id,
         category: 'render',
         routeKind: 'view',
         message: 'Must never persist a free-form payload',
      },
   });
   expect(rejected.status()).toBe(400);
   const report = await context.request.post(`${api}/operations/client-errors`, {
      data: {
         workspaceId: fixture.workspace_id,
         category: 'render',
         routeKind: 'view',
         digest: 'synthetic-error',
      },
   });
   expect(report.ok()).toBeTruthy();
   expect((await report.json()).data.reference).toBeTruthy();
   await page.goto(`/${fixture.slug}/settings/operations`);
   await expect(page.getByRole('heading', { name: 'Operations', exact: true })).toBeVisible();
   await expect(page.getByRole('heading', { name: 'Delivery queues' })).toBeVisible();
   await expect(page.getByText('render · view', { exact: true })).toBeVisible();
});

for (const entityType of ['issue', 'project'])
   test(`saved ${entityType} view opens directly and survives reload`, async ({
      page,
      context,
   }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await context.request.post(`${api}/views`, {
         data: {
            workspaceId: fixture.workspace_id,
            name: `Saved regression ${entityType}`,
            entityType,
            filters: {},
         },
      });
      expect(response.ok()).toBeTruthy();
      const id = (await response.json()).data.id;
      try {
         await page.goto(`/${fixture.slug}/view/${id}`);
         await expect(
            page.getByText(`Saved regression ${entityType}`, { exact: true })
         ).toBeVisible();
         if (entityType === 'issue') {
            const result = await context.request.get(
               `${api}/issues?workspaceId=${fixture.workspace_id}`
            );
            const payload = await result.json();
            await expect(
               page.getByText(`${payload.meta.total} issues`, { exact: true })
            ).toBeVisible();
         } else {
            const result = await context.request.get(
               `${api}/projects/${fixture.projectId}?workspaceId=${fixture.workspace_id}`
            );
            const project = (await result.json()).data;
            await expect(page.getByText(project.name, { exact: true }).first()).toBeVisible();
         }
         await page.reload();
         await expect(
            page.getByText(`Saved regression ${entityType}`, { exact: true })
         ).toBeVisible();
         expect(errors).toEqual([]);
      } finally {
         await context.request.delete(`${api}/views/${id}?workspaceId=${fixture.workspace_id}`);
      }
   });

test('saved view failures offer Retry instead of claiming the view is missing', async ({
   page,
   context,
}) => {
   const response = await context.request.post(`${api}/views`, {
      data: {
         workspaceId: fixture.workspace_id,
         name: 'Retry regression view',
         entityType: 'issue',
         filters: {},
      },
   });
   const id = (await response.json()).data.id;
   try {
      await page.route('**/api/v1/views?*', (route) =>
         route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Temporary view failure' }),
         })
      );
      await page.goto(`/${fixture.slug}/view/${id}`);
      await expect(page.getByRole('heading', { name: 'Could not load this view' })).toBeVisible();
      await page.unroute('**/api/v1/views?*');
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect(page.getByText('Retry regression view', { exact: true })).toBeVisible();
   } finally {
      await context.request.delete(`${api}/views/${id}?workspaceId=${fixture.workspace_id}`);
   }
});

test('issue status settings create, rename and delete an unused status', async ({
   page,
   context,
}, testInfo) => {
   const name = `Workflow regression ${Date.now()}`;
   await page.goto(`/${fixture.slug}/settings/issue-statuses`);
   await expect(page.getByRole('heading', { name: 'Issue statuses', exact: true })).toBeVisible();
   await page.getByRole('button', { name: 'New status', exact: true }).click();
   await page.getByLabel('Status name').fill(name);
   await page.getByRole('button', { name: 'Save status', exact: true }).click();
   try {
      await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
      await page.getByLabel('Status name').fill(name + ' edited');
      await page.getByRole('button', { name: 'Save status', exact: true }).click();
      await expect(
         page.getByRole('button', { name: `Edit ${name} edited`, exact: true })
      ).toBeVisible();
      await page.reload();
      await page.screenshot({ path: testInfo.outputPath('workflow-settings.png'), fullPage: true });
      await page.getByRole('button', { name: `Edit ${name} edited`, exact: true }).click();
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Delete status', exact: true }).click();
      await expect(
         page.getByRole('button', { name: `Edit ${name} edited`, exact: true })
      ).toHaveCount(0);
   } finally {
      const response = await context.request.get(
         `${api}/issue-statuses?workspaceId=${fixture.workspace_id}`
      );
      for (const row of (await response.json()).data as {
         id: string;
         name: string;
         updatedAt: string;
      }[]) {
         if (row.name === name || row.name === name + ' edited') {
            const query = new URLSearchParams({
               workspaceId: fixture.workspace_id,
               expectedUpdatedAt: row.updatedAt,
            });
            await context.request.delete(`${api}/issue-statuses/${row.id}?${query}`);
         }
      }
   }
});
