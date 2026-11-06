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

test('a related document opens below the task header, which keeps working, and closes back to the task', async ({
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
   const title = `Viewer spec ${Date.now()}`;
   const document = await post('/documents', {
      teamId: tree.teamId,
      folderId: folder.id,
      title,
      content: `# Spec\n\n${'Long paragraph.\n\n'.repeat(80)}`,
      docType: 'FDS',
   });
   const issue = await post('/issues', {
      teamId: tree.teamId,
      projectId: fixture.projectId,
      title: `Viewer task ${Date.now()}`,
   });
   await post(`/documents/${document.id}/issue-links`, { issueId: issue.id });
   try {
      // Open the task from the list so the header has previous/next issues.
      // VI: Mở task từ danh sách để header có công việc trước/sau.
      await page.goto(`/${fixture.slug}/issues`);
      await page.getByRole('link', { name: issue.title, exact: true }).click();
      const related = page.getByRole('region', {
         name: /^(Related documents|Tài liệu liên quan)$/,
      });
      const viewer = page.getByTestId('issue-document-viewer');
      const crumb = page.getByTestId('issue-title-breadcrumb');
      const openDocument = async () => {
         await related.getByRole('link', { name: new RegExp(title) }).click();
         await expect(page).toHaveURL(new RegExp(`[?&]doc=${document.id}`));
         await expect(viewer.getByRole('heading', { name: title }).first()).toBeVisible();
      };

      // AC1 + AC3: the header stays above the viewer, which fills the rest of the screen and
      // scrolls on its own while the page itself never scrolls.
      // VI: AC1 + AC3: header nằm trên khung xem, khung chiếm phần còn lại của màn hình và tự
      // VI: cuộn trong khi trang không cuộn.
      await openDocument();
      await expect(crumb).toBeVisible();
      await expect(page.getByTestId('issue-project-breadcrumb')).toBeVisible();
      const header = (await crumb.boundingBox())!;
      const pane = (await viewer.boundingBox())!;
      // The task header and the page body share the app's content card, which sits inside the
      // shell's inset, so "screen bottom" is the card's inner bottom edge.
      // VI: Header task và thân trang nằm chung thẻ nội dung của app, thẻ này nằm trong khoảng lề
      // VI: của khung app, nên "đáy màn hình" là mép dưới bên trong của thẻ.
      const frameBottom = await crumb.evaluate((element) => {
         const card = element.closest('.border-b')!.parentElement!;
         return (
            card.getBoundingClientRect().bottom -
            parseFloat(getComputedStyle(card).borderBottomWidth)
         );
      });
      expect(pane.y).toBeGreaterThanOrEqual(header.y + header.height);
      expect(Math.abs(pane.y + pane.height - frameBottom)).toBeLessThanOrEqual(1);
      if (process.env.FLOWIE_E2E_SCREENSHOT) {
         await page.screenshot({ path: process.env.FLOWIE_E2E_SCREENSHOT });
      }
      expect(
         await page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight)
      ).toBeTruthy();

      // AC2: the task crumb is clickable over the viewer and returns to the task's main view.
      // VI: AC2: crumb task bấm được khi đang xem tài liệu và quay về view chính của task.
      await crumb.click();
      await expect(page).not.toHaveURL(/[?&]doc=/);
      await expect(viewer).toBeHidden();
      await expect(related).toBeVisible();

      // AC4: Close returns to the task as it was.
      // VI: AC4: nút Đóng quay về task như ban đầu.
      await openDocument();
      await viewer.getByRole('button', { name: /^(Close|Đóng)$/ }).click();
      await expect(page).not.toHaveURL(/[?&]doc=/);
      await expect(viewer).toBeHidden();
      await expect(related.getByRole('link', { name: new RegExp(title) })).toBeVisible();

      // AC2: previous/next still moves to another task, leaving the document.
      // VI: AC2: trước/sau vẫn chuyển sang task khác và rời tài liệu.
      await openDocument();
      const previous = page.getByRole('link', { name: /^(Previous issue|Công việc trước)$/ });
      const next = page.getByRole('link', { name: /^(Next issue|Công việc tiếp theo)$/ });
      await ((await previous.count()) ? previous : next).click();
      await expect(page).not.toHaveURL(new RegExp(`/issue/${issue.identifier}(\\?|$)`));
      await expect(page).not.toHaveURL(/[?&]doc=/);
      await expect(viewer).toBeHidden();
   } finally {
      await context.request.delete(`${api}/issues/${issue.id}?workspaceId=${workspaceId}`);
      await context.request.delete(`${api}/documents/${document.id}?workspaceId=${workspaceId}`);
   }
});
