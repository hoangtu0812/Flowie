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

// A goal → step → two leaves tree shows every level on the goal page under a row for the goal
// itself, with per-row progress, collapses and expands a branch, saves a leaf end date and status in
// place (the status raises the step's progress), flags a leaf that ends after the goal, drags the
// leaf's bar in the Timeline mode to move its dates, and the list row of the goal shows its direct
// sub-issue progress chip.
// VI: Cây mục tiêu → bước → hai lá hiện đủ mọi cấp ở trang mục tiêu dưới một hàng của chính mục
// VI: tiêu, với tiến độ từng hàng, thu và mở một nhánh, lưu ngày kết thúc và trạng thái của lá ngay
// VI: tại chỗ (trạng thái làm tăng tiến độ của bước), đánh dấu lá kết thúc sau mục tiêu, kéo thanh
// VI: của lá ở chế độ Timeline để dời ngày, và hàng của mục tiêu trên danh sách hiện chip tiến độ
// VI: sub-issue trực tiếp.
test('the sub-issue tree shows nested levels with progress, dates and a draggable timeline', async ({
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

      const patch = async (issue: Created, data: Record<string, string>) => {
         const response = await context.request.patch(
            `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`,
            { data }
         );
         expect(response.ok(), await response.text()).toBeTruthy();
      };
      await patch(goal, { startDate: '2030-01-01', targetDate: '2030-01-10' });

      await page.goto(`/${fixture.slug}/issue/${goal.identifier}`);
      await expect(page.getByRole('heading', { name: goal.title, exact: true })).toBeVisible();
      await expect(page.getByTestId('sub-issue-parent-row')).toContainText(goal.identifier);
      const rows = page.getByTestId('sub-issue-row');
      await expect(rows).toHaveCount(3);
      await expect(rows.filter({ hasText: step.title })).toContainText('0/2');

      await page.getByRole('button', { name: `Collapse ${step.identifier}` }).click();
      await expect(rows).toHaveCount(1);
      await page.getByRole('button', { name: 'Expand all' }).click();
      await expect(rows).toHaveCount(3);

      const leafRow = rows.filter({ hasText: leaf.title });
      await leafRow.getByTitle('Edit end date').click();
      await page.getByRole('dialog').locator('input[type="date"]').fill('2030-01-15');
      await expect(leafRow).toContainText('Jan 15');
      await page.reload();
      await expect(rows.filter({ hasText: leaf.title })).toContainText('Jan 15');
      // The leaf ends after the goal's Jan 10 end. VI: Lá kết thúc sau ngày 10/1 của mục tiêu.
      await expect(
         rows.filter({ hasText: leaf.title }).getByLabel(`Outside ${goal.identifier}'s dates`)
      ).toBeVisible();

      // Drag the leaf's bar about five days to the right at the Month zoom (~15.8 px a day).
      // VI: Kéo thanh của lá sang phải khoảng năm ngày ở zoom Month (~15,8 px mỗi ngày).
      await patch(leaf, { startDate: '2030-01-12' });
      await page.reload();
      await page.getByRole('button', { name: 'Timeline', exact: true }).click();
      await expect(page.getByTestId('sub-issue-timeline-row')).toHaveCount(4);
      const bar = page
         .getByTestId('sub-issue-timeline-row')
         .filter({ hasText: leaf.title })
         .getByTestId('timeline-issue-bar');
      await bar.scrollIntoViewIfNeeded();
      const box = (await bar.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await expect
         .poll(async () => {
            const response = await context.request.get(
               `${api}/issues/${leaf.id}?workspaceId=${fixture.workspace_id}`
            );
            const saved = (await response.json()).data;
            return [saved.startDate?.slice(0, 10), saved.targetDate?.slice(0, 10)];
         })
         .toEqual(['2030-01-17', '2030-01-20']);
      await page.getByRole('button', { name: 'List', exact: true }).click();

      await page.getByRole('button', { name: `Change status of ${leaf.identifier}` }).click();
      await page.getByRole('menuitem', { name: 'Done', exact: true }).click();
      await expect(rows.filter({ hasText: step.title })).toContainText('1/2');
      await page.reload();
      await expect(rows.filter({ hasText: step.title })).toContainText('1/2');

      await page.goto(`/${fixture.slug}/project/${fixture.projectId}/issues`);
      await expect(
         page.getByRole('button', { name: `Sub-issues of ${goal.identifier}` })
      ).toHaveText('0/1');
   } finally {
      for (const issue of created.reverse()) {
         await context.request.delete(
            `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`
         );
      }
   }
});
