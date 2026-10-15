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

test('CSV import previews valid, invalid and duplicate rows, then resumes durable results', async ({
   page,
   context,
   browserName,
}) => {
   const stamp = Date.now(),
      title = `Imported browser task ${stamp}`;
   await page.setViewportSize({ width: 390, height: 844 });
   await page.goto(`/${fixture.slug}/settings/data-exchange`);
   await page.getByLabel('Import source namespace', { exact: true }).fill(`browser-${stamp}`);
   await page
      .getByLabel('CSV content', { exact: true })
      .fill(`key,summary,priority\na,${title},HIGH\nb,x,LOW\na,Duplicate,HIGH`);
   await page.getByRole('button', { name: 'Inspect CSV columns', exact: true }).click();
   for (const [field, column] of [
      ['externalId', 'key'],
      ['title', 'summary'],
   ]) {
      await page.getByRole('combobox', { name: `CSV mapping ${field}`, exact: true }).click();
      await page.getByRole('option', { name: column, exact: true }).click();
   }
   await page.getByRole('button', { name: 'Preview CSV import', exact: true }).click();
   await expect(page.getByRole('status').filter({ hasText: 'Import PREVIEW' })).toContainText(
      'PENDING: 1'
   );
   await expect(page.getByText(/Row 3: x/, { exact: true })).toBeVisible();
   const before = (
      await (
         await context.request.get(
            `${api}/issues?workspaceId=${fixture.workspace_id}&query=${encodeURIComponent(title)}`
         )
      ).json()
   ).data;
   expect(before).toHaveLength(0);
   await page.screenshot({
      path: `test-results/import-preview-${browserName}.png`,
      animations: 'disabled',
      fullPage: true,
   });
   await page.getByRole('button', { name: 'Confirm import valid rows', exact: true }).click();
   await expect(page.getByRole('status').filter({ hasText: 'Import DONE' })).toContainText(
      'SUCCEEDED: 1'
   );
   const results = (
      await (
         await context.request.get(
            `${api}/issues?workspaceId=${fixture.workspace_id}&query=${encodeURIComponent(title)}`
         )
      ).json()
   ).data as { id: string }[];
   expect(results).toHaveLength(1);
   try {
      await page.waitForLoadState('networkidle');
      await page.reload();
      await page
         .getByRole('button', { name: /^Open import / })
         .first()
         .click();
      await expect(page.getByRole('status').filter({ hasText: 'Import DONE' })).toContainText(
         'SUCCEEDED: 1'
      );
      await page.waitForLoadState('networkidle');
      await page.goto(`/${fixture.slug}/team/GEN/all`);
      const [download] = await Promise.all([
         page.waitForEvent('download'),
         page.getByRole('button', { name: 'Export matching issues CSV', exact: true }).click(),
      ]);
      expect(download.suggestedFilename()).toBe('flowie-issues.csv');
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString('utf8')).toContain(title);
   } finally {
      for (const issue of results)
         await context.request.delete(
            `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`
         );
   }
});

test('document ZIP export packages selected Markdown and its real attachment', async ({
   page,
   context,
}) => {
   const title = `Document ZIP ${Date.now()}`;
   const created = await context.request.post(`${api}/documents`, {
      data: { workspaceId: fixture.workspace_id, title, content: '# Real Markdown export' },
   });
   expect(created.ok()).toBeTruthy();
   const document = (await created.json()).data;
   try {
      const uploaded = await context.request.post(`${api}/attachments`, {
         multipart: {
            workspaceId: fixture.workspace_id,
            entityType: 'document',
            entityId: document.id,
            file: {
               name: 'proof.md',
               mimeType: 'text/markdown',
               buffer: Buffer.from('Archive proof'),
            },
         },
      });
      expect(uploaded.ok()).toBeTruthy();
      await page.goto(`/${fixture.slug}/settings/data-exchange`);
      await page.getByRole('button', { name: 'Documents to export', exact: true }).click();
      await page.getByRole('option', { name: title, exact: true }).click();
      await page.keyboard.press('Escape');
      await page
         .getByRole('checkbox', { name: 'Include stored document attachments', exact: true })
         .check();
      const [download] = await Promise.all([
         page.waitForEvent('download'),
         page.getByRole('button', { name: 'Export selected documents ZIP', exact: true }).click(),
      ]);
      expect(download.suggestedFilename()).toBe('flowie-documents.zip');
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      const zip = Buffer.concat(chunks);
      expect(zip.subarray(0, 2).toString()).toBe('PK');
      expect(zip.toString()).toContain(`documents/${document.id}.md`);
   } finally {
      await context.request.delete(
         `${api}/documents/${document.id}?workspaceId=${fixture.workspace_id}`
      );
   }
});
