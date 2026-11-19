import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   projectId: string;
   issues: { id: string; identifier: string; title: string }[];
};
const api = 'http://localhost:4000/api/v1';

test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
});

// A milestone added on the project is picked on an issue of that project, survives a reload,
// shows its progress in the project panel, and its title there opens the issues filtered by it.
// The title carries a stamp so browser projects sharing the database never collide; the test
// clears the issue's milestone at the end.
// VI: Milestone thêm ở dự án được chọn trên issue của dự án đó, còn sau khi tải lại, hiện tiến độ
// VI: trong panel dự án, và tên ở đó mở danh sách issue lọc theo nó. Tên kèm dấu thời gian để các
// VI: project trình duyệt dùng chung database không trùng; cuối test gỡ milestone khỏi issue.
test('issues carry a milestone of their project and the project shows its progress', async ({
   page,
}) => {
   const title = `Beta ${Date.now()}`;
   const issue = fixture.issues[0];
   const overview = `/${fixture.slug}/project/${fixture.projectId}/overview`;

   await page.goto(overview);
   await page.getByRole('button', { name: 'Add milestone' }).click();
   await page.getByRole('textbox', { name: 'Name' }).fill(title);
   await page.getByRole('button', { name: 'Create milestone' }).click();
   await expect(page.getByRole('link', { name: title })).toBeVisible();

   const pick = async (name: string) => {
      const saved = page.waitForResponse(
         (response) =>
            response.url().startsWith(`${api}/issues/${issue.id}?`) &&
            response.request().method() === 'PATCH' &&
            response.ok()
      );
      await page.getByRole('menuitem', { name }).click();
      await saved;
   };

   // A failed earlier attempt may have left its own milestone on the issue, so the picker opens
   // from either label. VI: Lần chạy lỗi trước có thể để lại milestone của nó trên issue, nên picker
   // mở được từ cả hai nhãn.
   await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
   await page.getByRole('button', { name: /^(Add to milestone|Beta \d+)$/ }).click();
   await pick(title);
   await page.reload();
   await expect(page.getByRole('button', { name: title })).toBeVisible();

   await page.goto(overview);
   const row = page.getByRole('link', { name: title });
   await expect(page.getByRole('progressbar', { name: `${title} progress` })).toBeVisible();
   await row.click();
   await expect(page).toHaveURL(/\/issues\?filters=/);
   // The row link, not any text: a hidden element elsewhere also carries the title.
   // VI: Dùng link của dòng, không dùng text bất kỳ: một phần tử ẩn ở chỗ khác cũng chứa tiêu đề.
   await expect(page.getByRole('link', { name: issue.title, exact: true })).toBeVisible();

   await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
   await page.getByRole('button', { name: title }).click();
   await pick('No milestone');
   await expect(page.getByRole('button', { name: 'Add to milestone' })).toBeVisible();
});
