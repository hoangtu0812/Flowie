import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   projectId: string;
   workspace_id: string;
   team_id: string;
};
const api = 'http://localhost:4000/api/v1';

type Created = { id: string; identifier: string; title: string };

// Existing issues are attached from the parent ("Add existing", with a confirmed move when the
// issue already has another parent), re-parented and removed from the child, a descendant is
// refused as parent, and an A → B → C tree opens level by level on the project timeline.
// VI: Issue có sẵn được gắn từ phía cha ("Add existing", xác nhận khi issue đang có cha khác),
// VI: đổi và gỡ cha từ phía con, hậu duệ bị từ chối làm cha, và cây A → B → C mở từng cấp trên
// VI: timeline của project.
test('existing issues can be attached, moved and detached across three levels', async ({
   page,
   context,
}) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   const stamp = Date.now();
   const created: Created[] = [];
   const create = async (name: string, parentIssueId?: string) => {
      const response = await context.request.post(`${api}/issues`, {
         data: {
            workspaceId: fixture.workspace_id,
            teamId: fixture.team_id,
            projectId: fixture.projectId,
            title: `Parenting ${name} ${stamp}`,
            parentIssueId,
         },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const issue = (await response.json()).data as Created;
      created.push(issue);
      return issue;
   };
   const open = async (issue: Created) => {
      await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
      await expect(page.getByRole('heading', { name: issue.title, exact: true })).toBeVisible();
   };
   const pick = async (target: Page, issue: Created) => {
      const dialog = target.getByRole('dialog');
      await dialog.getByRole('textbox', { name: 'Search issues' }).fill(issue.identifier);
      await dialog.getByRole('listitem').filter({ hasText: issue.title }).click();
      return dialog;
   };
   const subIssueLink = (issue: Created) =>
      page.getByRole('link', { name: new RegExp(issue.title) });

   try {
      const a = await create('A');
      const b = await create('B');
      const c = await create('C', b.id);
      const d = await create('D');

      await open(a);
      await page.getByRole('button', { name: 'Add existing', exact: true }).click();
      await pick(page, b);
      await expect(subIssueLink(b)).toBeVisible();

      await open(d);
      await page.getByRole('button', { name: 'Add existing', exact: true }).click();
      const confirm = await pick(page, b);
      await expect(
         confirm.getByText(`${b.identifier} is a sub-issue of ${a.identifier}`)
      ).toBeVisible();
      await confirm.getByRole('button', { name: 'Move', exact: true }).click();
      await expect(subIssueLink(b)).toBeVisible();

      await open(b);
      await expect(page.getByText('Sub-issue of')).toBeVisible();
      await expect(page.getByRole('link', { name: new RegExp(d.title) })).toBeVisible();
      await expect(subIssueLink(c)).toBeVisible();
      await page.getByRole('button', { name: 'Change parent', exact: true }).click();
      await pick(page, a);
      await expect(page.getByRole('link', { name: new RegExp(a.title) })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('link', { name: new RegExp(a.title) })).toBeVisible();

      await open(a);
      await page.getByRole('button', { name: 'Set parent', exact: true }).click();
      await pick(page, c);
      await expect(
         page.getByText('An issue cannot be moved under its own sub-issue.')
      ).toBeVisible();
      await page.keyboard.press('Escape');

      await page.goto(`/${fixture.slug}/project/${fixture.projectId}/timeline`);
      await page.getByRole('button', { name: `Show sub-issues of ${a.title}` }).click();
      await page.getByRole('button', { name: `Show sub-issues of ${b.title}` }).click();
      const cBar = page.getByRole('button', { name: new RegExp(`^${c.identifier} · `) });
      await expect(cBar).toBeVisible();
      await page.getByRole('button', { name: `Hide sub-issues of ${b.title}` }).click();
      await expect(cBar).toHaveCount(0);

      await open(b);
      await page.getByRole('button', { name: 'Remove parent', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Set parent', exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('button', { name: 'Set parent', exact: true })).toBeVisible();
      await expect(subIssueLink(c)).toBeVisible();
   } finally {
      for (const issue of created.reverse()) {
         await context.request.delete(
            `${api}/issues/${issue.id}?workspaceId=${fixture.workspace_id}`
         );
      }
   }
});
