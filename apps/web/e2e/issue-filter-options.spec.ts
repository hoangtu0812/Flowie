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
