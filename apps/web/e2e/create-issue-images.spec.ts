import { expect, test, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
let created: string[] = [];
test.afterEach(async ({ context }) => {
   test.setTimeout(30000);
   const ids = created;
   created = [];
   for (const id of ids)
      await context.request.delete(`${api}/issues/${id}?workspaceId=${fixture.workspace_id}`);
});
async function pasteImages(field: Locator, names: string[]) {
   await field.evaluate((element, names) => {
      const data = new DataTransfer();
      const bytes = Uint8Array.from(
         atob(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM3sAAAAASUVORK5CYII='
         ),
         (c) => c.charCodeAt(0)
      );
      for (const name of names) data.items.add(new File([bytes], name, { type: 'image/png' }));
      // Firefox ignores clipboardData in the ClipboardEvent constructor, so it is set on the instance.
      // VI: Firefox bỏ qua clipboardData trong constructor ClipboardEvent nên phải gán trên đối tượng.
      const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(paste, 'clipboardData', { value: data });
      element.dispatchEvent(paste);
   }, names);
}
test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await page.goto(`/${fixture.slug}/team/${fixture.team_id}/all`);
   await page.getByRole('button', { name: 'Create issue', exact: true }).first().click();
});
test('clipboard images and parent resume upload and description failures without duplicates', async ({
   page,
   context,
}, testInfo) => {
   const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
   await dialog.getByLabel('Issue title', { exact: true }).fill(`Clipboard child ${Date.now()}`);
   await dialog.getByRole('button', { name: 'Markdown', exact: true }).click();
   const description = dialog.getByLabel('Issue description', { exact: true });
   await description.fill('Before After');
   await description.evaluate((el) => (el as HTMLTextAreaElement).setSelectionRange(7, 7));
   const uploads: string[] = [];
   let failUpload = true,
      failPatch = true;
   const creates: Record<string, unknown>[] = [];
   await page.route('**/api/v1/attachments', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const filename =
         route
            .request()
            .postDataBuffer()!
            .toString('latin1')
            .match(/filename="([^"]+)"/)?.[1] ?? '';
      uploads.push(filename);
      if (filename === 'second.png' && failUpload) {
         failUpload = false;
         return route.fulfill({ status: 503, json: { message: 'Synthetic image upload failure' } });
      }
      await route.continue();
   });
   await page.route('**/api/v1/issues', async (route) => {
      if (route.request().method() === 'POST') creates.push(route.request().postDataJSON());
      await route.continue();
   });
   await page.route('**/api/v1/issues/*?*', async (route) => {
      if (route.request().method() === 'PATCH' && failPatch) {
         failPatch = false;
         return route.fulfill({ status: 503, json: { message: 'Synthetic description failure' } });
      }
      await route.continue();
   });
   await pasteImages(description, ['first.png', 'second.png']);
   await expect(dialog.getByRole('img', { name: 'first.png', exact: true })).toBeVisible();
   await expect(description).toHaveValue(/Before[\s\S]*first.png[\s\S]*second.png[\s\S]*After/);
   expect(uploads).toEqual([]);
   await dialog.getByRole('button', { name: 'Set parent', exact: true }).click();
   await expect(page.getByRole('dialog')).toHaveCount(1);
   await dialog
      .getByRole('textbox', { name: 'Search issues', exact: true })
      .fill(fixture.issues[0].identifier);
   await dialog.getByRole('listitem').filter({ hasText: fixture.issues[0].title }).click();
   await expect(
      dialog.getByRole('button', { name: `Parent: ${fixture.issues[0].identifier}`, exact: true })
   ).toBeVisible();
   const response = page.waitForResponse(
      (r) => r.url() === `${api}/issues` && r.request().method() === 'POST'
   );
   await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
   const issue = (await (await response).json()).data;
   created.push(issue.id);
   await expect(dialog.getByRole('alert')).toContainText('Synthetic image upload failure');
   expect(creates).toHaveLength(1);
   expect(creates[0].description).not.toContain('blob:');
   await page.setViewportSize({ width: 390, height: 844 });
   expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
   await page.screenshot({
      path: testInfo.outputPath('create-images-retry-mobile.png'),
      fullPage: true,
   });
   await dialog.getByRole('button', { name: 'Retry saving images', exact: true }).click();
   await expect(dialog.getByRole('alert')).toContainText('Synthetic description failure');
   await dialog.getByRole('button', { name: 'Retry saving images', exact: true }).click();
   await expect(dialog).toHaveCount(0);
   expect(creates).toHaveLength(1);
   expect(uploads.filter((x) => x === 'first.png')).toHaveLength(1);
   expect(uploads.filter((x) => x === 'second.png')).toHaveLength(2);
   const detail = (
      await (
         await context.request.get(`${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`)
      ).json()
   ).data;
   expect(detail.parentIssueId).toBe(fixture.issues[0].id);
   expect(detail.description).not.toContain('blob:');
   expect(detail.description).toContain('/attachments/');
   expect(detail.description).toContain('Before');
   expect(detail.description).toContain('After');
   const attachments = (
      await (
         await context.request.get(
            `${api}/attachments?${new URLSearchParams({ workspaceId: fixture.workspace_id, entityType: 'issue', entityId: issue.id })}`
         )
      ).json()
   ).data;
   expect(attachments).toHaveLength(2);
   await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
   await expect(page.getByRole('img', { name: 'first.png', exact: true })).toBeVisible();
   await expect(page.getByRole('img', { name: 'second.png', exact: true })).toBeVisible();
});

test('team changes clear parent and Create more keeps it while resetting image drafts', async ({
   page,
   context,
}) => {
   const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
   const chooseParent = async () => {
      await dialog.getByRole('button', { name: 'Set parent', exact: true }).click();
      await dialog
         .getByRole('textbox', { name: 'Search issues', exact: true })
         .fill(fixture.issues[0].identifier);
      await dialog.getByRole('listitem').filter({ hasText: fixture.issues[0].title }).click();
   };
   await chooseParent();
   await dialog.getByRole('button').filter({ hasText: /GEN/ }).first().click();
   await page.getByRole('menuitem', { name: 'No team', exact: true }).click();
   await expect(dialog.getByRole('button', { name: 'Set parent', exact: true })).toBeVisible();
   await dialog.getByRole('button').filter({ hasText: 'No team' }).first().click();
   await page.getByRole('menuitem', { name: /General/ }).click();
   await chooseParent();
   await dialog.getByRole('button', { name: 'Markdown', exact: true }).click();
   const description = dialog.getByLabel('Issue description', { exact: true });
   const uploads: string[] = [];
   await page.route('**/api/v1/attachments', async (route) => {
      if (route.request().method() === 'POST')
         uploads.push(
            route
               .request()
               .postDataBuffer()!
               .toString('latin1')
               .match(/filename="([^"]+)"/)?.[1] ?? ''
         );
      await route.continue();
   });
   await pasteImages(description, ['removed.png']);
   await dialog.getByRole('button', { name: 'Remove image', exact: true }).click();
   await expect(dialog.getByRole('img', { name: 'removed.png', exact: true })).toHaveCount(0);
   await dialog.getByRole('switch', { name: 'Create more', exact: true }).check();
   const create = async (title: string) => {
      await dialog.getByLabel('Issue title', { exact: true }).fill(title);
      const saved = page.waitForResponse(
         (r) => r.url() === `${api}/issues` && r.request().method() === 'POST'
      );
      await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
      const issue = (await (await saved).json()).data;
      created.push(issue.id);
      return issue;
   };
   const first = await create(`Create more first ${Date.now()}`);
   await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue('');
   await expect(description).toHaveValue('');
   await expect(
      dialog.getByRole('button', { name: `Parent: ${fixture.issues[0].identifier}`, exact: true })
   ).toBeVisible();
   expect(uploads).toEqual([]);
   await pasteImages(description, ['fresh.png']);
   await dialog.getByRole('switch', { name: 'Create more', exact: true }).uncheck();
   const second = await create(`Create more second ${Date.now()}`);
   await expect(dialog).toHaveCount(0);
   expect(uploads).toEqual(['fresh.png']);
   for (const issue of [first, second]) {
      const detail = (
         await (
            await context.request.get(
               `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`
            )
         ).json()
      ).data;
      expect(detail.parentIssueId).toBe(fixture.issues[0].id);
   }
});
