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

// The fixture user leads the team and writes the document: they can assign reviewers and review,
// but Approve stays disabled with the reason until another reviewer agrees.
// VI: User fixture là lead của team và là tác giả: phân công và review được, nhưng nút Duyệt bị
// VI: khoá kèm lý do cho tới khi có reviewer khác đồng ý.
test('a lead assigns reviewers, reviews, and cannot approve their own document alone', async ({
   page,
   context,
}) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const workspaceId = fixture.workspace_id;
   const send = async (method: 'post' | 'patch', path: string, data: object) => {
      const response = await context.request[method](`${api}${path}`, {
         data: { workspaceId, ...data },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return (await response.json()).data;
   };
   const tree = await send('post', '/documents/project-tree/scaffold', {
      projectId: fixture.projectId,
   });
   const folder = tree.folders.find((item: { kind: string }) => item.kind !== 'project');
   const document = await send('post', '/documents', {
      teamId: tree.teamId,
      folderId: folder.id,
      title: `Reviewed spec ${Date.now()}`,
      content: '# Spec',
      docType: 'FDS',
   });
   try {
      await context.request.patch(`${api}/documents/${document.id}?workspaceId=${workspaceId}`, {
         data: { status: 'IN_REVIEW' },
      });
      await page.goto(`/${fixture.slug}/documents/${document.id}`);
      const review = page.getByRole('region', { name: /^(Review|Duyệt tài liệu)$/ });
      await expect(review).toBeVisible();
      const approve = page.getByRole('button', { name: /^(Approve|Duyệt)$/ });
      await expect(approve).toBeDisabled();

      await review.getByRole('button', { name: /^(Assign reviewers|Phân công reviewer)$/ }).click();
      await page
         .getByRole('group', { name: /^(Reviewers|Reviewer)$/ })
         .getByRole('checkbox')
         .first()
         .check();
      await page.getByRole('button', { name: /^(Save|Lưu)$/ }).click();
      await review.getByRole('button', { name: /^(Looks good|Đồng ý)$/ }).click();
      await expect(review.getByLabel(/^(Agreed|Đã đồng ý)$/)).toBeVisible();
      await expect(approve).toBeDisabled();
      await expect(approve).toHaveAttribute('title', /another reviewer/);
   } finally {
      await context.request.delete(`${api}/documents/${document.id}?workspaceId=${workspaceId}`);
   }
});
