import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   projectId: string;
   issues: { identifier: string; title: string }[];
};

// Each screen names its tab, objects by their own name, and Back restores the previous title
// instead of keeping the last one.
// VI: Mỗi màn hình đặt title riêng cho tab, đối tượng theo tên của chính nó, và Back trả lại title
// VI: của trang trước thay vì giữ title cuối cùng.
test('browser tab titles follow the screen and its object', async ({ page }) => {
   await page.goto('/auth/login');
   await expect(page).toHaveTitle('Log in | Flowie');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const issue = fixture.issues[0];
   await page.goto(`/${fixture.slug}/issue/${issue.identifier}?from=project`);
   await expect(page).toHaveTitle(`${issue.identifier} | Issue: ${issue.title} | Flowie`);

   await page.goto(`/${fixture.slug}/project/${fixture.projectId}/overview`);
   await expect(page).toHaveTitle(/^.+ - Overview \| Flowie$/);
   const projectTitle = await page.title();
   expect(projectTitle).not.toContain(issue.title);

   await page.goto(`/${fixture.slug}/settings/audit`);
   await expect(page).toHaveTitle(/^Audit log - Workspace settings - .+ \| Flowie$/);

   await page.goBack();
   await expect(page).toHaveTitle(projectTitle);
});
