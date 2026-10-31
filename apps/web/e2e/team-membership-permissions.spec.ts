import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';

test('only workspace owners see join and add-member actions', async ({
   page,
   context,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const name = `Owner-managed ${testInfo.project.name} ${Date.now()}`;
   const created = await context.request.post(`${api}/teams`, {
      data: {
         workspaceId: fixture.workspace_id,
         name,
         identifier: `TJ${Date.now().toString().slice(-8)}`,
      },
   });
   expect(created.ok(), await created.text()).toBeTruthy();
   const team = (await created.json()).data;
   const left = await context.request.post(
      `${api}/teams/${team.id}/leave?workspaceId=${fixture.workspace_id}`
   );
   expect(left.ok(), await left.text()).toBeTruthy();
   let role = 'MEMBER';
   // Exercise visibility for each role; API tests independently verify real authorization.
   await page.route(`${api}/workspaces/me`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data = body.data.map((item: { workspace: { id: string } }) =>
         item.workspace.id === fixture.workspace_id ? { ...item, role } : item
      );
      await route.fulfill({ response, json: body });
   });
   try {
      for (const currentRole of ['MEMBER', 'ADMIN']) {
         role = currentRole;
         await page.goto(`/${fixture.workspace_id}/teams`);
         await expect(page.getByText(name, { exact: true })).toBeVisible();
         await expect(page.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0);
         await expect(page.getByText('Owner managed', { exact: true })).toBeVisible();
         await page.goto(`/${fixture.workspace_id}/settings/teams/new`);
         await expect(page.getByText(name, { exact: true })).toBeVisible();
         await expect(page.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0);
         await page.goto(`/${fixture.workspace_id}/team/GEN/members`);
         await expect(page.getByText(fixture.email, { exact: true })).toBeVisible();
         await expect(page.getByRole('button', { name: 'Add a member', exact: true })).toHaveCount(
            0
         );
      }
      role = 'OWNER';
      await page.goto(`/${fixture.workspace_id}/teams`);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      // Joined teams open their Members page from the Teams list and the sidebar; unjoined teams stay plain text.
      // VI: Team đã tham gia mở trang Members từ danh sách Teams và sidebar; team chưa tham gia chỉ là chữ thường.
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
      await page
         .getByRole('link', { name: /^.+ members \(\d+\)$/ })
         .first()
         .click();
      await expect(page).toHaveURL(/\/team\/[^/]+\/members$/);
      await expect(page.getByText(fixture.email, { exact: true })).toBeVisible();
      await expect(page.locator('a[href*="/team/"][href$="/members"]').first()).toBeVisible();
      await page.goto(`/${fixture.workspace_id}/teams`);
      const joined = page.waitForResponse(
         (response) =>
            response.url().includes(`/teams/${team.id}/join`) &&
            response.request().method() === 'POST'
      );
      await page.getByRole('button', { name: 'Join', exact: true }).click();
      expect((await joined).ok()).toBeTruthy();
      await expect(page.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0);
      await page.goto(`/${fixture.workspace_id}/team/GEN/members`);
      await page.getByRole('button', { name: 'Add a member', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Add a team member' })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.goto(`/${fixture.workspace_id}/settings/teams/${fixture.team_id}`);
      await expect(page.getByText('Owner managed', { exact: true })).toBeVisible();
      await expect(page.getByText('Open', { exact: true })).toHaveCount(0);
      await page.waitForLoadState('networkidle');
   } finally {
      await page.unrouteAll({ behavior: 'wait' });
      await context.request.delete(`${api}/teams/${team.id}?workspaceId=${fixture.workspace_id}`);
   }
});
