import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
const created: string[] = [];
test.afterEach(async ({ context }) => {
   for (const id of created.splice(0))
      await context.request.delete(`${api}/documents/${id}?workspaceId=${fixture.workspace_id}`);
});

async function select(page: Page, scope: string, phrase: string) {
   await page.evaluate(
      ([scope, phrase]) => {
         const root = document.querySelector(`[data-testid="${scope}"]`)!;
         const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
         for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const start = (node as Text).data.indexOf(phrase);
            if (start < 0) continue;
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, start + phrase.length);
            getSelection()!.removeAllRanges();
            getSelection()!.addRange(range);
            return;
         }
         throw new Error(`phrase not found: ${phrase}`);
      },
      [scope, phrase]
   );
}

test('readers comment on a phrase or a line and see each other live, in view and edit mode', async ({
   page,
   context,
}) => {
   test.setTimeout(90000);
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const response = await context.request.post(`${api}/documents`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: fixture.team_id,
         title: 'Synthetic comments',
         content:
            '# Comment guide\n\nThe pump must stop within five seconds.\n\nSecond paragraph stays plain.',
         docType: 'FDS',
      },
   });
   expect(response.ok(), await response.text()).toBeTruthy();
   const document = (await response.json()).data;
   created.push(document.id);
   const url = `/${fixture.slug}/documents/${document.id}`;

   // A second reader keeps the document open to receive comments live.
   // VI: Người đọc thứ hai giữ tài liệu mở để nhận comment trực tiếp.
   const other = await context.newPage();
   await other.goto(url);
   await expect(other.getByText('The pump must stop within five seconds.')).toBeVisible();
   await page.goto(url);
   await expect(page.getByText('The pump must stop within five seconds.')).toBeVisible();

   // Selecting a phrase offers a Comment button; the comment can mention a member.
   // VI: Bôi đen một cụm chữ hiện nút Comment; comment có thể nhắc tên thành viên.
   await select(page, 'document-reading-area', 'five seconds');
   await page.getByTestId('document-comment-selection').click();
   const card = page.getByRole('dialog', { name: 'Comment thread' });
   await expect(card).toContainText('five seconds');
   const box = card.getByRole('textbox');
   await box.fill('Is five enough? @');
   await expect(card.getByRole('listbox', { name: 'Members to mention' })).toBeVisible();
   await box.press('Enter');
   await card.getByRole('button', { name: 'Send', exact: true }).click();
   await expect(card.getByTestId('document-comment-thread')).toContainText('Is five enough?');
   await expect(page.getByTestId('document-comment-marker')).toHaveText('1');

   // The other reader sees it without reloading, replies and resolves it.
   // VI: Người đọc kia thấy ngay không cần tải lại, trả lời và resolve.
   const marker = other.getByTestId('document-comment-marker');
   await expect(marker).toHaveText('1');
   await marker.click();
   const otherCard = other.getByRole('dialog', { name: 'Comment thread' });
   await expect(otherCard).toContainText('Is five enough?');
   await otherCard.getByRole('button', { name: 'Reply', exact: true }).click();
   await otherCard.getByRole('textbox').fill('Yes, per the vendor sheet.');
   await otherCard.getByRole('button', { name: 'Send', exact: true }).click();
   await expect(card).toContainText('Yes, per the vendor sheet.');
   await otherCard.getByRole('button', { name: 'Resolve', exact: true }).click();
   await expect(page.getByTestId('document-comment-marker')).toHaveCount(0);

   // Resolved threads stay listed when asked for. VI: Thread đã resolve vẫn xem được khi bật.
   await page.getByTestId('document-comments-toggle').click();
   await page.getByLabel('Show resolved').check();
   await expect(page.getByTestId('document-comment-marker')).toHaveText('1');

   // In edit mode the live preview takes comments too, from + beside a line.
   // VI: Ở chế độ Edit, phần xem trước cũng nhận comment, qua nút + cạnh dòng.
   await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
   const preview = page.getByRole('article', { name: 'Preview' });
   await preview.getByText('Second paragraph stays plain.').hover();
   await page.getByRole('button', { name: 'Comment on this line' }).click();
   const editCard = page.getByRole('dialog', { name: 'Comment thread' }).last();
   await editCard.getByRole('textbox').fill('Rename this paragraph.');
   await editCard.getByRole('button', { name: 'Send', exact: true }).click();
   await expect(editCard).toContainText('Rename this paragraph.');
   await expect(other.getByTestId('document-comment-marker')).toHaveText('1');
});
