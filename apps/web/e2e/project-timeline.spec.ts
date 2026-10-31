import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   email: string;
   password: string;
   projectId: string;
   team_id: string;
};
const api = 'http://localhost:4000/api/v1';

// The project Timeline peek panel shows status and priority like the issue lists, and a new
// schedule saved in the panel moves the bar without a reload.
// VI: Panel xem nhanh của Timeline dự án hiển thị trạng thái và độ ưu tiên giống danh sách issue,
// VI: và lịch mới lưu trong panel làm thanh timeline đổi ngay, không cần tải lại.
test('project timeline panel shows status and priority icons and redraws the bar on save', async ({
   page,
   context,
}) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const created = await context.request.post(`${api}/issues`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: fixture.team_id,
         projectId: fixture.projectId,
         title: `Timeline ${Date.now()}`,
         priority: 'HIGH',
         startDate: '2026-11-02',
         targetDate: '2026-11-10',
      },
   });
   expect(created.ok(), await created.text()).toBeTruthy();
   const issue = (await created.json()).data;
   try {
      await page.goto(`/${fixture.slug}/project/${fixture.projectId}/timeline`);
      const bar = page.getByRole('button', { name: new RegExp(`^${issue.identifier} · `) });
      await expect(bar).toHaveAccessibleName(/Nov 2 – Nov 10$/);
      await bar.click();

      const priority = page.getByTitle('Change priority');
      await expect(priority).toHaveText('High');
      // Each row starts with its glyph, as in the issue lists. VI: Mỗi dòng có biểu tượng như danh sách issue.
      for (const label of ['Status', 'Priority'])
         await expect(
            page
               .locator('div', { has: page.getByText(label, { exact: true }) })
               .locator('svg')
               .first()
         ).toBeVisible();

      await page.getByTitle('Change start and end dates').click();
      await page.getByLabel('End date').fill('2026-12-20');
      const saved = page.waitForResponse(
         (response) =>
            response.url().startsWith(`${api}/issues/${issue.id}`) &&
            response.request().method() === 'PATCH'
      );
      await page.getByRole('button', { name: 'Save dates' }).click();
      expect((await saved).ok()).toBeTruthy();
      await expect(bar).toHaveAccessibleName(/Nov 2 – Dec 20$/);
   } finally {
      await context.request.delete(`${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`);
   }
});
