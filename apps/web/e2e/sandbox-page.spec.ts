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
   // No session is open yet, so the start page shows instead of a terminal.
   await expect(page.getByTestId('sandbox-home')).toBeVisible();
   await expect(page.locator('iframe[title="Sandbox terminal"]')).toHaveCount(0);

   await page.getByRole('button', { name: 'Stop' }).click();
   await expect(page.getByTestId('sandbox-state')).toHaveText('Stopped');
   await expect(page.getByTestId('sandbox-home')).toHaveCount(0);
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

   await page
      .getByRole('complementary', { name: 'Side panel' })
      .getByRole('button', { name: 'New session' })
      .click();
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
   await page
      .getByRole('list', { name: 'Terminal sessions' })
      .getByRole('button', { name: /^cl/ })
      .click();

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

   // The key row is for touch screens: it is hidden on a desktop and shown on a narrow one.
   const keys = page.getByRole('toolbar', { name: 'Terminal keys' });
   await expect(keys.getByRole('button', { name: 'BTab' })).toBeHidden();
   await page.setViewportSize({ width: 800, height: 900 });
   await keys.getByRole('button', { name: 'BTab' }).click();
   await expect.poll(() => sent.length).toBe(5);
   expect(sent[4]).toEqual({ key: 'BTab' });
   await page.setViewportSize({ width: 1280, height: 800 });

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

   await page
      .getByRole('list', { name: 'Terminal sessions' })
      .getByRole('button', { name: /^DTD-7/ })
      .click();
   const views = page.getByRole('navigation', { name: 'Sandbox views' });
   await views.getByRole('button', { name: 'Files' }).click();
   await expect(page.getByTestId('folder-path')).toHaveText('~/work/DTD-7-flowie');
   const files = page.getByRole('list', { name: 'Files' });
   await expect(files.getByRole('button', { name: /README\.md\s*M/ })).toBeVisible();
   await files.getByRole('button', { name: /README\.md/ }).click();
   await expect(
      page.getByTestId('file-view').getByRole('heading', { name: 'Hello flowie' })
   ).toBeVisible();
   await page.getByRole('button', { name: 'Add to message' }).click();
   await expect(page.getByLabel('Message to the session')).toHaveValue(`${repo}/README.md`);

   await views.getByRole('button', { name: 'Git' }).click();
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

test('The start page, side panel and status bar follow termi', async ({ page }) => {
   const home = '/home/node';
   const repo = `${home}/work/DTD-7-flowie`;
   type Row = {
      name: string;
      dir: string;
      agent: string;
      state: string;
      preview: string;
      branch: string | null;
      changes: number | null;
   };
   let sessions: Row[] = [
      {
         name: 'DTD-7',
         dir: repo,
         agent: 'claude',
         state: 'waiting',
         preview: '',
         branch: 'flowie/DTD-7',
         changes: 3,
      },
   ];
   const created: unknown[] = [];
   await page.route('**/api/v1/sandbox', (route) =>
      route.fulfill({ json: { data: { state: 'running' } } })
   );
   await page.route('**/api/v1/sandbox/dirs', (route) =>
      route.fulfill({ json: { data: { home, recent: [home, repo, `${home}/repos/flowie`] } } })
   );
   await page.route('**/api/v1/sandbox/conversations*', (route) =>
      route.fulfill({
         json: {
            data: [
               {
                  agent: 'codex',
                  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
                  cwd: repo,
                  title: 'Fix login',
                  mtime: 1,
               },
            ],
         },
      })
   );
   await page.route('**/api/v1/sandbox/sessions', (route) => {
      if (route.request().method() === 'POST') {
         const body = route.request().postDataJSON() as {
            name: string;
            dir: string;
            agent: string;
         };
         created.push(body);
         sessions = [
            ...sessions,
            { ...body, state: 'working', preview: '', branch: null, changes: null },
         ];
         return route.fulfill({ status: 201, json: { data: { name: body.name } } });
      }
      return route.fulfill({ json: { data: sessions } });
   });
   await page.route('**/api/v1/sandbox/usage', (route) =>
      route.fulfill({
         json: {
            data: {
               cpu: 3,
               memory: { used: 1, limit: 2 },
               disk: { free: 1, total: 2 },
               claude: null,
               codex: null,
            },
         },
      })
   );
   await page.route(/\/api\/v1\/sandbox\/ui\/\?arg=/, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>terminal is here</p>' })
   );
   await signIn(page);
   await page.goto(`/${fixture.slug}/sandbox`);

   const start = page.getByTestId('sandbox-home');
   await expect(start.getByRole('button', { name: /^DTD-7 / })).toBeVisible(); // Continue
   const projects = start.getByRole('list', { name: 'Recent projects' });
   await expect(projects.getByRole('listitem')).toHaveCount(2); // the home itself is not a project
   await projects.getByRole('button', { name: 'New Codex session in flowie' }).click();
   await expect.poll(() => created.length).toBe(1);
   expect(created[0]).toEqual({
      name: 'flowie-codex',
      dir: `${home}/repos/flowie`,
      agent: 'codex',
   });
   await expect(page.locator('iframe[title="Sandbox terminal"]')).toHaveAttribute(
      'src',
      /\?arg=flowie-codex(&|$)/
   );

   const views = page.getByRole('navigation', { name: 'Sandbox views' });
   await expect(views.getByRole('button', { name: 'Sessions' })).toContainText('1'); // one waiting
   const panel = page.getByRole('complementary', { name: 'Side panel' });
   await expect(panel).toBeVisible();
   await views.getByRole('button', { name: 'Sessions' }).click(); // the active view collapses
   await expect(panel).toBeHidden();
   await page.keyboard.press('ControlOrMeta+b');
   await expect(panel).toBeVisible();

   await page
      .getByRole('list', { name: 'Terminal sessions' })
      .getByRole('button', { name: /^DTD-7/ })
      .click();
   const status = page.getByRole('contentinfo', { name: 'Status bar' });
   await expect(status).toContainText('~/work/DTD-7-flowie');
   await expect(status).toContainText('flowie/DTD-7');
   await expect(status).toContainText('3 uncommitted');
   await expect(views.getByRole('button', { name: 'Git' })).toContainText('3');
});

test('Chat shows the conversation, folds tool steps and opens changed files', async ({ page }) => {
   const home = '/home/node';
   const repo = `${home}/work/DTD-7-flowie`;
   const conversation = '0f8fad5b-d9cb-469f-a165-70867728950e';
   const created: unknown[] = [];
   const chat = {
      agent: 'claude',
      state: 'idle',
      dir: repo,
      items: [
         { kind: 'msg', who: 'user', text: 'Sửa lỗi đăng nhập', t: null },
         {
            kind: 'tools',
            t: null,
            steps: [
               { verb: 'Read', detail: 'login.py' },
               { verb: 'Edit', detail: 'login.py', file: `${repo}/app/login.py`, change: 'edit' },
               {
                  verb: 'Create',
                  detail: 'test_login.py',
                  file: `${repo}/tests/test_login.py`,
                  change: 'create',
               },
            ],
         },
         { kind: 'msg', who: 'assistant', text: '**Xong**, test đã qua.', t: null },
      ],
   };
   await page.route('**/api/v1/sandbox', (route) =>
      route.fulfill({ json: { data: { state: 'running' } } })
   );
   await page.route('**/api/v1/sandbox/dirs', (route) =>
      route.fulfill({ json: { data: { home, recent: [repo] } } })
   );
   await page.route('**/api/v1/sandbox/conversations?*', (route) =>
      route.fulfill({
         json: {
            data: [
               {
                  agent: 'claude',
                  id: conversation,
                  cwd: repo,
                  title: 'Sửa lỗi đăng nhập',
                  mtime: 1,
               },
            ],
         },
      })
   );
   await page.route(`**/api/v1/sandbox/conversations/claude/${conversation}`, (route) =>
      route.fulfill({ json: { data: { ...chat, state: undefined } } })
   );
   await page.route('**/api/v1/sandbox/sessions', (route) => {
      if (route.request().method() === 'POST') {
         created.push(route.request().postDataJSON());
         return route.fulfill({ status: 201, json: { data: { name: 'DTD-7-flowie-claude' } } });
      }
      return route.fulfill({
         json: {
            data: [{ name: 'DTD-7', dir: repo, agent: 'claude', state: 'idle', preview: '' }],
         },
      });
   });
   await page.route('**/api/v1/sandbox/sessions/DTD-7/chat', (route) =>
      route.fulfill({ json: { data: chat } })
   );
   await page.route('**/api/v1/sandbox/git/diff?*', (route) =>
      route.fulfill({
         json: { data: { text: '@@ -1 +1 @@\n-old\n+new', files: [], commit: null } },
      })
   );
   await page.route('**/api/v1/sandbox/file?*', (route) =>
      route.fulfill({
         json: { data: { path: `${repo}/tests/test_login.py`, text: 'def test_login(): pass\n' } },
      })
   );
   await page.route(/\/api\/v1\/sandbox\/ui\/\?arg=/, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>terminal is here</p>' })
   );
   await signIn(page);
   await page.goto(`/${fixture.slug}/sandbox`);

   // A past conversation can be read from the start page and resumed from there.
   await page.getByRole('button', { name: 'Read Sửa lỗi đăng nhập' }).click();
   const viewer = page.getByTestId('conversation-viewer');
   await expect(viewer.getByText('test đã qua.')).toBeVisible();
   await viewer.getByRole('button', { name: 'Resume' }).click();
   await expect.poll(() => created.length).toBe(1);
   expect(created[0]).toEqual({
      name: 'DTD-7-flowie-claude',
      dir: repo,
      agent: 'claude',
      resume: conversation,
   });

   await page
      .getByRole('list', { name: 'Terminal sessions' })
      .getByRole('button', { name: /^DTD-7/ })
      .click();
   const views = page.getByRole('tablist', { name: 'Session views' });
   await views.getByRole('tab', { name: 'Chat' }).click();
   const chatView = page.getByTestId('chat-view');
   await expect(chatView.getByText('Sửa lỗi đăng nhập')).toBeVisible();
   await expect(chatView.locator('strong', { hasText: 'Xong' })).toBeVisible();
   await expect(chatView.getByRole('button', { name: /3 steps/ })).toBeVisible();
   await chatView.getByRole('button', { name: /3 steps/ }).click();
   await expect(chatView.getByText('Read', { exact: true })).toBeVisible();

   await chatView.getByRole('button', { name: 'login.py', exact: true }).click();
   await expect(
      page.getByRole('dialog', { name: 'login.py' }).getByTestId('diff-text')
   ).toContainText('+new');
   await page.keyboard.press('Escape');
   await chatView.getByRole('button', { name: 'test_login.py' }).click();
   await expect(page.getByTestId('file-view')).toContainText('def test_login()');
   await page.getByRole('button', { name: 'Close the file' }).click();

   await views.getByRole('tab', { name: 'Terminal' }).click();
   await expect(page.locator('iframe[title="Sandbox terminal"]')).toBeVisible();
});

test('Pipelines list the branch runs, flag a failure and rerun, cancel or show logs', async ({
   page,
}) => {
   const repo = '/home/node/work/DTD-7-flowie';
   const actions: unknown[] = [];
   const run = (
      id: string,
      pipelineId: string,
      pipeline: string,
      status: string,
      result: string | null,
      branch: string
   ) => ({
      id,
      number: `#${id}`,
      title: `Run ${id}`,
      pipeline,
      pipelineId,
      status,
      result,
      trigger: 'push',
      branch,
      ref: branch,
      sha: 'abc',
      actor: 'tu',
      queuedAt: Date.now() - 120_000,
      startedAt: null,
      finishedAt: null,
      url: `https://github.com/o/r/actions/runs/${id}`,
   });
   const ci = {
      provider: 'github',
      repo: 'o/r',
      page: 'https://github.com/o/r/actions',
      branch: 'flowie/DTD-7',
      pipelines: [
         { id: '1', name: 'CI', recent: ['failure'] },
         { id: '2', name: 'Deploy', recent: ['running'] },
      ],
      runs: [
         run('30', '1', 'CI', 'completed', 'failure', 'flowie/DTD-7'),
         run('29', '2', 'Deploy', 'running', null, 'flowie/DTD-7'),
         run('28', '1', 'CI', 'completed', 'success', 'main'),
      ],
   };
   await page.route('**/api/v1/sandbox', (route) =>
      route.fulfill({ json: { data: { state: 'running' } } })
   );
   await page.route('**/api/v1/sandbox/dirs', (route) =>
      route.fulfill({ json: { data: { home: '/home/node', recent: [] } } })
   );
   await page.route('**/api/v1/sandbox/sessions', (route) =>
      route.fulfill({
         json: {
            data: [
               {
                  name: 'DTD-7',
                  dir: repo,
                  agent: 'claude',
                  state: 'idle',
                  preview: '',
                  branch: 'flowie/DTD-7',
                  changes: 0,
               },
            ],
         },
      })
   );
   await page.route('**/api/v1/sandbox/ci?*', (route) => route.fulfill({ json: { data: ci } }));
   await page.route('**/api/v1/sandbox/ci/log?*', (route) =>
      route.fulfill({ json: { data: { text: 'FAILED test_login' } } })
   );
   await page.route('**/api/v1/sandbox/ci', (route) => {
      actions.push(route.request().postDataJSON());
      return route.fulfill({ json: { data: { ok: true } } });
   });
   await page.route(/\/api\/v1\/sandbox\/ui\/\?arg=/, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>terminal is here</p>' })
   );
   await signIn(page);
   await page.goto(`/${fixture.slug}/sandbox`);
   await page
      .getByRole('list', { name: 'Terminal sessions' })
      .getByRole('button', { name: /^DTD-7/ })
      .click();

   await expect(page.getByTestId('badge-pipelines')).toHaveAttribute('data-state', 'failure');
   const status = page.getByRole('contentinfo', { name: 'Status bar' });
   await status.getByRole('button', { name: 'Pipeline failed' }).click();
   const runs = page.getByRole('list', { name: 'Runs' });
   await expect(runs.getByRole('listitem')).toHaveCount(2); // this branch only
   await page
      .getByRole('group', { name: 'Pipelines' })
      .getByRole('button', { name: 'flowie/DTD-7' })
      .click();
   await expect(runs.getByRole('listitem')).toHaveCount(3);
   await page
      .getByRole('group', { name: 'Pipelines' })
      .getByRole('button', { name: /^Deploy/ })
      .click();
   await expect(runs.getByRole('listitem')).toHaveCount(1);
   await page
      .getByRole('group', { name: 'Pipelines' })
      .getByRole('button', { name: 'All pipelines' })
      .click();

   await runs.getByRole('button', { name: 'Log of #30' }).click();
   await expect(page.getByTestId('ci-log')).toHaveText('FAILED test_login');
   await page.keyboard.press('Escape');
   await runs.getByRole('button', { name: 'Rerun #30' }).click();
   await expect.poll(() => actions.length).toBe(1);
   expect(actions[0]).toEqual({ dir: repo, id: '30', action: 'rerun' });
   await runs.getByRole('button', { name: 'Cancel #29' }).click();
   await expect.poll(() => actions.length).toBe(2);
   expect(actions[1]).toEqual({ dir: repo, id: '29', action: 'cancel' });
   await expect(runs.getByRole('link', { name: 'Run 30' })).toHaveAttribute(
      'href',
      'https://github.com/o/r/actions/runs/30'
   );
});
