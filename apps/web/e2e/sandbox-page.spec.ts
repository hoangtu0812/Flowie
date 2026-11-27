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

test('The Sandbox page switches, adds and closes terminal sessions', async ({ page }) => {
   let sessions = [{ name: 'DTD-7-flowie' }, { name: 'main' }];
   const closed: string[] = [];
   await page.route('**/api/v1/sandbox', (route) =>
      route.fulfill({ json: { data: { state: 'running' } } })
   );
   await page.route('**/api/v1/sandbox/sessions', (route) =>
      route.fulfill({ json: { data: sessions } })
   );
   await page.route('**/api/v1/sandbox/sessions/*', (route) => {
      const name = decodeURIComponent(route.request().url().split('/').pop() ?? '');
      closed.push(name);
      sessions = sessions.filter((session) => session.name !== name);
      return route.fulfill({ status: 204 });
   });
   await page.route(/\/api\/v1\/sandbox\/ui\/\?arg=/, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>terminal is here</p>' })
   );
   await signIn(page);
   await page.goto(`/${fixture.slug}/sandbox`);

   const terminal = page.locator('iframe[title="Sandbox terminal"]');
   const tabs = page.getByRole('tablist', { name: 'Terminal sessions' });
   await expect(tabs.getByRole('tab')).toHaveText(['DTD-7-flowie', 'main']);
   await expect(terminal).toHaveAttribute('src', /\?arg=DTD-7-flowie$/);

   await tabs.getByRole('tab', { name: 'main' }).click();
   await expect(terminal).toHaveAttribute('src', /\?arg=main$/);

   await page.getByRole('button', { name: 'New terminal' }).click();
   await expect(tabs.getByRole('tab', { selected: true })).toHaveText(/^term-/);
   await expect(terminal).toHaveAttribute('src', /\?arg=term-/);

   await tabs.getByRole('tab', { name: 'DTD-7-flowie' }).click();
   await page.getByRole('button', { name: 'Close this session' }).click();
   await expect(tabs.getByRole('tab')).toHaveText(['main']);
   expect(closed).toEqual(['DTD-7-flowie']);
   await expect(terminal).toHaveAttribute('src', /\?arg=main$/);
});
