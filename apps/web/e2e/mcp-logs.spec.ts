import { expect, test } from '@playwright/test';
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

// An AI client sends a tool call with an argument the schema rejects and a credential-like
// field. The owner opens MCP logs from the AI connections page, filters the dashboard by the
// tool and opens the call: status and error are shown, the credential value is not.
// VI: Một AI client gửi lời gọi tool có tham số không hợp lệ và một trường giống thông tin xác
// VI: thực. Owner mở MCP logs từ trang AI connections, lọc dashboard theo tool và mở lời gọi:
// VI: thấy mã lỗi và lỗi, không thấy giá trị thông tin xác thực.
test('MCP logs show the dashboard and failed calls with masked arguments', async ({
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
   try {
      const call = await context.request.post(`${origin}/mcp/`, {
         headers: {
            'Authorization': `Bearer ${connection.token}`,
            'Accept': 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2025-11-25',
         },
         data: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
               name: 'get_issue',
               arguments: { issueId: 'missing', apiToken: 'e2e-secret-value' },
            },
         },
      });
      expect(call.ok()).toBeTruthy();
      expect((await call.json()).result.isError).toBe(true);

      await page.goto(`/${fixture.slug}/settings/integrations`);
      await page.getByRole('link', { name: 'View MCP logs' }).click();
      await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/settings/mcp-logs$`));
      await expect(page.getByRole('heading', { name: 'MCP logs', level: 1 })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Calls' })).toBeVisible();

      await page.getByRole('button', { name: /^get_issue/ }).click();
      const failed = page.getByRole('button', { name: /^Get issue.*400/ }).first();
      await failed.click();
      const details = page.getByRole('dialog');
      await expect(details.getByText('Call details')).toBeVisible();
      await expect(details.getByText('Bad Request', { exact: true })).toBeVisible();
      const args = details.getByLabel('Arguments');
      await expect(args).toContainText('"apiToken": "[redacted]"');
      await expect(args).not.toContainText('e2e-secret-value');
   } finally {
      await context.request.delete(`${api}/mcp/connections/${connection.id}?${scope}`);
   }
});
