import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   userId: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1';

// Team roles (DTD-918) on a throwaway team, so other specs running in parallel keep their roles.
// VI: Vai trò team (DTD-918) trên một team tạm, để các spec chạy song song giữ nguyên vai trò.
test('a team Bot is badged and a team Viewer reads issues without edit controls', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const identifier = `TV${Date.now().toString().slice(-7)}${testInfo.workerIndex}`;
   const created = await context.request.post(`${api}/teams`, {
      data: { workspaceId: fixture.workspace_id, name: `Roles ${identifier}`, identifier },
   });
   expect(created.ok(), await created.text()).toBeTruthy();
   const team = (await created.json()).data;
   const setRole = async (role: string) => {
      const response = await context.request.patch(
         `${api}/teams/${team.id}/members/${fixture.userId}?workspaceId=${fixture.workspace_id}`,
         { data: { role } }
      );
      expect(response.ok(), await response.text()).toBeTruthy();
   };
   try {
      const issueResponse = await context.request.post(`${api}/issues`, {
         data: { workspaceId: fixture.workspace_id, teamId: team.id, title: `Viewer ${identifier}` },
      });
      expect(issueResponse.ok(), await issueResponse.text()).toBeTruthy();
      const issue = (await issueResponse.json()).data;

      await setRole('BOT');
      await page.goto(`/${fixture.slug}/team/${identifier}/members`);
      await expect(page.getByText(fixture.email, { exact: true })).toBeVisible();
      await expect(page.getByText('Bot', { exact: true }).first()).toBeVisible();

      await setRole('VIEWER');
      const refused = await context.request.patch(
         `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`,
         { data: { title: 'Renamed by a viewer' } }
      );
      expect(refused.status()).toBe(403);
      await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
      await expect(page.getByRole('note')).toContainText(/Viewer/);
      await expect(page.getByRole('button', { name: /Edit description|Sửa mô tả/ })).toBeDisabled();
   } finally {
      await context.request.delete(`${api}/teams/${team.id}?workspaceId=${fixture.workspace_id}`);
   }
});
