import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   workspace_id: string;
};
const api = 'http://localhost:4000/api/v1';

// An owner reaches News from the sidebar, creates a group, is refused a feed outside the host
// allowlist, adds an allowlisted feed, disables it and deletes the group with its sources. No feed
// is downloaded: the test never presses "Fetch now".
// VI: Owner mở News từ sidebar, tạo nhóm, bị từ chối feed ngoài allowlist host, thêm feed hợp lệ,
// VI: tắt nguồn và xoá nhóm cùng các nguồn. Không tải feed nào: test không bấm "Fetch now".
test('owners manage news groups and allowlisted sources', async ({ page, context }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   await page.getByRole('link', { name: 'News', exact: true }).first().click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/news$`));
   await expect(page.getByRole('button', { name: 'Fetch now' })).toBeVisible();

   // Sort and risk filter chips toggle without an AI provider; unlabelled items simply drop out.
   // VI: Chip sắp xếp và lọc rủi ro bật/tắt được khi không có provider AI; tin chưa có nhãn bị lọc ra.
   await page.getByRole('button', { name: 'Highest risk' }).click();
   await expect(page.getByRole('button', { name: 'Highest risk' })).toHaveAttribute(
      'aria-pressed',
      'true'
   );
   await page.getByRole('button', { name: 'Critical' }).click();
   await expect(page.getByRole('button', { name: 'Critical' })).toHaveAttribute(
      'aria-pressed',
      'true'
   );
   await page.getByRole('button', { name: 'Critical' }).click();
   await expect(page.getByRole('button', { name: 'Critical' })).toHaveAttribute(
      'aria-pressed',
      'false'
   );

   const group = `Security ${Date.now()}`;
   await page.getByRole('button', { name: 'Manage sources' }).click();
   const dialog = page.getByRole('dialog');
   await dialog.getByLabel('Group name').fill(group);
   await dialog.getByRole('button', { name: 'Add group' }).click();
   const section = dialog.getByRole('region', { name: group });
   await expect(section).toContainText('No Teams channel');

   await section.getByLabel('Source name').fill('Internal');
   await section.getByLabel('Feed URL (RSS/Atom)').fill('http://127.0.0.1/feed');
   await section.getByRole('button', { name: 'Add source' }).click();
   await expect(page.getByText(/allowed news host/)).toBeVisible();
   await expect(section.getByRole('listitem')).toHaveCount(0);

   await section.getByLabel('Feed URL (RSS/Atom)').fill('https://www.bleepingcomputer.com/feed/');
   await section.getByRole('button', { name: 'Add source' }).click();
   await expect(section.getByRole('listitem')).toHaveCount(1);
   await expect(section).toContainText('Not fetched yet');

   await section.getByRole('switch', { name: 'Enabled: Internal' }).click();
   await expect(section.getByRole('switch', { name: 'Enabled: Internal' })).not.toBeChecked();

   const webhook = await context.request.patch(
      `${api}/news/categories/unknown?workspaceId=${fixture.workspace_id}`,
      { data: { webhookUrl: 'https://example.com/hook' } }
   );
   expect(webhook.status()).toBe(400);

   page.once('dialog', (confirm) => void confirm.accept());
   await section.getByRole('button', { name: 'Delete group' }).click();
   await expect(dialog.getByRole('region', { name: group })).toHaveCount(0);
});
