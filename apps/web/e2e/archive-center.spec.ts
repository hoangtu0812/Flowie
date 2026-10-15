import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   team_id: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';
test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
});

test('archive center previews and restores a document with its contents', async ({
   page,
   context,
   browserName,
}) => {
   await page.setViewportSize({ width: 390, height: 844 });
   const title = `Restore document ${Date.now()}`;
   const created = await context.request.post(`${api}/documents`, {
      data: { workspaceId: fixture.workspace_id, title, content: 'Preserve this archived content' },
   });
   expect(created.ok()).toBeTruthy();
   const document = (await created.json()).data;
   try {
      expect(
         (
            await context.request.delete(
               `${api}/documents/${document.id}?workspaceId=${fixture.workspace_id}`
            )
         ).ok()
      ).toBeTruthy();
      await page.goto(`/${fixture.slug}/settings/archive`);
      await page.getByRole('combobox', { name: 'Record type', exact: true }).click();
      await page.getByRole('option', { name: 'Documents', exact: true }).click();
      await page.getByRole('button', { name: `Preview restore ${title}`, exact: true }).click();
      await expect(
         page.getByRole('heading', { name: 'Restore archived record', exact: true })
      ).toBeVisible();
      await page.screenshot({
         path: `test-results/archive-preview-${browserName}.png`,
         animations: 'disabled',
      });
      const before = await context.request.get(
         `${api}/documents/${document.id}?workspaceId=${fixture.workspace_id}`
      );
      expect(before.status()).toBe(404);
      await page.getByRole('button', { name: 'Restore record', exact: true }).click();
      await expect(page.getByText(`Restored ${title}`, { exact: true })).toBeVisible();
      const restored = await context.request.get(
         `${api}/documents/${document.id}?workspaceId=${fixture.workspace_id}`
      );
      expect(restored.ok()).toBeTruthy();
      expect((await restored.json()).data.content).toBe('Preserve this archived content');
      await page.getByRole('link', { name: 'Open restored record', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/documents/${document.id}`));
   } finally {
      await context.request.delete(
         `${api}/documents/${document.id}?workspaceId=${fixture.workspace_id}`
      );
   }
});

test('archived task requires restoring its project first', async ({ page, context }) => {
   const title = `Restore project ${Date.now()}`;
   const created = await context.request.post(`${api}/projects`, {
      data: { workspaceId: fixture.workspace_id, name: title, identifier: `ARC${Date.now()}` },
   });
   expect(created.ok()).toBeTruthy();
   const project = (await created.json()).data;
   const issueTitle = `Restore dependent task ${Date.now()}`;
   const issueResponse = await context.request.post(`${api}/issues`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: fixture.team_id,
         projectId: project.id,
         title: issueTitle,
      },
   });
   expect(issueResponse.ok()).toBeTruthy();
   const issue = (await issueResponse.json()).data;
   try {
      expect(
         (
            await context.request.delete(
               `${api}/projects/${project.id}?workspaceId=${fixture.workspace_id}`
            )
         ).ok()
      ).toBeTruthy();
      await page.goto(`/${fixture.slug}/settings/archive`);
      await page
         .getByRole('button', { name: `Preview restore ${issueTitle}`, exact: true })
         .click();
      await expect(page.getByText('Restore the project first.', { exact: true })).toBeVisible();
      await expect(
         page.getByRole('button', { name: 'Restore record', exact: true })
      ).toBeDisabled();
      await page.getByRole('button', { name: 'Cancel restore', exact: true }).click();
      await page.getByRole('combobox', { name: 'Record type', exact: true }).click();
      await page.getByRole('option', { name: 'Projects', exact: true }).click();
      await page.getByRole('button', { name: `Preview restore ${title}`, exact: true }).click();
      await page.getByRole('button', { name: 'Restore record', exact: true }).click();
      await expect(page.getByText(`Restored ${title}`, { exact: true })).toBeVisible();
      await page.getByRole('combobox', { name: 'Record type', exact: true }).click();
      await page.getByRole('option', { name: 'Tasks and bugs', exact: true }).click();
      await page
         .getByRole('button', { name: `Preview restore ${issueTitle}`, exact: true })
         .click();
      await page.getByRole('button', { name: 'Restore record', exact: true }).click();
      await expect(page.getByText(`Restored ${issueTitle}`, { exact: true })).toBeVisible();
      expect(
         (
            await context.request.get(
               `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`
            )
         ).ok()
      ).toBeTruthy();
   } finally {
      await context.request.delete(
         `${api}/projects/${project.id}?workspaceId=${fixture.workspace_id}`
      );
   }
});
