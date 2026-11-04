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

// Workspace owners can approve their own documents, but assigned reviewers must still agree.
// VI: Owner workspace được duyệt tài liệu tự tạo, nhưng reviewer đã giao vẫn phải đồng ý.
test('a workspace owner approves their own document after assigned reviewers agree', async ({
   page,
   context,
}, testInfo) => {
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
      await expect(approve).toBeEnabled();
      for (const width of [1024, 390]) {
         await page.setViewportSize({ width, height: 900 });
         await expect(approve).toBeInViewport();
      }
      await page.setViewportSize({ width: 1024, height: 900 });
      await review.getByRole('button', { name: /^(Assign reviewers|Phân công reviewer)$/ }).click();
      await page
         .getByRole('group', { name: /^(Reviewers|Reviewer)$/ })
         .getByRole('checkbox')
         .first()
         .check();
      await page.getByRole('button', { name: /^(Save|Lưu)$/ }).click();
      await expect(approve).toBeDisabled();
      await expect(
         review.getByText('1 reviewer(s) have not approved this version yet.', { exact: true })
      ).toBeVisible();
      await review.getByRole('button', { name: /^(Looks good|Đồng ý)$/ }).click();
      await expect(review.getByLabel(/^(Agreed|Đã đồng ý)$/)).toBeVisible();
      await expect(approve).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath('owner-approval-ready.png') });
      await approve.click();
      await page.getByRole('button', { name: 'Confirm approval v1', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Return to draft', exact: true })).toHaveCount(
         0
      );
      const saved = await context.request.get(
         `${api}/documents/${document.id}?workspaceId=${workspaceId}`
      );
      const result = (await saved.json()).data;
      expect(result.status).toBe('APPROVED');
      expect(result.release).toBe(1);
   } finally {
      await context.request.delete(`${api}/documents/${document.id}?workspaceId=${workspaceId}`);
   }
});

test('approval permission failures retry and the header honors server eligibility', async ({
   page,
   context,
}) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const created = await context.request.post(`${api}/documents`, {
      data: {
         workspaceId: fixture.workspace_id,
         title: 'Synthetic approval permissions',
         content: '# Spec',
         docType: 'FDS',
      },
   });
   expect(created.ok()).toBeTruthy();
   const document = (await created.json()).data;
   const endpoint = `${api}/documents/${document.id}/review?workspaceId=${fixture.workspace_id}`;
   const response = await context.request.get(endpoint);
   const original = (await response.json()).data;
   let fail = true;
   let eligible = true;
   await page.route(`**/documents/${document.id}/review?*`, async (route) => {
      if (fail)
         return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Synthetic permission failure' }),
         });
      return route.fulfill({
         contentType: 'application/json',
         body: JSON.stringify({
            data: {
               ...original,
               status: 'IN_REVIEW',
               canApprove: eligible,
               canAssign: eligible,
               approveBlockedReason: null,
            },
         }),
      });
   });
   try {
      await context.request.patch(
         `${api}/documents/${document.id}?workspaceId=${fixture.workspace_id}`,
         { data: { status: 'IN_REVIEW' } }
      );
      await page.goto(`/${fixture.slug}/documents/${document.id}`);
      await expect(
         page.getByRole('region', { name: 'Review', exact: true }).getByRole('alert')
      ).toContainText('Could not load approval permissions.');
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
      fail = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(
         page.getByRole('button', { name: 'Confirm approval v1', exact: true })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      eligible = false;
      await page.reload();
      await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
   } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await context.request.delete(
         `${api}/documents/${document.id}?workspaceId=${fixture.workspace_id}`
      );
   }
});
