import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
let created: string[] = [];
test.afterEach(async ({ context }) => {
   test.setTimeout(30000);
   for (const id of created)
      await context.request.delete(`${api}/issues/${id}?workspaceId=${fixture.workspace_id}`);
   created = [];
});
test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await page.goto(`/${fixture.slug}/issues`);
   await page.getByRole('button', { name: 'Create issue', exact: true }).first().click();
});

test('Rich Text Enter and toolbar save paragraphs and formatting as Markdown', async ({
   page,
}, testInfo) => {
   const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
   const field = dialog.getByRole('textbox', { name: 'Issue description', exact: true });
   await expect(dialog.getByRole('button', { name: 'Rich Text', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
   );
   await field.fill('First paragraph');
   await field.press('End');
   await field.press('Enter');
   await dialog.getByRole('button', { name: 'Bold', exact: true }).click();
   await page.keyboard.insertText('Bold second');
   await dialog.getByRole('button', { name: 'Bold', exact: true }).click();
   await field.press('Enter');
   await dialog.getByRole('button', { name: 'Italic', exact: true }).click();
   await page.keyboard.insertText('Italic third');
   await dialog.getByRole('button', { name: 'Italic', exact: true }).click();
   await field.press('Enter');
   await dialog.getByRole('button', { name: 'Bullet list', exact: true }).click();
   await page.keyboard.insertText('Bullet item');
   await dialog.getByRole('button', { name: 'Numbered list', exact: true }).click();
   await expect(field.locator('ol li')).toHaveText('Bullet item');
   await dialog.getByRole('button', { name: 'Numbered list', exact: true }).click();
   await dialog.getByRole('button', { name: 'Insert link', exact: true }).click();
   await dialog.getByRole('textbox', { name: 'Link URL', exact: true }).fill('javascript:alert(1)');
   await dialog.getByRole('button', { name: 'Apply link', exact: true }).click();
   await expect(dialog.getByText('Use an https, http, mailto or relative link.')).toBeVisible();
   await dialog.getByRole('textbox', { name: 'Link URL', exact: true }).fill('https://example.com');
   await dialog.getByRole('button', { name: 'Apply link', exact: true }).click();
   await expect(field).toBeFocused();
   await page.keyboard.insertText(' safe link');
   await dialog.getByRole('button', { name: 'Markdown', exact: true }).click();
   await expect(field).toHaveValue(/First paragraph\n\n\*\*Bold second\*\*\n\n\*Italic third\*/);
   const source = await field.inputValue();
   await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
   const preview = dialog.getByTestId('description-preview');
   await expect(preview.locator('strong')).toHaveText('Bold second');
   await expect(preview.locator('em')).toHaveText('Italic third');
   await expect(preview.getByRole('link')).toHaveAttribute('href', 'https://example.com');
   await dialog.getByRole('button', { name: 'Rich Text', exact: true }).click();
   await expect(field.locator('p').nth(0)).toHaveText('First paragraph');
   await expect(field.locator('p').nth(1)).toHaveText('Bold second');
   await expect(field.locator('p').nth(2)).toHaveText('Italic third');
   await page.setViewportSize({ width: 390, height: 844 });
   expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
   await page.screenshot({
      path: testInfo.outputPath('description-rich-mobile.png'),
      fullPage: true,
   });
   await dialog
      .getByLabel('Issue title', { exact: true })
      .fill(`Description ${testInfo.project.name}`);
   const saved = page.waitForResponse(
      (r) => r.url() === `${api}/issues` && r.request().method() === 'POST'
   );
   await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
   const issue = (await (await saved).json()).data;
   created.push(issue.id);
   expect(issue.description).toBe(source.trim());
   await expect(dialog).toHaveCount(0);
   await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
   await expect(page.locator('strong').filter({ hasText: 'Bold second' })).toBeVisible();
});

test('mode switches preserve GFM and advanced blocks and remember the last mode', async ({
   page,
}, testInfo) => {
   const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
   const field = dialog.getByRole('textbox', { name: 'Issue description', exact: true });
   const source =
      '# Heading\n\n**Tiếng Việt** and *italic*\n\n- [x] Done\n- [ ] Open\n\n| Name | Value |\n| --- | --- |\n| A | B |\n\n```ts\nconst value = 1;\n```\n\n$$\nx^2\n$$\n\n<script>window.editorUnsafe=true</script>\n\nFinal paragraph';
   await dialog.getByRole('button', { name: 'Markdown', exact: true }).click();
   await field.fill(source);
   await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
   await expect(dialog.getByTestId('description-preview').getByRole('table')).toBeVisible();
   await expect(dialog.getByTestId('description-preview').getByRole('checkbox')).toHaveCount(2);
   await dialog.getByRole('button', { name: 'Rich Text', exact: true }).click();
   await expect(field.getByRole('table')).toBeVisible();
   await expect(field.locator('[data-markdown-source]')).toHaveCount(2);
   await dialog.getByRole('button', { name: 'Markdown', exact: true }).click();
   await expect(field).toHaveValue(source);
   await dialog.getByRole('button', { name: 'Rich Text', exact: true }).click();
   await field.locator('p').filter({ hasText: 'Final paragraph' }).click();
   await page.keyboard.press('End');
   await page.keyboard.insertText(' edited');
   await dialog.getByRole('button', { name: 'Markdown', exact: true }).click();
   const edited = await field.inputValue();
   expect(edited).toContain('<script>window.editorUnsafe=true</script>');
   expect(edited).toContain('$$\nx^2\n$$');
   expect(edited).toContain('- [x] Done');
   expect(edited).toContain('const value = 1;');
   expect(edited).toContain('Final paragraph edited');
   expect(
      await page.evaluate(() => (window as unknown as { editorUnsafe?: boolean }).editorUnsafe)
   ).toBeUndefined();
   await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
   await page.screenshot({
      path: testInfo.outputPath('description-markdown-preview.png'),
      fullPage: true,
   });
   await page.keyboard.press('Escape');
   await page.reload();
   await page.getByRole('button', { name: 'Create issue', exact: true }).first().click();
   await expect(dialog.getByRole('button', { name: 'Markdown', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
   );
   await expect(field).toHaveValue('');
});

test('pasted images in Rich Text keep caret placement and upload to the new issue', async ({
   page,
   context,
}) => {
   const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
   const field = dialog.getByRole('textbox', { name: 'Issue description', exact: true });
   await field.fill('Before After');
   for (let index = 0; index < 5; index++) await field.press('ArrowLeft');
   expect(await field.evaluate(() => window.getSelection()?.anchorOffset)).toBe(7);
   await field.evaluate((element) => {
      const bytes = Uint8Array.from(
         atob(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM3sAAAAASUVORK5CYII='
         ),
         (c) => c.charCodeAt(0)
      );
      const data = new DataTransfer();
      data.items.add(new File([bytes], 'rich.png', { type: 'image/png' }));
      element.dispatchEvent(
         new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
      );
   });
   await expect(field.getByRole('img', { name: 'rich.png', exact: true })).toBeVisible();
   await dialog.getByRole('button', { name: 'Markdown', exact: true }).click();
   await expect(field).toHaveValue(/Before !\[rich.png\]\(blob:[^)]+\)After/);
   await dialog.getByLabel('Issue title', { exact: true }).fill('Rich image');
   const saved = page.waitForResponse(
      (r) => r.url() === `${api}/issues` && r.request().method() === 'POST'
   );
   await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
   const issue = (await (await saved).json()).data;
   created.push(issue.id);
   await expect(dialog).toHaveCount(0);
   const detail = (
      await (
         await context.request.get(`${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`)
      ).json()
   ).data;
   expect(detail.description).not.toContain('blob:');
   expect(detail.description).toContain('/attachments/');
   expect(detail.description).toMatch(/Before [\s\S]*rich.png[\s\S]*After/);
});
