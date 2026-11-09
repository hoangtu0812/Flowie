import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   workspace_id: string;
   team_id: string;
};
const api = 'http://localhost:4000/api/v1';

// The connections table hides revoked connections until Inactive is chosen and filters rows by
// name; the connection form groups permissions into Read and Write with a select-all each, and
// every AI client button carries its logo. Names carry a timestamp so other specs' connections
// in the shared database never match the search.
// VI: Bảng kết nối ẩn kết nối đã thu hồi cho tới khi chọn Inactive và lọc dòng theo tên; form
// VI: kết nối chia quyền thành nhóm Read và Write, mỗi nhóm có ô chọn tất cả, và mỗi nút AI
// VI: client có logo. Tên kèm mốc thời gian để kết nối của spec khác trong database dùng chung
// VI: không bao giờ khớp ô tìm kiếm.
test('MCP connections table filters by status and name; form groups permissions', async ({
   page,
   context,
}) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const suffix = String(Date.now());
   const scope = new URLSearchParams({ workspaceId: fixture.workspace_id });
   const ids: string[] = [];
   for (const name of [`Table active ${suffix}`, `Table revoked ${suffix}`]) {
      const created = await context.request.post(`${api}/mcp/connections?${scope}`, {
         data: {
            name,
            scopes: ['issues:read'],
            teamIds: [fixture.team_id],
            projectIds: [],
            expiresInDays: 1,
         },
      });
      expect(created.status()).toBe(201);
      ids.push(((await created.json()).data as { id: string }).id);
   }
   const revoked = await context.request.delete(`${api}/mcp/connections/${ids[1]}?${scope}`);
   expect(revoked.ok()).toBeTruthy();
   try {
      await page.goto(`/${fixture.slug}/settings/integrations`);
      const table = page.getByRole('table');
      await page.getByRole('textbox', { name: 'Search connections' }).fill(suffix);
      await expect(table.getByText(`Table active ${suffix}`, { exact: true })).toBeVisible();
      await expect(table.getByText(`Table revoked ${suffix}`, { exact: true })).toHaveCount(0);

      await page.getByRole('radio', { name: /^Inactive/ }).click();
      await expect(table.getByText(`Table revoked ${suffix}`, { exact: true })).toBeVisible();
      await expect(table.getByText(`Table active ${suffix}`, { exact: true })).toHaveCount(0);

      await page.getByRole('radio', { name: /^All/ }).click();
      await page.getByRole('textbox', { name: 'Search connections' }).fill(`active ${suffix}`);
      await expect(table.getByText(`Table active ${suffix}`, { exact: true })).toBeVisible();
      await expect(table.getByText(`Table revoked ${suffix}`, { exact: true })).toHaveCount(0);

      await page.getByRole('button', { name: 'New connection', exact: true }).click();
      await page.getByRole('button', { name: 'Coding project preset' }).click();
      const write = page.getByRole('group', { name: 'Write permissions' });
      await expect(
         write.getByRole('checkbox', { name: 'Select all write permissions' })
      ).toBeChecked();
      const read = page.getByRole('group', { name: 'Read permissions' });
      await read.getByRole('checkbox', { name: 'Select all read permissions' }).click();
      await expect(
         read.getByRole('checkbox', { name: 'Read comments', exact: true })
      ).not.toBeChecked();
      await expect(
         write.getByRole('checkbox', { name: 'Write comments', exact: true })
      ).toBeChecked();

      for (const client of ['Claude Code', 'Codex', 'Cursor', 'VS Code', 'Antigravity']) {
         await expect(
            page.getByRole('button', { name: client, exact: true }).locator('svg')
         ).toHaveCount(1);
      }
   } finally {
      for (const id of ids) {
         await context.request.delete(`${api}/mcp/connections/${id}?${scope}`);
      }
   }
});
