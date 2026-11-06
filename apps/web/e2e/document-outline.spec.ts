import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
const created: string[] = [];
test.afterEach(async ({ context }) => {
   for (const id of created.splice(0))
      await context.request.delete(`${api}/documents/${id}?workspaceId=${fixture.workspace_id}`);
});

test('the contents sidebar stays beside the text, follows the reader and collapses', async ({
   page,
   context,
}) => {
   test.setTimeout(60000);
   await page.setViewportSize({ width: 1280, height: 720 });
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const paragraph = 'Synthetic reading text for the outline. '.repeat(40);
   const sections = Array.from(
      { length: 10 },
      (_, i) => `## Section ${i + 1}\n\n${paragraph}\n\n${paragraph}`
   );
   const response = await context.request.post(`${api}/documents`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: fixture.team_id,
         title: 'Synthetic outline',
         content: `# Outline guide\n\n${sections.join('\n\n')}`,
         docType: 'GUIDE',
      },
   });
   expect(response.ok(), await response.text()).toBeTruthy();
   const document = (await response.json()).data;
   created.push(document.id);

   await page.goto(`/${fixture.slug}/documents/${document.id}`);
   const outline = page.getByTestId('document-outline');
   const reading = page.getByTestId('document-reading-area');
   await expect(outline.getByRole('navigation', { name: 'Contents' })).toBeVisible();
   // The outline sits left of the text, not above it.
   // VI: Mục lục nằm bên trái phần chữ, không nằm trên.
   const outlineBox = (await outline.boundingBox())!;
   expect(outlineBox.x + outlineBox.width).toBeLessThanOrEqual(
      (await reading.boundingBox())!.x + 1
   );

   // A jump scrolls the text only: the target heading reaches the top, the outline stays put
   // and marks the section being read.
   // VI: Nhảy mục chỉ cuộn phần chữ: heading đích lên đầu, mục lục đứng yên và đánh dấu phần
   // VI: đang đọc.
   const target = outline.getByRole('link', { name: 'Section 8', exact: true });
   await target.click();
   const heading = page.locator('#section-8');
   await expect.poll(async () => (await heading.boundingBox())!.y - outlineBox.y).toBeLessThan(120);
   await expect(target).toHaveAttribute('aria-current', 'location');
   expect((await outline.boundingBox())!.y).toBe(outlineBox.y);
   await expect(outline.getByRole('link', { name: 'Section 1', exact: true })).toBeVisible();

   // The header button hides and shows the sidebar.
   // VI: Nút trên thanh tiêu đề ẩn và hiện sidebar.
   await page.getByRole('button', { name: 'Hide contents', exact: true }).click();
   await expect(outline).toHaveCount(0);
   await page.getByRole('button', { name: 'Show contents', exact: true }).click();
   await expect(outline).toBeVisible();

   // Narrow screens open without the sidebar; opened, it floats and closes after a jump.
   // VI: Màn hình hẹp mở không có sidebar; khi mở, nó nổi trên chữ và tự đóng sau khi nhảy mục.
   await page.setViewportSize({ width: 600, height: 800 });
   await page.reload();
   await expect(page.getByRole('button', { name: 'Show contents', exact: true })).toBeVisible();
   await expect(outline).toHaveCount(0);
   await page.getByRole('button', { name: 'Show contents', exact: true }).click();
   await outline.getByRole('link', { name: 'Section 5', exact: true }).click();
   await expect(outline).toHaveCount(0);
   await expect(page.locator('#section-5')).toBeInViewport();
});
