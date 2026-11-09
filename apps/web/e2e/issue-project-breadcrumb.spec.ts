import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';

test('issue project breadcrumb appears from All issues and direct links, opens project issues, and omits unassigned projects', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const issue = fixture.issues[0];
   await page.goto(`/${fixture.slug}/issues`);
   await page.getByRole('link', { name: issue.title, exact: true }).click();
   const crumb = page.getByTestId('issue-project-breadcrumb');
   await expect(crumb).toHaveAccessibleName('Regression project');
   await expect(crumb).toHaveAttribute('href', /\/project\/[^/]+\/issues$/);
   await page.reload();
   await expect(crumb).toBeVisible();
   await page.screenshot({
      path: testInfo.outputPath('issue-project-breadcrumb.png'),
      fullPage: true,
   });
   await crumb.click();
   await expect(page).toHaveURL(/\/project\/[^/]+\/issues$/);
   // The URL changes before the project page has finished loading, and a goto
   // issued in that gap is cut off by the navigation still in flight. Wait for
   // the page itself, which lists this issue.
   // VI: URL đổi trước khi trang project tải xong, và một lệnh goto gửi trong
   // VI: khoảng đó bị chính điều hướng đang chạy cắt ngang. Chờ chính trang đó,
   // VI: trang có liệt kê issue này.
   await expect(page.getByRole('link', { name: issue.title, exact: true })).toBeVisible();
   try {
      expect(
         (
            await context.request.patch(
               `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`,
               {
                  data: { projectId: null },
               }
            )
         ).ok()
      ).toBeTruthy();
      await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
      await expect(page.getByText(issue.title, { exact: true }).first()).toBeVisible();
      await expect(crumb).toHaveCount(0);
   } finally {
      await context.request.patch(`${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`, {
         data: { projectId: fixture.projectId },
      });
   }
});
