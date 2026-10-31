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

test('a task links a project document from Attachments or Overview and the document lists the task', async ({
   page,
   context,
}) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const workspaceId = fixture.workspace_id;
   const post = async (path: string, data: object) => {
      const response = await context.request.post(`${api}${path}`, {
         data: { workspaceId, ...data },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return (await response.json()).data;
   };
   const tree = await post('/documents/project-tree/scaffold', { projectId: fixture.projectId });
   const folder = tree.folders.find((item: { kind: string }) => item.kind !== 'project');
   const title = `Linked spec ${Date.now()}`;
   const document = await post('/documents', {
      teamId: tree.teamId,
      folderId: folder.id,
      title,
      content: '# Spec',
      docType: 'FDS',
   });
   const issue = await post('/issues', {
      teamId: tree.teamId,
      projectId: fixture.projectId,
      title: `Link docs ${Date.now()}`,
   });
   try {
      await page.goto(`/${fixture.slug}/issue/${issue.identifier}?tab=attachments`);
      const links = page.getByRole('region', { name: /^(Linked documents|Tài liệu liên kết)$/ });
      await expect(
         links.getByText(/^(No linked documents yet\.|Chưa liên kết tài liệu nào\.)$/)
      ).toBeVisible();
      await links.getByRole('button', { name: /^(Link document|Liên kết tài liệu)$/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox').fill(title.slice(0, 18));
      const linked = page.waitForResponse(
         (response) =>
            response.url().startsWith(`${api}/documents/${document.id}/issue-links`) &&
            response.request().method() === 'POST'
      );
      await dialog.getByRole('listitem').filter({ hasText: title }).click();
      expect((await linked).ok()).toBeTruthy();
      await expect(dialog).toBeHidden();
      await expect(links.getByRole('link', { name: new RegExp(title) })).toBeVisible();

      // Overview shares the same list, so the new link shows without a reload.
      // VI: Overview dùng chung danh sách, nên liên kết mới hiện mà không cần tải lại.
      await page.getByRole('tab', { name: /^(Overview|Tổng quan)/ }).click();
      await expect(
         page
            .getByRole('region', { name: /^(Related documents|Tài liệu liên quan)$/ })
            .getByRole('link', { name: new RegExp(title) })
      ).toBeVisible();

      await page.goto(`/${fixture.slug}/documents/${document.id}`);
      const tasks = page.getByRole('region', { name: /^(Linked tasks|Task liên kết)$/ });
      await expect(tasks.getByRole('link', { name: new RegExp(issue.identifier) })).toHaveAttribute(
         'href',
         `/${fixture.slug}/issue/${issue.identifier}`
      );

      await page.goto(`/${fixture.slug}/issue/${issue.identifier}?tab=attachments`);
      await links
         .getByRole('button', { name: new RegExp(`^(Unlink|Gỡ liên kết) ${title}$`) })
         .click();
      await expect(
         links.getByText(/^(No linked documents yet\.|Chưa liên kết tài liệu nào\.)$/)
      ).toBeVisible();

      // Related documents on Overview links with the same picker, next to the FDS/TDS warning.
      // VI: Tài liệu liên quan ở Overview liên kết bằng cùng hộp chọn, cạnh cảnh báo FDS/TDS.
      await page.getByRole('tab', { name: /^(Overview|Tổng quan)/ }).click();
      const related = page.getByRole('region', {
         name: /^(Related documents|Tài liệu liên quan)$/,
      });
      await related.getByRole('button', { name: /^(Link document|Liên kết tài liệu)$/ }).click();
      await dialog.getByRole('textbox').fill(title.slice(0, 18));
      await dialog.getByRole('listitem').filter({ hasText: title }).click();
      await expect(dialog).toBeHidden();
      await expect(related.getByRole('link', { name: new RegExp(title) })).toBeVisible();
      await expect(related.getByText(/FDS\/TDS/)).toBeHidden();
   } finally {
      await context.request.delete(`${api}/issues/${issue.id}?workspaceId=${workspaceId}`);
      await context.request.delete(`${api}/documents/${document.id}?workspaceId=${workspaceId}`);
   }
});
