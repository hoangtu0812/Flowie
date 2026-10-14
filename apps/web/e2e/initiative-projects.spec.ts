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

test('initiative Projects supports direct links, navigation, reload and project date edits', async ({
   page,
   context,
}) => {
   const errors: string[] = [];
   page.on('pageerror', (error) => errors.push(error.message));
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const initiativeResponse = await context.request.post(`${api}/initiatives`, {
      data: { workspaceId: fixture.workspace_id, name: 'Timeline regression initiative' },
   });
   expect(initiativeResponse.ok()).toBeTruthy();
   const initiativeId = (await initiativeResponse.json()).data.id as string;
   let projectId: string | undefined;
   const initiativeUrl = `/${fixture.slug}/initiative/${initiativeId}?tab=projects`;
   const name = `Timeline regression ${Date.now()}`;
   const startDate = new Date().toISOString().slice(0, 10);
   const target = new Date(`${startDate}T00:00:00Z`);
   target.setUTCDate(target.getUTCDate() + 7);
   const targetDate = target.toISOString().slice(0, 10);
   const targetLabel = target.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
   });

   try {
      await page.goto(initiativeUrl);
      await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
      const projectResponse = await context.request.post(`${api}/projects`, {
         data: {
            workspaceId: fixture.workspace_id,
            teamId: fixture.team_id,
            name,
            identifier: `TL${Date.now()}`,
         },
      });
      expect(projectResponse.ok()).toBeTruthy();
      projectId = (await projectResponse.json()).data.id as string;
      const datesResponse = await context.request.patch(
         `${api}/projects/${projectId}?workspaceId=${fixture.workspace_id}`,
         { data: { startDate } }
      );
      expect(datesResponse.ok()).toBeTruthy();
      const linkResponse = await context.request.post(
         `${api}/initiatives/${initiativeId}/projects`,
         {
            data: { workspaceId: fixture.workspace_id, projectId },
         }
      );
      expect(linkResponse.ok()).toBeTruthy();
      await page.reload();
      const bar = page.getByRole('button', { name: new RegExp(`^${name} · 0% complete ·`) });
      await expect(bar).toBeVisible();
      await page.getByRole('button', { name: 'overview', exact: true }).click();
      await expect(
         page.getByRole('heading', { name: 'Timeline regression initiative' })
      ).toBeVisible();
      await page.getByRole('button', { name: 'projects', exact: true }).click();
      await expect(bar).toBeVisible();
      await bar.click();
      await page.getByTitle('Change dates', { exact: true }).click();
      await page.getByLabel('Target date', { exact: true }).fill(targetDate);
      await page.getByRole('button', { name: 'Save dates', exact: true }).click();
      await expect(bar).toHaveAttribute('aria-label', new RegExp(` - ${targetLabel}$`));
      const stored = await context.request.get(
         `${api}/projects/${projectId}?workspaceId=${fixture.workspace_id}`
      );
      expect((await stored.json()).data.targetDate.slice(0, 10)).toBe(targetDate);
      await page.reload();
      await expect(bar).toHaveAttribute('aria-label', new RegExp(` - ${targetLabel}$`));
      for (const path of ['projects', 'team/GEN/projects']) {
         await page.goto(`/${fixture.slug}/${path}?tab=active`);
         await expect(bar).toHaveAttribute('aria-label', new RegExp(` - ${targetLabel}$`));
         await bar.click();
         await page.getByTitle('Change dates', { exact: true }).click();
         await page.getByLabel('Target date', { exact: true }).fill('');
         await page.getByRole('button', { name: 'Save dates', exact: true }).click();
         await expect(bar).not.toHaveAttribute('aria-label', new RegExp(` - ${targetLabel}$`));
         await page.getByTitle('Change dates', { exact: true }).click();
         await page.getByLabel('Target date', { exact: true }).fill(targetDate);
         await page.getByRole('button', { name: 'Save dates', exact: true }).click();
         await expect(bar).toHaveAttribute('aria-label', new RegExp(` - ${targetLabel}$`));
         await page.getByRole('button', { name: 'Close panel', exact: true }).click();
      }
      await page.goto(initiativeUrl);
      await expect(bar).toHaveAttribute('aria-label', new RegExp(` - ${targetLabel}$`));
      expect(errors).toEqual([]);
   } finally {
      await context.request.delete(
         `${api}/initiatives/${initiativeId}?workspaceId=${fixture.workspace_id}`
      );
      if (projectId)
         await context.request.delete(
            `${api}/projects/${projectId}?workspaceId=${fixture.workspace_id}`
         );
   }
});
