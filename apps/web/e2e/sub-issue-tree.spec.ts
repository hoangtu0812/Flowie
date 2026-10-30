import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   projectId: string;
   workspace_id: string;
   team_id: string;
};
const api = 'http://localhost:4000/api/v1';

type Created = { id: string; identifier: string; title: string };

// A goal → step → two leaves tree shows every level on the goal page with per-row progress,
// collapses and expands a branch, saves a leaf due date and status in place (the status raises the
// step's progress), and the list row of the goal shows its direct sub-issue progress chip.
// VI: Cây mục tiêu → bước → hai lá hiện đủ mọi cấp ở trang mục tiêu với tiến độ từng hàng, thu và
// VI: mở một nhánh, lưu due date và trạng thái của lá ngay tại chỗ (trạng thái làm tăng tiến độ của
// VI: bước), và hàng của mục tiêu trên danh sách hiện chip tiến độ sub-issue trực tiếp.
test('the sub-issue tree shows nested levels with progress and in-place due dates', async ({
   page,
   context,
}) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const stamp = Date.now();
   const created: Created[] = [];
   const create = async (name: string, parentIssueId?: string) => {
      const response = await context.request.post(`${api}/issues`, {
         data: {
            workspaceId: fixture.workspace_id,
            teamId: fixture.team_id,
            projectId: fixture.projectId,
            title: `Tree ${name} ${stamp}`,
            parentIssueId,
         },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const issue = (await response.json()).data as Created;
      created.push(issue);
      return issue;
   };

   try {
      const goal = await create('Goal');
      const step = await create('Step', goal.id);
      const leaf = await create('Leaf', step.id);
      await create('Leaf two', step.id);

      await page.goto(`/${fixture.slug}/issue/${goal.identifier}`);
      await expect(page.getByRole('heading', { name: goal.title, exact: true })).toBeVisible();
      const rows = page.getByTestId('sub-issue-row');
      await expect(rows).toHaveCount(3);
      await expect(rows.filter({ hasText: step.title })).toContainText('0/2');

      await page.getByRole('button', { name: `Collapse ${step.identifier}` }).click();
      await expect(rows).toHaveCount(1);
      await page.getByRole('button', { name: 'Expand all' }).click();
      await expect(rows).toHaveCount(3);

      const leafRow = rows.filter({ hasText: leaf.title });
      await leafRow.getByTitle('Edit due date').click();
      await page.getByRole('dialog').locator('input[type="date"]').fill('2030-01-15');
      await expect(leafRow).toContainText('Jan 15');
      await page.reload();
      await expect(rows.filter({ hasText: leaf.title })).toContainText('Jan 15');

      await page.getByRole('button', { name: `Change status of ${leaf.identifier}` }).click();
      await page.getByRole('menuitem', { name: 'Done', exact: true }).click();
      await expect(rows.filter({ hasText: step.title })).toContainText('1/2');
      await page.reload();
      await expect(rows.filter({ hasText: step.title })).toContainText('1/2');

      await page.goto(`/${fixture.slug}/project/${fixture.projectId}/issues`);
      const goalLine = page.getByRole('link', { name: new RegExp(goal.title) });
      await expect(goalLine.getByTestId('sub-issue-progress')).toHaveText('0/1');
   } finally {
      for (const issue of created.reverse()) {
         await context.request.delete(
            `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`
         );
      }
   }
});
