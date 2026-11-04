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
      await expect(approve).toBeDisabled();
      await expect(
         review.getByText('You wrote this document: another reviewer must approve it first.', {
            exact: true,
         })
      ).toBeVisible();
      await expect(review.getByText(/Documents created through MCP/)).toBeVisible();
      for (const width of [1024, 390]) {
         await page.setViewportSize({ width, height: 900 });
         await expect(approve).toBeInViewport();
         await expect(review.getByText('Approval is not ready', { exact: true })).toBeVisible();
         expect(
            await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth + 1)
         ).toBeTruthy();
      }
      await page.setViewportSize({ width: 1024, height: 900 });
      await page.screenshot({ path: testInfo.outputPath('approval-guidance-ipad.png') });
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
