import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
   issues: { id: string; identifier: string }[];
};

// The fixture API has no sandbox-manager, so these tests answer /sandbox themselves and check
// only the page: the sidebar entry, start, the embedded terminal and stop.
// VI: API fixture không có sandbox-manager, nên các test này tự trả lời /sandbox và chỉ kiểm
// VI: tra trang: mục sidebar, khởi động, terminal nhúng và dừng.
async function signIn(page: Page) {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
}

test('The Sandbox page starts the sandbox, shows its terminal and stops it', async ({ page }) => {
   let state = 'none';
   await page.route('**/api/v1/sandbox', (route) => {
      if (route.request().method() === 'PUT') state = 'running';
      return route.fulfill({ json: { data: { state } } });
   });
   await page.route('**/api/v1/sandbox/stop', (route) => {
      state = 'exited';
      return route.fulfill({ json: { data: { state } } });
   });
   await page.route(/\/api\/v1\/sandbox\/ui\/\?arg=/, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>terminal is here</p>' })
   );
   await page.route('**/api/v1/sandbox/sessions', (route) => route.fulfill({ json: { data: [] } }));
   await signIn(page);

   await page.getByRole('link', { name: 'Sandbox' }).click();
   await page.getByRole('button', { name: 'Start sandbox' }).click();
   await expect(page.getByTestId('sandbox-state')).toHaveText('Running');
   await expect(
      page.frameLocator('iframe[title="Sandbox terminal"]').getByText('terminal is here')
   ).toBeVisible();

   await page.getByRole('button', { name: 'Stop' }).click();
   await expect(page.getByTestId('sandbox-state')).toHaveText('Stopped');
   await expect(page.locator('iframe[title="Sandbox terminal"]')).toHaveCount(0);
});

test('People without sandbox access see no Sandbox entry', async ({ page }) => {
   await page.route('**/api/v1/sandbox', (route) =>
      route.fulfill({ status: 403, json: { message: 'Sandbox is not enabled for this account.' } })
   );
   await signIn(page);
   await expect(page.getByRole('link', { name: 'Inbox' })).toBeVisible();
   await expect(page.getByRole('link', { name: 'Sandbox' })).toHaveCount(0);

   await page.goto(`/${fixture.slug}/sandbox`);
   await expect(page.getByText('Sandbox is not enabled for your account.')).toBeVisible();
});

test('Open with Codex on an issue opens the Sandbox page on the issue session', async ({
   page,
}) => {
   const issue = fixture.issues[0];
   let opened: unknown;
   await page.route('**/api/v1/sandbox', (route) =>
      route.fulfill({ json: { data: { state: 'running' } } })
   );
   await page.route('**/api/v1/sandbox/repositories?*', (route) =>
      route.fulfill({ json: { data: [{ id: 'repo-1', name: 'flowie' }] } })
   );
   await page.route('**/api/v1/sandbox/open', (route) => {
      opened = route.request().postDataJSON();
      return route.fulfill({ json: { data: { session: `${issue.identifier}-flowie` } } });
   });
   await page.route(/\/api\/v1\/sandbox\/ui\/\?arg=/, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>terminal is here</p>' })
   );
   await page.route('**/api/v1/sandbox/sessions', (route) => route.fulfill({ json: { data: [] } }));
   await signIn(page);
   await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);

   await page.getByRole('button', { name: 'Open with…' }).click();
   await page.getByRole('menuitem', { name: 'Open with Codex' }).click();
   await expect(page).toHaveURL(new RegExp(`/sandbox\\?session=${issue.identifier}-flowie$`));
   expect(opened).toEqual({ issueId: issue.id, repositoryId: 'repo-1', agent: 'codex' });
   await expect(page.locator('iframe[title="Sandbox terminal"]')).toHaveAttribute(
      'src',
      new RegExp(`/sandbox/ui/\\?arg=${issue.identifier}-flowie$`)
   );
});

test('The Sandbox page lists agent sessions and creates, renames and closes them', async ({
   page,
}) => {
   const home = '/home/node';
   let sessions = [
      {
         name: 'DTD-7-flowie',
         dir: `${home}/work/DTD-7-flowie`,
         agent: 'claude',
         state: 'idle',
         preview: 'Done.',
      },
      { name: 'main', dir: home, agent: null, state: 'shell', preview: '$' },
      { name: 'review', dir: home, agent: 'codex', state: 'waiting', preview: 'Allow command?' },
   ];
   const calls: string[] = [];
   let created: unknown;
   await page.route('**/api/v1/sandbox', (route) =>
      route.fulfill({ json: { data: { state: 'running' } } })
   );
   await page.route('**/api/v1/sandbox/dirs', (route) =>
      route.fulfill({ json: { data: { home, recent: [`${home}/work/DTD-7-flowie`] } } })
   );
   await page.route('**/api/v1/sandbox/conversations?*', (route) =>
      route.fulfill({
         json: {
            data: [
               {
                  agent: 'claude',
                  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
                  cwd: `${home}/work/DTD-7-flowie`,
                  title: 'Fix the login page',
                  mtime: 1,
               },
            ],
         },
      })
   );
   await page.route('**/api/v1/sandbox/sessions', (route) => {
      if (route.request().method() === 'POST') {
         created = route.request().postDataJSON();
         const body = created as { name: string; dir: string; agent: string };
         sessions = [...sessions, { ...body, state: 'working', preview: '' }];
         return route.fulfill({ status: 201, json: { data: { name: body.name } } });
      }
      return route.fulfill({ json: { data: sessions } });
   });
   await page.route('**/api/v1/sandbox/sessions/**', (route) => {
      const url = route.request().url();
      calls.push(`${route.request().method()} ${url.slice(url.indexOf('/sessions/'))}`);
      if (url.endsWith('/rename')) {
         const to = (route.request().postDataJSON() as { to: string }).to;
         sessions = sessions.map((s) => (s.name === 'main' ? { ...s, name: to } : s));
         return route.fulfill({ json: { data: { name: to } } });
      }
      sessions = sessions.filter((s) => !url.endsWith(`/sessions/${s.name}`));
      return route.fulfill({ status: 204 });
   });
   await page.route(/\/api\/v1\/sandbox\/ui\/\?arg=/, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>terminal is here</p>' })
   );
   await signIn(page);
   await page.goto(`/${fixture.slug}/sandbox`);

   const list = page.getByRole('list', { name: 'Terminal sessions' });
   const terminal = page.locator('iframe[title="Sandbox terminal"]');
   // Sessions waiting for the person come first, then working, idle and plain shells.
   await expect(list.getByRole('listitem')).toHaveCount(3);
   await expect(list.getByRole('listitem').first()).toContainText('review');
   await expect(list.getByRole('listitem').first()).toContainText('Allow command?');
   await expect(list.getByText('~/work/DTD-7-flowie')).toBeVisible();

   await list.getByRole('button', { name: /^DTD-7-flowie/ }).click();
   await expect(terminal).toHaveAttribute('src', /\?arg=DTD-7-flowie$/);

   await page.getByRole('button', { name: 'New session' }).click();
   const dialog = page.getByRole('dialog', { name: 'New session' });
   await expect(dialog.getByLabel('Session name')).toHaveValue('DTD-7-flowie-claude');
   await expect(dialog.getByText('Fix the login page')).toBeHidden();
   await dialog.getByRole('button', { name: 'Create session' }).click();
   await expect(dialog).toBeHidden();
   expect(created).toEqual({
      name: 'DTD-7-flowie-claude',
      dir: `${home}/work/DTD-7-flowie`,
      agent: 'claude',
   });
   await expect(terminal).toHaveAttribute('src', /\?arg=DTD-7-flowie-claude$/);

   await page.getByRole('button', { name: 'Actions for main' }).click();
   await page.getByRole('menuitem', { name: 'Rename' }).click();
   await page
      .getByRole('dialog', { name: 'Rename session' })
      .getByLabel('Session name')
      .fill('scratch');
   await page.getByRole('button', { name: 'Rename', exact: true }).click();
   await expect(list.getByRole('button', { name: /^scratch/ })).toBeVisible();

   await page.getByRole('button', { name: 'Actions for review' }).click();
   await page.getByRole('menuitem', { name: 'Close session' }).click();
   await expect(list.getByRole('button', { name: /^review/ })).toHaveCount(0);
   expect(calls).toEqual(['POST /sessions/main/rename', 'DELETE /sessions/review']);
});
