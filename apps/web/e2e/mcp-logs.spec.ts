import { expect, test, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   workspace_id: string;
   team_id: string;
};
const origin = 'http://localhost:4000';
const api = `${origin}/api/v1`;

// Letters only: the API replaces digits in error messages when it groups Top errors, so a
// numeric suffix would merge this run's group with earlier runs in the shared database.
// VI: Chỉ dùng chữ cái: API thay chữ số trong thông báo lỗi khi gom Top errors, nên hậu tố
// VI: số sẽ gộp nhóm của lần chạy này với các lần chạy trước trong database dùng chung.
const letters = (length: number) =>
   Array.from({ length }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');

async function callTool(
   request: APIRequestContext,
   token: string,
   name: string,
   args: Record<string, unknown>
) {
   const call = await request.post(`${origin}/mcp/`, {
      headers: {
         'Authorization': `Bearer ${token}`,
         'Accept': 'application/json, text/event-stream',
         'MCP-Protocol-Version': '2025-11-25',
      },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
   });
   expect(call.ok()).toBeTruthy();
   expect((await call.json()).result.isError).toBe(true);
}

// An AI client makes two calls rejected for the same credential-like extra argument (on
// different issues) and one call for an issue outside its scope. The owner filters the call
// log from the tiles, from the Top errors group and from the By tool table, and expands a
// failed call: status and error are shown, the credential value is not.
// VI: Một AI client gọi hai lần bị từ chối vì cùng một tham số thừa giống thông tin xác thực
// VI: (trên hai issue khác nhau) và một lần đọc issue ngoài phạm vi. Owner lọc Call log từ các
// VI: ô số liệu, từ nhóm Top errors và từ bảng By tool, rồi mở rộng một lời gọi lỗi: thấy mã
// VI: và lỗi, không thấy giá trị thông tin xác thực.
test('MCP logs filter the call log from tiles, Top errors and the tool table', async ({
   page,
   context,
}) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const scope = new URLSearchParams({ workspaceId: fixture.workspace_id });
   const created = await context.request.post(`${api}/mcp/connections?${scope}`, {
      data: {
         name: `MCP logs ${Date.now()}`,
         scopes: ['issues:read'],
         teamIds: [fixture.team_id],
         projectIds: [],
         expiresInDays: 1,
      },
   });
   expect(created.status()).toBe(201);
   const connection = (await created.json()).data as { id: string; token: string };
   const secretField = `apiToken${letters(10)}`;
   try {
      for (const issueId of ['missing-one', 'missing-two'])
         await callTool(context.request, connection.token, 'get_issue', {
            issueId,
            [secretField]: 'e2e-secret-value',
         });
      await callTool(context.request, connection.token, 'get_issue', { issueId: 'missing' });

      await page.goto(`/${fixture.slug}/settings/integrations`);
      await page.getByRole('link', { name: 'View MCP logs' }).click();
      await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/settings/mcp-logs$`));
      await expect(page.getByRole('heading', { name: 'MCP logs', level: 1 })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Calls' })).toBeVisible();

      const log = page.getByRole('region', { name: 'Call log' });
      const outcome = log.getByRole('radiogroup', { name: 'Outcome' });
      // Call rows are the collapsible triggers; each starts with a status dot.
      // VI: Dòng log là nút mở rộng; mỗi nút bắt đầu bằng chấm trạng thái.
      const rows = log.getByRole('button').filter({ has: page.getByRole('img') });

      // Tiles set the outcome filter; the log then holds only that outcome. A pointer click
      // lands on the card surface (its accessible button is visually hidden).
      // VI: Ô số liệu đặt bộ lọc kết quả; log khi đó chỉ còn kết quả đó. Click chuột rơi vào
      // VI: bề mặt thẻ (nút accessible của thẻ bị ẩn về mặt hiển thị).
      await expect(page.getByRole('button', { name: 'Show failed calls' })).toHaveCount(1);
      await page.getByRole('group', { name: 'Failed' }).click();
      await expect(outcome.getByRole('radio', { name: 'Failed' })).toBeChecked();
      await expect(rows.first()).toBeVisible();
      await expect(log.getByRole('img', { name: 'Not found / no access' })).toHaveCount(0);
      await expect(log.getByRole('img', { name: 'Succeeded' })).toHaveCount(0);

      await page.getByRole('group', { name: 'Not found / no access' }).click();
      await expect(outcome.getByRole('radio', { name: 'Not found / no access' })).toBeChecked();
      await expect(rows.first()).toBeVisible();
      await expect(log.getByRole('img', { name: 'Failed' })).toHaveCount(0);

      // The two rejected calls differ only in the issue id, so they form one group.
      // VI: Hai lời gọi bị từ chối chỉ khác id issue, nên chúng là một nhóm.
      const group = page
         .getByRole('region', { name: 'Top errors' })
         .getByRole('listitem')
         .filter({ hasText: secretField });
      await expect(group).toHaveCount(1);
      await expect(group.getByText('2', { exact: true })).toBeVisible();
      await group.getByRole('button').click();
      await expect(log.getByText(/^Filtered by error:/)).toBeVisible();
      await expect(rows).toHaveCount(2);

      const failed = rows.first();
      await failed.click();
      const details = log.getByLabel('Call details').filter({ visible: true });
      await expect(details.getByText('Bad Request', { exact: true })).toBeVisible();
      const args = details.getByLabel('Arguments');
      await expect(args).toContainText(`"${secretField}": "[redacted]"`);
      await expect(args).not.toContainText('e2e-secret-value');
      await failed.click();
      await expect(details).toHaveCount(0);

      // The Calls tile clears the error group but keeps the group's tool; the tool button in
      // the table toggles that tool filter off and on.
      // VI: Ô Calls bỏ nhóm lỗi nhưng giữ tool của nhóm; nút tool trong bảng bật/tắt bộ lọc đó.
      await page.getByRole('group', { name: 'Calls' }).click();
      await expect(outcome.getByRole('radio', { name: 'All' })).toBeChecked();
      await expect(log.getByText(/^Filtered by error:/)).toHaveCount(0);
      const tools = page.getByRole('region', { name: 'By tool' });
      const toolFilter = log.getByRole('button', { name: 'Tool', exact: true });
      const toolButton = tools.getByRole('button', { name: 'get_issue', exact: true });
      await tools.getByRole('button', { name: /^Sort by Failed/ }).click();
      await expect(tools.getByRole('button', { name: /^Sort by Failed, sorted/ })).toBeVisible();
      await expect(toolFilter).toContainText('get_issue');
      await toolButton.click();
      await expect(toolFilter).toContainText('All tools');
      await toolButton.click();
      await expect(toolFilter).toContainText('get_issue');
      await expect(rows.first()).toBeVisible();
      await expect(rows.filter({ hasNotText: 'Get issue' })).toHaveCount(0);
   } finally {
      await context.request.delete(`${api}/mcp/connections/${connection.id}?${scope}`);
   }
});
