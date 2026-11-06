import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
const owners: string[] = [];
test.afterEach(async ({ context }) => {
   for (const id of owners.splice(0))
      await context.request.delete(`${api}/issues/${id}?workspaceId=${fixture.workspace_id}`);
});

test('HTML and CSV attachments preview in a sandbox that cannot run script', async ({
   page,
   context,
}) => {
   test.setTimeout(90000);
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const ownerResponse = await context.request.post(`${api}/issues`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: fixture.team_id,
         title: 'Synthetic attachment preview owner',
      },
   });
   expect(ownerResponse.ok()).toBeTruthy();
   const owner = (await ownerResponse.json()).data;
   owners.push(owner.id);
   for (const [name, mimeType, text] of [
      [
         'report.html',
         'text/html',
         '<h1>Synthetic report</h1><script>parent.document.title="pwned";window.top.pwned=true</script>',
      ],
      ['plan.csv', 'text/csv', 'Task,Owner\nReview,Lan'],
   ]) {
      const response = await context.request.post(`${api}/attachments`, {
         multipart: {
            workspaceId: fixture.workspace_id,
            entityType: 'issue',
            entityId: owner.id,
            file: { name, mimeType, buffer: Buffer.from(text) },
         },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
   }
   await page.goto(`/${fixture.slug}/issue/${owner.identifier}?tab=attachments`);

   await page.getByRole('button', { name: /report\.html/ }).click();
   const dialog = page.getByRole('dialog');
   const report = dialog.frameLocator('iframe[title="report.html"]');
   await expect(report.getByRole('heading', { name: 'Synthetic report' })).toBeVisible();
   await expect(dialog.locator('iframe')).toHaveAttribute('sandbox', '');
   expect(await page.evaluate(() => (window as { pwned?: boolean }).pwned)).toBeUndefined();
   await expect(page).not.toHaveTitle('pwned');
   await page.keyboard.press('Escape');

   await page.getByRole('button', { name: /plan\.csv/ }).click();
   const plan = page.getByRole('dialog').frameLocator('iframe[title="plan.csv"]');
   await expect(plan.getByRole('cell', { name: 'Lan' })).toBeVisible();
});
