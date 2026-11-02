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

test('Docs moves and deletes documents, PDFs and folders using the clicked row and protects contents', async ({
   page,
   context,
}, testInfo) => {
   test.setTimeout(90000);
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const workspaceId = fixture.workspace_id;
   const query = `workspaceId=${workspaceId}`;
   const post = async (path: string, data: object) => {
      const response = await context.request.post(`${api}${path}`, {
         data: { workspaceId, ...data },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return (await response.json()).data;
   };
   const tree = await post('/documents/project-tree/scaffold', { projectId: fixture.projectId });
   const root = tree.folders.find((folder: { kind: string }) => folder.kind === 'project');
   const suffix = Date.now();
   const source = await post('/documents/folders', {
      parentId: root.id,
      name: `Source ${suffix}`,
      kind: 'module',
   });
   const destination = await post('/documents/folders', {
      parentId: root.id,
      name: `Destination ${suffix}`,
      kind: 'module',
   });
   const child = await post('/documents/folders', {
      parentId: source.id,
      name: `Child ${suffix}`,
      kind: 'feature',
   });
   const document = await post('/documents', {
      teamId: tree.teamId,
      folderId: source.id,
      title: `Move spec ${suffix}`,
      content: '# Retain this content',
      docType: 'FDS',
   });
   const pdfResponse = await context.request.post(`${api}/attachments`, {
      multipart: {
         workspaceId,
         entityType: 'document-folder',
         entityId: source.id,
         file: {
            name: 'move-me.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4\n%%EOF'),
         },
      },
   });
   expect(pdfResponse.ok(), await pdfResponse.text()).toBeTruthy();
   const pdf = (await pdfResponse.json()).data;
   const row = (id: string) => page.locator(`[data-tree-id="${id}"]`);
   const moveItem = page.getByRole('menuitem', { name: /^(Move…|Di chuyển…)$/ });
   const deleteItem = page.getByRole('menuitem', { name: /^(Delete…|Xóa…)$/ });
   const dialog = page.getByRole('dialog');
   const move = dialog.getByRole('button', { name: /^(Move|Di chuyển)$/ });
   const remove = dialog.getByRole('button', { name: /^(Delete|Xóa)$/ });
   const cancel = dialog.getByRole('button', { name: /^(Cancel|Huỷ)$/ });
   const actions = (id: string) =>
      row(id)
         .getByRole('button', { name: /^(Actions for|Thao tác với)/ })
         .first();
   try {
      await page.goto(`/${fixture.slug}/docs?project=${fixture.projectId}`);
      await expect(row(source.id)).toBeVisible();
      await row(source.id).locator('[data-tree-toggle]').first().click();
      await expect(row(document.id)).toBeVisible();
      await row(destination.id).click();
      await row(document.id).click({ button: 'right' });
      await expect(moveItem).toBeVisible();
      await page.screenshot({
         path: testInfo.outputPath('docs-context-menu.png'),
         animations: 'disabled',
      });
      await moveItem.click();
      await expect(dialog.getByRole('heading')).toContainText(document.title);
      await expect(
         dialog
            .getByRole('option', { name: new RegExp(source.name) })
            .filter({ hasText: new RegExp(`${source.name}$`) })
      ).toBeDisabled();
      await dialog.getByLabel(/^(Destination folder|Thư mục đích)$/).selectOption(destination.id);
      await page.route(`**/documents/${document.id}?*`, async (route) => {
         if (route.request().method() === 'PATCH')
            await route.fulfill({
               status: 409,
               contentType: 'application/json',
               body: JSON.stringify({ message: 'Concurrent document update' }),
            });
         else await route.continue();
      });
      await move.click();
      await expect(page.getByText('Concurrent document update', { exact: true })).toBeVisible();
      await expect(dialog).toBeVisible();
      await page.unroute(`**/documents/${document.id}?*`);
      await move.click();
      await expect(dialog).toBeHidden();
      await expect(row(document.id)).toBeHidden();
      await row(destination.id).locator('[data-tree-toggle]').first().click();
      await expect(row(document.id)).toBeVisible();
      await actions(document.id).click();
      await deleteItem.click();
      await expect(dialog).toBeVisible();
      await cancel.click();
      await expect(row(document.id)).toBeVisible();

      await actions(source.id).click();
      await deleteItem.click();
      await expect(remove).toBeDisabled();
      await expect(dialog.getByRole('alert')).toBeVisible();
      await cancel.click();
      await row(child.id).focus();
      await page.keyboard.press('Shift+F10');
      await expect(moveItem).toBeVisible();
      await moveItem.click();
      await expect(dialog.getByRole('option', { name: new RegExp(child.name) })).toHaveCount(0);
      await dialog.getByLabel(/^(Destination folder|Thư mục đích)$/).selectOption(destination.id);
      await move.click();
      await expect(dialog).toBeHidden();
      await expect(row(destination.id).locator(`[data-tree-id="${child.id}"]`)).toBeVisible();

      await actions(pdf.id).click();
      await moveItem.click();
      await dialog.getByLabel(/^(Destination folder|Thư mục đích)$/).selectOption(destination.id);
      await move.click();
      await expect(dialog).toBeHidden();
      await expect(row(destination.id).locator(`[data-tree-id="${pdf.id}"]`)).toBeVisible();
      await actions(pdf.id).click();
      await deleteItem.click();
      await remove.click();
      await expect(dialog).toBeHidden();
      await expect(row(pdf.id)).toHaveCount(0);

      await page
         .getByRole('textbox', { name: /^(Search documents…|Tìm tài liệu…)$/ })
         .fill(document.title);
      await expect(row(document.id)).toBeVisible();
      await actions(document.id).click();
      await deleteItem.click();
      await remove.click();
      await expect(dialog).toBeHidden();
      await expect(row(document.id)).toHaveCount(0);
      const archived = await context.request.get(`${api}/documents/${document.id}?${query}`);
      expect(archived.status()).toBe(404);
      await page.getByRole('textbox', { name: /^(Search documents…|Tìm tài liệu…)$/ }).fill('');
      await actions(source.id).click();
      await deleteItem.click();
      await remove.click();
      await expect(dialog).toBeHidden();
      await expect(row(source.id)).toHaveCount(0);
      await page.reload();
      await expect(row(source.id)).toHaveCount(0);
      await expect(row(root.id)).toBeVisible();
      await expect(
         row(root.id).getByRole('button', {
            name: new RegExp(`^(Actions for|Thao tác với) ${root.name}$`),
         })
      ).toHaveCount(0);
      await page.screenshot({
         path: testInfo.outputPath('docs-actions-complete.png'),
         animations: 'disabled',
      });
   } finally {
      testInfo.setTimeout(testInfo.timeout + 10000);
      await context.request.delete(`${api}/documents/${document.id}?${query}`);
      await context.request.delete(
         `${api}/documents/folder-files/${pdf.id}?${query}&expectedFolderId=${destination.id}`
      );
      for (const folder of [child, source, destination])
         await context.request.delete(`${api}/documents/folders/${folder.id}?${query}`);
   }
});
