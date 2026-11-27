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
      new RegExp(`/sandbox/ui/\\?arg=${issue.identifier}-flowie(&|$)`)
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
   await expect(terminal).toHaveAttribute('src', /\?arg=DTD-7-flowie(&|$)/);

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
   await expect(terminal).toHaveAttribute('src', /\?arg=DTD-7-flowie-claude(&|$)/);

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

test('The message box, quick actions, keys, attachments, copy and font size reach the session', async ({
   page,
}) => {
   const sent: unknown[] = [];
   const uploads: string[] = [];
   await page.route('**/api/v1/sandbox', (route) =>
      route.fulfill({ json: { data: { state: 'running' } } })
   );
   await page.route('**/api/v1/sandbox/dirs', (route) =>
      route.fulfill({ json: { data: { home: '/home/node', recent: [] } } })
   );
   await page.route('**/api/v1/sandbox/sessions', (route) =>
      route.fulfill({
         json: {
            data: [{ name: 'cl', dir: '/home/node', agent: 'claude', state: 'idle', preview: '' }],
         },
      })
   );
   await page.route('**/api/v1/sandbox/sessions/cl/send', (route) => {
      sent.push(route.request().postDataJSON());
      return route.fulfill({ json: { data: { ok: true } } });
   });
   await page.route('**/api/v1/sandbox/sessions/cl/text', (route) =>
      route.fulfill({ json: { data: { text: 'line one\nline two' } } })
   );
   await page.route('**/api/v1/sandbox/uploads', (route) => {
      uploads.push(decodeURIComponent(route.request().headers()['x-filename']));
      return route.fulfill({
         status: 201,
         json: { data: { path: '/home/node/.flowie/uploads/1-shot.png' } },
      });
   });
   await page.route(/\/api\/v1\/sandbox\/ui\/\?arg=/, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>terminal is here</p>' })
   );
   await signIn(page);
   await page.goto(`/${fixture.slug}/sandbox`);

   const box = page.getByLabel('Message to the session');
   await box.fill('Sửa lỗi đăng nhập');
   await box.press('Shift+Enter');
   await box.pressSequentially('rồi chạy test');
   await box.press('Enter');
   await expect.poll(() => sent.length).toBe(1);
   expect(sent[0]).toEqual({ text: 'Sửa lỗi đăng nhập\nrồi chạy test', enter: true });
   await expect(box).toHaveValue('');

   await page.getByTestId('attach-input').setInputFiles({
      name: 'ảnh chụp.png',
      mimeType: 'image/png',
      buffer: Buffer.from('png'),
   });
   await expect(page.getByRole('list', { name: 'Attachments' })).toContainText('ảnh chụp.png');
   await box.fill('Xem ảnh này');
   await page.getByRole('button', { name: 'Send', exact: true }).click();
   await expect.poll(() => sent.length).toBe(2);
   expect(uploads).toEqual(['ảnh chụp.png']);
   expect(sent[1]).toEqual({
      text: 'Xem ảnh này\n\n/home/node/.flowie/uploads/1-shot.png',
      enter: true,
   });

   page.once('dialog', (dialog) => void dialog.accept());
   await page.getByRole('button', { name: 'Quick actions' }).click();
   await page.getByRole('menuitem', { name: /^Push/ }).click();
   await expect.poll(() => sent.length).toBe(3);
   expect(sent[2]).toEqual({ text: 'Push the current branch to the remote.', enter: true });
   await page.getByRole('button', { name: 'Quick actions' }).click();
   await page.getByRole('menuitem', { name: /^Review/ }).click();
   await expect.poll(() => sent.length).toBe(4);
   expect(sent[3]).toEqual({ text: '/code-review', enter: true });

   await page
      .getByRole('toolbar', { name: 'Terminal keys' })
      .getByRole('button', { name: 'BTab' })
      .click();
   await expect.poll(() => sent.length).toBe(5);
   expect(sent[4]).toEqual({ key: 'BTab' });

   await page.getByRole('button', { name: 'Session text' }).click();
   await expect(page.getByTestId('session-text')).toHaveText('line one\nline two');
   await page.keyboard.press('Escape');

   const terminal = page.locator('iframe[title="Sandbox terminal"]');
   await expect(terminal).toHaveAttribute('src', /arg=cl&fontSize=14$/);
   await page.getByRole('button', { name: 'Larger text' }).click();
   await expect(terminal).toHaveAttribute('src', /arg=cl&fontSize=15$/);
});

test('The Files and Git tabs browse the session folder and run git actions', async ({ page }) => {
   const repo = '/home/node/work/DTD-7-flowie';
   const ops: unknown[] = [];
   await page.route('**/api/v1/sandbox', (route) =>
      route.fulfill({ json: { data: { state: 'running' } } })
   );
   await page.route('**/api/v1/sandbox/dirs', (route) =>
      route.fulfill({ json: { data: { home: '/home/node', recent: [repo] } } })
   );
   await page.route('**/api/v1/sandbox/sessions', (route) =>
      route.fulfill({
         json: {
            data: [{ name: 'DTD-7', dir: repo, agent: 'claude', state: 'idle', preview: '' }],
         },
      })
   );
   await page.route('**/api/v1/sandbox/files?*', (route) =>
      route.fulfill({
         json: {
            data: {
               dir: repo,
               parent: '/home/node/work',
               entries: [
                  { name: 'src', path: `${repo}/src`, dir: true, size: 0, mtime: 1, git: '•' },
                  {
                     name: 'README.md',
                     path: `${repo}/README.md`,
                     dir: false,
                     size: 9,
                     mtime: 1,
                     git: 'M',
                  },
               ],
            },
         },
      })
   );
   await page.route('**/api/v1/sandbox/file?*', (route) =>
      route.fulfill({ json: { data: { path: `${repo}/README.md`, text: '# Hello flowie\n' } } })
   );
   await page.route('**/api/v1/sandbox/git?*', (route) =>
      route.fulfill({
         json: {
            data: {
               dir: repo,
               head: 'flowie/DTD-7...origin/flowie/DTD-7 [ahead 1]',
               files: [
                  { x: 'M', y: ' ', path: 'src/app.py' },
                  { x: ' ', y: 'M', path: 'README.md' },
               ],
               commits: [
                  {
                     h: 'b'.repeat(40),
                     p: ['a'.repeat(40)],
                     refs: ['HEAD -> flowie/DTD-7'],
                     s: 'Fix login',
                     a: 'me',
                     t: 1,
                  },
                  { h: 'a'.repeat(40), p: [], refs: [], s: 'first', a: 'me', t: 1 },
               ],
               graph: {
                  width: 1,
                  rows: [
                     { col: 0, seg: [[0, 1, 0, 2]] },
                     { col: 0, seg: [[0, 0, 0, 1]] },
                  ],
               },
               branches: ['flowie/DTD-7', 'main'],
            },
         },
      })
   );
   await page.route('**/api/v1/sandbox/git/diff?*', (route) =>
      route.fulfill({
         json: {
            data: {
               text: '@@ -1 +1 @@\n-old\n+new',
               files: [{ path: 'src/app.py', add: 1, del: 1 }],
               commit: { hash: 'b'.repeat(40), author: 'me', t: 1, subject: 'Fix login', body: '' },
            },
         },
      })
   );
   await page.route('**/api/v1/sandbox/git', (route) => {
      ops.push(route.request().postDataJSON());
      return route.fulfill({ json: { data: { ok: true, output: 'done' } } });
   });
   await page.route(/\/api\/v1\/sandbox\/ui\/\?arg=/, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>terminal is here</p>' })
   );
   await signIn(page);
   await page.goto(`/${fixture.slug}/sandbox`);

   const tabs = page.getByRole('tablist', { name: 'Sandbox views' });
   await tabs.getByRole('tab', { name: 'Files' }).click();
   await expect(page.getByTestId('folder-path')).toHaveText('~/work/DTD-7-flowie');
   const files = page.getByRole('list', { name: 'Files' });
   await expect(files.getByRole('button', { name: /README\.md\s*M/ })).toBeVisible();
   await files.getByRole('button', { name: /README\.md/ }).click();
   await expect(
      page.getByTestId('file-view').getByRole('heading', { name: 'Hello flowie' })
   ).toBeVisible();
   await page.getByRole('button', { name: 'Add to message' }).click();
   await expect(page.getByLabel('Message to the session')).toHaveValue(`${repo}/README.md`);

   await tabs.getByRole('tab', { name: 'Git' }).click();
   await expect(page.getByTestId('git-head')).toContainText('[ahead 1]');
   await page.getByRole('list', { name: 'Changes' }).getByRole('button', { name: 'Stage' }).click();
   await expect.poll(() => ops.length).toBe(1);
   expect(ops[0]).toEqual({ dir: repo, op: 'stage', paths: ['README.md'] });
   await page.getByLabel('Commit message').fill('Sửa README');
   await page.getByRole('button', { name: 'Commit', exact: true }).click();
   await expect.poll(() => ops.length).toBe(2);
   expect(ops[1]).toEqual({ dir: repo, op: 'commit', message: 'Sửa README' });
   await page.getByRole('button', { name: 'Push' }).click();
   await expect.poll(() => ops.length).toBe(3);
   expect(ops[2]).toEqual({ dir: repo, op: 'push' });

   await page
      .getByRole('list', { name: 'Commits' })
      .getByRole('button', { name: /Fix login/ })
      .click();
   const diff = page.getByRole('dialog', { name: 'Fix login' });
   await expect(diff.getByTestId('diff-text')).toContainText('+new');
   await expect(diff).toContainText('src/app.py');
});

test('The usage chip shows CPU, memory and the busiest plan windows', async ({ page }) => {
   const soon = Date.now() + 3_600_000;
   await page.route('**/api/v1/sandbox', (route) =>
      route.fulfill({ json: { data: { state: 'running' } } })
   );
   await page.route('**/api/v1/sandbox/sessions', (route) => route.fulfill({ json: { data: [] } }));
   await page.route('**/api/v1/sandbox/dirs', (route) =>
      route.fulfill({ json: { data: { home: '/home/node', recent: [] } } })
   );
   await page.route('**/api/v1/sandbox/usage', (route) =>
      route.fulfill({
         json: {
            data: {
               cpu: 12,
               memory: { used: 1024 ** 3, limit: 2 * 1024 ** 3 },
               disk: { free: 40 * 1024 ** 3, total: 100 * 1024 ** 3 },
               claude: {
                  fiveHour: { pct: 34, resetsAt: soon },
                  sevenDay: { pct: 9, resetsAt: soon },
               },
               codex: {
                  plan: 'plus',
                  primary: { pct: 12, resetsAt: soon, minutes: 300 },
                  secondary: null,
               },
            },
         },
      })
   );
   await page.route(/\/api\/v1\/sandbox\/ui\/\?arg=/, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>terminal is here</p>' })
   );
   await signIn(page);
   await page.goto(`/${fixture.slug}/sandbox`);

   const chip = page.getByRole('button', { name: 'Sandbox usage' });
   await expect(chip).toContainText('CPU 12% · RAM 50%');
   await expect(chip).toContainText('Claude 34%');
   await expect(chip).toContainText('Codex 12%');
   await chip.click();
   const details = page.getByTestId('usage-details');
   await expect(details).toContainText('1.0 GB / 2.0 GB');
   await expect(details).toContainText('40.0 GB');
   await expect(details).toContainText('Claude, 7 days');
   await expect(details).not.toContainText('Codex, weekly window');
});
