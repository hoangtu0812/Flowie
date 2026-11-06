import { expect, test, type Page, type Locator } from '@playwright/test';
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

async function dragRow(page: Page, handle: Locator, target: Locator, after = true) {
   await expect(page.locator('[data-dnd-dropping]')).toHaveCount(0);
   await expect(handle).toHaveAttribute('aria-roledescription', /.+/);
   // Earlier specs lengthen the shared fixture issue, so the rows can start below the viewport,
   // where a raw mouse press at their coordinates reaches nothing.
   // VI: Các spec trước làm issue fixture dùng chung dài ra, nên hàng có thể nằm dưới viewport,
   // VI: nơi thao tác chuột thô theo toạ độ không chạm vào phần tử nào.
   await target.scrollIntoViewIfNeeded();
   await handle.scrollIntoViewIfNeeded();
   const from = (await handle.boundingBox())!,
      to = (await target.boundingBox())!;
   const targetId = await target.getAttribute('data-order-id');
   await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
   await page.mouse.down();
   await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 4 });
   await expect(page.locator('[data-dnd-placeholder]')).toBeVisible();
   await page.mouse.move(to.x + 80, to.y + (after ? to.height - 2 : 2), { steps: 12 });
   await expect
      .poll(() =>
         handle.evaluate(
            (el, args) => {
               const source = el.closest('[data-order-id]')!;
               const target = document.querySelector(
                  `[data-order-id="${args.id}"]:not([data-dnd-placeholder])`
               )!;
               return Boolean(
                  source.compareDocumentPosition(target) &
                  (args.after ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING)
               );
            },
            { id: targetId, after }
         )
      )
      .toBe(true);
   await page.mouse.up();
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
   const dragHandle = page.getByRole('button', {
      name: `Reorder ${source.identifier}`,
      exact: true,
   });
   const from = (await dragHandle.boundingBox())!,
      to = (await target.boundingBox())!;
   await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
   await page.mouse.down();
   await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 4 });
   await expect(page.locator('[data-dnd-placeholder]')).toBeVisible();
   const placeholder = await page.locator('[data-dnd-placeholder]').boundingBox();
   expect(placeholder!.height).toBeGreaterThanOrEqual(44);
   await page.screenshot({ path: testInfo.outputPath('manual-placeholder.png'), fullPage: true });
   await page.mouse.move(to.x + 80, to.y + 2, { steps: 12 });
   // Rows swap on the frame after the pointer moves; releasing sooner keeps the old order.
   // VI: Hàng đổi chỗ ở frame sau khi con trỏ di chuyển; thả sớm hơn sẽ giữ thứ tự cũ.
   await expect(
      page.locator('[data-order-id]:not([data-dnd-placeholder])').first()
   ).toHaveAttribute('data-order-id', source.id);
   await page.mouse.up();
   expect((await saved).ok()).toBeTruthy();
   await expect(rows.first()).toHaveAttribute('data-order-id', source.id);
   await page.reload();
   await expect(rows.first()).toHaveAttribute('data-order-id', source.id);
   await expect(page.getByRole('button', { name: /^Move (up|down) / })).toHaveCount(0);
   const handle = page.getByRole('button', { name: `Reorder ${source.identifier}`, exact: true });
   await expect(page.locator('[data-dnd-dropping]')).toHaveCount(0);
   await handle.focus();
   await handle.press('Space');
   await handle.press('ArrowDown');
   await handle.press('Space');
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
            name: `Reorder ${id === project.id ? project.name : 'Regression project'}`,
            exact: true,
         })
         .focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Space');
      await expect(rows.first()).toHaveAttribute('data-order-id', id!);
      await page.reload();
      await expect(rows.first()).toHaveAttribute('data-order-id', id!);
      const target = rows.last();
      const saved = page.waitForResponse(
         (response) =>
            response.url().endsWith('/manual-order') && response.request().method() === 'POST'
      );
      await dragRow(
         page,
         page.getByRole('button', {
            name: `Reorder ${id === project.id ? project.name : 'Regression project'}`,
            exact: true,
         }),
         target
      );
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
      const nested2 = await create('Manual grandchild two', a.id);
      const options = (
         await (
            await context.request.get(
               `${api}/issues/options?workspaceId=${fixture.workspace_id}&teamId=${fixture.team_id}`
            )
         ).json()
      ).data;
      const done = options.statuses.find(
         (status: { category: string }) => status.category === 'COMPLETED'
      );
      expect(done).toBeTruthy();
      expect(
         (
            await context.request.patch(
               `${api}/issues/${b.id}?workspaceId=${fixture.workspace_id}`,
               { data: { statusId: done.id } }
            )
         ).ok()
      ).toBeTruthy();
      await page.goto(`/${fixture.slug}/issue/${parent.identifier}`);
      const rows = page.getByTestId('sub-issue-row');
      await expect(rows).toHaveCount(4);
      const order = await rows.allTextContents();
      const rootOrder = order.filter(
         (text) => text.includes(a.identifier) || text.includes(b.identifier)
      );
      const moved = rootOrder[1].includes(b.identifier) ? b : a;
      await expect(page.locator('[data-dnd-dropping]')).toHaveCount(0);
      await page.getByRole('button', { name: `Reorder ${moved.identifier}`, exact: true }).focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Space');
      await expect(rows.first()).toContainText(moved.identifier);
      await page.reload();
      await expect(rows.first()).toContainText(moved.identifier);
      const other = moved.id === a.id ? b : a;
      const target = page.locator(`[data-order-id="${other.id}"]`);
      const saved = page.waitForResponse(
         (response) =>
            response.url().endsWith('/manual-order') && response.request().method() === 'POST'
      );
      await dragRow(
         page,
         page.getByRole('button', { name: `Reorder ${moved.identifier}`, exact: true }),
         target
      );
      expect((await saved).ok()).toBeTruthy();
      await expect(rows.first()).toContainText(other.identifier);
      await page.reload();
      await expect(rows.first()).toContainText(other.identifier);
      // The test always drags the childless row across the expanded one, whichever comes first.
      // VI: Test luôn kéo hàng không có con qua hàng đang mở con, dù hàng nào đứng trước.
      const crossed = page.waitForResponse(
         (response) =>
            response.url().endsWith('/manual-order') && response.request().method() === 'POST'
      );
      await dragRow(
         page,
         page.getByRole('button', { name: `Reorder ${b.identifier}`, exact: true }),
         page.locator(`[data-order-id="${a.id}"]`),
         other.id === b.id
      );
      expect((await crossed).ok()).toBeTruthy();
      await expect(rows.first()).toContainText(moved.identifier);
      const detail = (
         await (
            await context.request.get(
               `${api}/issues/${nested.id}?workspaceId=${fixture.workspace_id}`
            )
         ).json()
      ).data;
      expect(detail.parentIssueId).toBe(a.id);
      const grandchildren = rows.filter({ hasText: /Manual grandchild/ });
      const grandchildOrder = await grandchildren.allTextContents();
      const lastGrandchild = grandchildOrder[1].includes(nested2.identifier) ? nested2 : nested;
      const nestedSaved = page.waitForResponse(
         (r) => r.url().endsWith('/manual-order') && r.request().method() === 'POST'
      );
      await expect(page.locator('[data-dnd-dropping]')).toHaveCount(0);
      await page
         .getByRole('button', { name: `Reorder ${lastGrandchild.identifier}`, exact: true })
         .focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Space');
      expect((await nestedSaved).ok()).toBeTruthy();
      await expect(grandchildren.first()).toContainText(lastGrandchild.identifier);
      await page.reload();
      await expect(grandchildren.first()).toContainText(lastGrandchild.identifier);
      expect(
         (
            await context.request
               .get(`${api}/issues/${nested2.id}?workspaceId=${fixture.workspace_id}`)
               .then((r) => r.json())
         ).data.parentIssueId
      ).toBe(a.id);
      await expect(page.locator('[data-dnd-dropping]')).toHaveCount(0);
      const sorter = page.getByRole('combobox', { name: 'Sort sub-issues', exact: true });
      const aFirst =
         options.statuses.findIndex((status: { id: string }) => status.id === a.status.id) <
         options.statuses.findIndex((status: { id: string }) => status.id === done.id);
      for (const [option, first] of [
         ['Issue ID ascending', a.identifier],
         ['Issue ID descending', b.identifier],
         ['Status ascending', aFirst ? a.identifier : b.identifier],
         ['Status descending', aFirst ? b.identifier : a.identifier],
      ]) {
         await sorter.click();
         await page.getByRole('option', { name: option, exact: true }).click();
         await expect(rows.first()).toContainText(first);
         await expect(page.getByRole('button', { name: /^Reorder / })).toHaveCount(0);
      }
      await sorter.click();
      await page.getByRole('option', { name: 'Sort: Manual', exact: true }).click();
      const handles = page.getByRole('button', { name: /^Reorder / });

      await expect(handles).toHaveCount(4);
      let writes = 0;
      page.on('request', (r) => {
         if (r.url().endsWith('/manual-order') && r.method() === 'POST') writes++;
      });
      await handles.first().focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Escape');
      expect(writes).toBe(0);
   }
});
