import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';

test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
});

// The All issues filter lists the workspace's real members and projects, and
// picking one filters the loaded issues by its id.
// VI: Filter ở All issues liệt kê thành viên và dự án thật của workspace, và
// chọn một mục sẽ lọc task đã tải theo id của mục đó.
test('All issues filter offers real assignees and projects', async ({ page }) => {
   const options = page.waitForResponse(
      (response) => response.url().startsWith(`${api}/issues/options?`) && response.ok()
   );
   await page.goto(`/${fixture.slug}/issues`);
   await options;
   await expect(page.getByRole('link', { name: 'Assigned regression task' })).toBeVisible();
   await expect(page.getByRole('link', { name: 'Unassigned regression bug' })).toBeVisible();

   const openSection = async (name: string) => {
      await page.getByRole('button', { name: 'Filter', exact: true }).click();
      await page.getByRole('option', { name, exact: true }).click();
   };

   await openSection('Project');
   await expect(page.getByRole('option', { name: 'Regression project' })).toBeVisible();
   await expect(page.getByRole('option', { name: 'LNDev UI - Core Components' })).toHaveCount(0);
   await page.keyboard.press('Escape');

   await openSection('Assignee');
   await expect(page.getByRole('option', { name: 'Unassigned' })).toBeVisible();
   await expect(page.getByRole('option', { name: 'leonel.ngoya' })).toHaveCount(0);
   await page.getByRole('option', { name: 'Regression Owner' }).click();
   await page.keyboard.press('Escape');
   await expect(page.getByRole('link', { name: 'Unassigned regression bug' })).toHaveCount(0);
   await expect(page.getByRole('link', { name: 'Assigned regression task' })).toBeVisible();
});

// Status, Labels and Cycle list the workspace's real workflow, labels and
// cycles; a Status filter is applied by the API, survives a reload through the
// `?filters=` URL state, and Clear removes it.
// VI: Status, Labels và Cycle liệt kê workflow, nhãn và cycle thật của
// workspace; bộ lọc Status được API áp dụng, giữ nguyên khi tải lại nhờ URL
// `?filters=`, và Clear bỏ bộ lọc.
test('All issues filter applies real statuses, keeps them in the URL and clears', async ({
   page,
}) => {
   const options = page.waitForResponse(
      (response) => response.url().startsWith(`${api}/issues/options?`) && response.ok()
   );
   await page.goto(`/${fixture.slug}/issues`);
   await options;
   const assigned = page.getByRole('link', { name: 'Assigned regression task' });
   const unassigned = page.getByRole('link', { name: 'Unassigned regression bug' });
   await expect(assigned).toBeVisible();

   const openSection = async (name: string) => {
      await page.getByRole('button', { name: 'Filter', exact: true }).first().click();
      await page.getByRole('option', { name, exact: true }).click();
   };

   await openSection('Labels');
   await expect(page.getByRole('option', { name: 'UI Enhancement' })).toHaveCount(0);
   await page.keyboard.press('Escape');

   await openSection('Cycle');
   await expect(page.getByRole('option', { name: 'No cycle' })).toBeVisible();
   await expect(page.getByRole('option', { name: /^Cycle 2[0-9]/ })).toHaveCount(0);
   await page.keyboard.press('Escape');

   // The seeded issues are in the workspace's "Todo" status; a mock status id
   // would match neither of them.
   // VI: Task mẫu ở trạng thái "Todo" của workspace; id trạng thái mẫu sẽ không
   // khớp task nào.
   const filtered = page.waitForResponse(
      (response) =>
         response.url().startsWith(`${api}/issues?`) &&
         response.url().includes('filters=') &&
         response.ok()
   );
   await openSection('Status');
   await page.getByRole('option', { name: 'Todo', exact: true }).click();
   await page.keyboard.press('Escape');
   await filtered;
   await expect(page).toHaveURL(/filters=/);
   await expect(assigned).toBeVisible();
   await expect(unassigned).toBeVisible();

   await page.reload();
   await expect(page).toHaveURL(/filters=/);
   await expect(assigned).toBeVisible();

   await openSection('Status type');
   await page.getByRole('option', { name: 'Completed', exact: true }).click();
   await page.keyboard.press('Escape');
   await expect(assigned).toHaveCount(0);
   await expect(unassigned).toHaveCount(0);

   await page.getByRole('button', { name: 'Clear' }).click();
   await expect(page).not.toHaveURL(/filters=/);
   await expect(assigned).toBeVisible();
   await expect(unassigned).toBeVisible();
});
