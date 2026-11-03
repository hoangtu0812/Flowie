import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
let createdIssueIds: string[] = [];

// Cleanup has its own budget so a timed-out drag cannot leave children on the shared fixture.
// VI: Dọn dữ liệu có ngân sách riêng để thao tác kéo hết giờ không để lại task con trên fixture dùng chung.
test.afterEach(async ({ context }) => {
   test.setTimeout(30000);
   const ids = createdIssueIds;
   createdIssueIds = [];
   for (const id of ids.reverse()) {
      const response = await context.request.delete(
         `${api}/issues/${id}?workspaceId=${fixture.workspace_id}`
      );
      expect(response.ok()).toBeTruthy();
   }
});

test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
});
async function manual(page: Page) {
   await page.getByRole('button', { name: /^Display(?: options)?$/ }).click();
   await page
      .getByRole('combobox')
      .filter({ hasText: /Priority|Start date|Created|Title/ })
      .first()
      .click();
   await page.getByRole('option', { name: 'Manual', exact: true }).click();
   await page.keyboard.press('Escape');
}

test('manual issue order supports drag, keyboard and reload', async ({ page }, testInfo) => {
   await page.goto(`/${fixture.slug}/issues`);
   await expect(
      page.getByRole('link', { name: fixture.issues[0].title, exact: true })
   ).toBeVisible();
   await expect(page.getByRole('button', { name: /^Reorder / })).toHaveCount(0);
   await manual(page);
   const rows = page.locator('[data-order-id]');
   await expect(rows).toHaveCount(2);
   const ids = await rows.evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-order-id'))
   );
   const source = fixture.issues.find((item: { id: string }) => item.id === ids[1]);
   const target = rows.first();
   const saved = page.waitForResponse(
      (response) =>
         response.url().endsWith('/manual-order') && response.request().method() === 'POST'
   );
   await page
      .getByRole('button', { name: `Reorder ${source.identifier}`, exact: true })
      .dragTo(target, { steps: 12, targetPosition: { x: 80, y: 2 } });
   expect((await saved).ok()).toBeTruthy();
   await expect(rows.first()).toHaveAttribute('data-order-id', source.id);
   await page.reload();
   await expect(rows.first()).toHaveAttribute('data-order-id', source.id);
   await page.getByRole('button', { name: `Move down ${source.identifier}`, exact: true }).click();
   await expect(rows.first()).toHaveAttribute('data-order-id', ids[0]!);
   await page.screenshot({ path: testInfo.outputPath('manual-issues.png'), fullPage: true });
});

test('manual project order persists after keyboard moves', async ({ page, context }) => {
   const response = await context.request.post(`${api}/projects`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: fixture.team_id,
         name: 'Another order project',
         identifier: `O${Date.now().toString(36).slice(-7).toUpperCase()}`,
      },
   });
   expect(response.ok()).toBeTruthy();
   const project = (await response.json()).data;
   try {
      await page.goto(`/${fixture.slug}/projects`);
      await manual(page);
      const rows = page.locator('[data-order-id]');
      await expect(rows).toHaveCount(2);
      const id = await rows.last().getAttribute('data-order-id');
      await page
         .getByRole('button', {
            name: `Move up ${id === project.id ? project.name : 'Regression project'}`,
            exact: true,
         })
         .click();
      await expect(rows.first()).toHaveAttribute('data-order-id', id!);
      await page.reload();
      await expect(rows.first()).toHaveAttribute('data-order-id', id!);
      const target = rows.last();
      const box = await target.boundingBox();
      const saved = page.waitForResponse(
         (response) =>
            response.url().endsWith('/manual-order') && response.request().method() === 'POST'
      );
      await page
         .getByRole('button', {
            name: `Reorder ${id === project.id ? project.name : 'Regression project'}`,
            exact: true,
         })
         .dragTo(target, { steps: 12, targetPosition: { x: 80, y: box!.height - 2 } });
      expect((await saved).ok()).toBeTruthy();
      await expect(rows.last()).toHaveAttribute('data-order-id', id!);
   } finally {
      await context.request.delete(
         `${api}/projects/${project.id}?workspaceId=${fixture.workspace_id}`
      );
   }
});

test('sub-issues reorder among siblings and retain nested children', async ({ page, context }) => {
   const ids = createdIssueIds;
   const create = async (title: string, parentIssueId: string) => {
      const response = await context.request.post(`${api}/issues`, {
         data: {
            workspaceId: fixture.workspace_id,
            teamId: fixture.team_id,
            projectId: fixture.projectId,
            parentIssueId,
            title,
         },
      });
      expect(response.ok()).toBeTruthy();
      const issue = (await response.json()).data;
      ids.push(issue.id);
      return issue;
   };
   {
      const parent = fixture.issues[0];
      const a = await create('Manual child A', parent.id),
         b = await create('Manual child B', parent.id);
      const nested = await create('Manual grandchild', a.id);
      await page.goto(`/${fixture.slug}/issue/${parent.identifier}`);
      const rows = page.getByTestId('sub-issue-row');
      await expect(rows).toHaveCount(3);
      const order = await rows.allTextContents();
      const rootOrder = order.filter(
         (text) => text.includes(a.identifier) || text.includes(b.identifier)
      );
      const moved = rootOrder[1].includes(b.identifier) ? b : a;
      await page.getByRole('button', { name: `Move up ${moved.identifier}`, exact: true }).click();
      await expect(rows.first()).toContainText(moved.identifier);
      await page.reload();
      await expect(rows.first()).toContainText(moved.identifier);
      const other = moved.id === a.id ? b : a;
      const target = page.locator(`[data-order-id="${other.id}"]`);
      const box = await target.boundingBox();
      const saved = page.waitForResponse(
         (response) =>
            response.url().endsWith('/manual-order') && response.request().method() === 'POST'
      );
      // Intermediate pointer moves activate native dragging before entering the adjacent row.
      // VI: Các bước di chuyển con trỏ trung gian kích hoạt kéo native trước khi vào hàng liền kề.
      await page
         .getByRole('button', { name: `Reorder ${moved.identifier}`, exact: true })
         .dragTo(target, { steps: 12, targetPosition: { x: 80, y: box!.height - 2 } });
      expect((await saved).ok()).toBeTruthy();
      await expect(rows.first()).toContainText(other.identifier);
      const detail = (
         await (
            await context.request.get(
               `${api}/issues/${nested.id}?workspaceId=${fixture.workspace_id}`
            )
         ).json()
      ).data;
      expect(detail.parentIssueId).toBe(a.id);
   }
});
