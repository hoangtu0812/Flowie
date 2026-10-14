import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   team_id: string;
   projectId: string;
   userId: string;
   email: string;
   password: string;
   documentId: string;
   documentTitle: string;
   issues: { id: string; identifier: string; title: string }[];
};
const api = 'http://localhost:4000/api/v1';
async function openDocument(page: Page) {
   const folder = page.getByRole('button', { name: /^📁 Regression notes/ });
   if ((await folder.getAttribute('aria-expanded')) !== 'true') await folder.click();
   await page.getByRole('button', { name: fixture.documentTitle, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
});

test('Done flushes Markdown and the saved content survives reload', async ({ page, context }) => {
   const current = (
      await (
         await context.request.get(
            `${api}/documents/${fixture.documentId}?workspaceId=${fixture.workspace_id}`
         )
      ).json()
   ).data;
   await context.request.patch(
      `${api}/documents/${fixture.documentId}?workspaceId=${fixture.workspace_id}`,
      {
         data: {
            expectedVersion: current.version,
            content:
               '# Regression\n\n```python\nprint("safe")\n```\n\n| Status | Count |\n| --- | --- |\n| Open | 2 |\n\n1. Reproduce\n2. Verify\n\n- [x] Fixture ready\n<script>alert(1)</script>\n[Unsafe](javascript:alert(1))',
         },
      }
   );
   await page.goto(`/${fixture.slug}/team/GEN/documents`);
   await openDocument(page);
   const dialog = page.getByRole('dialog');
   await expect(dialog.locator('table')).toBeVisible();
   await expect(dialog.locator('pre code')).toContainText('print("safe")');
   await expect(dialog.locator('ol li')).toHaveCount(2);
   await expect(dialog.locator('a[href^="javascript:"]')).toHaveCount(0);
   await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
   const content = `# Saved regression\n\nFlush before the autosave timer. ${Date.now()}`;
   await dialog.getByLabel('Markdown content').fill(content);
   await dialog.getByRole('button', { name: 'Done', exact: true }).click();
   await expect(dialog).toContainText('All changes saved.');
   const stored = await context.request.get(
      `${api}/documents/${fixture.documentId}?workspaceId=${fixture.workspace_id}`
   );
   expect((await stored.json()).data.content).toBe(content);
   await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
   await page.reload();
   await openDocument(page);
   await expect(page.getByRole('dialog')).toContainText('Flush before the autosave timer.');
});

test('a concurrent document write preserves the draft and requires reconciliation', async ({
   page,
   context,
}) => {
   await page.goto(`/${fixture.slug}/team/GEN/documents`);
   await openDocument(page);
   const dialog = page.getByRole('dialog');
   const read = await context.request.get(
      `${api}/documents/${fixture.documentId}?workspaceId=${fixture.workspace_id}`
   );
   const document = (await read.json()).data;
   await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
   const other = await context.request.patch(
      `${api}/documents/${fixture.documentId}?workspaceId=${fixture.workspace_id}`,
      { data: { expectedVersion: document.version, content: 'Concurrent AI revision' } }
   );
   expect(other.ok()).toBeTruthy();
   await dialog.getByLabel('Markdown content').fill('Retained human draft');
   await dialog.getByRole('button', { name: 'Done', exact: true }).click();
   await expect(dialog).toContainText('Your draft cannot overwrite a newer revision.');
   await expect(dialog.getByLabel('Markdown content')).toHaveValue('Retained human draft');
   await dialog.getByRole('button', { name: 'Compare latest version' }).click();
   await expect(dialog).toContainText('Concurrent AI revision');
   await dialog.getByRole('button', { name: 'Save retained draft over reviewed version' }).click();
   await expect(dialog).toContainText('All changes saved.');
});

test('comment submit is single and author edits/replies survive reload', async ({
   page,
   context,
}) => {
   const issue = fixture.issues[0];
   await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
   await expect(page.getByRole('heading', { name: issue.title, exact: true })).toBeVisible();
   const content = `Submission regression ${Date.now()}`;
   await page.getByRole('textbox', { name: 'Comment', exact: true }).fill(content);
   await page.getByRole('textbox', { name: 'Comment', exact: true }).press('Control+Enter');
   await page.getByRole('textbox', { name: 'Comment', exact: true }).press('Control+Enter');
   await expect(page.getByRole('article').filter({ hasText: content })).toHaveCount(1);
   const response = await context.request.get(
      `${api}/comments?workspaceId=${fixture.workspace_id}&issueId=${issue.id}`
   );
   expect(
      (await response.json()).data.filter(
         (comment: { content: string }) => comment.content === content
      )
   ).toHaveLength(1);
   const row = page.getByRole('article').filter({ hasText: content });
   await row.getByRole('button', { name: 'Edit comment', exact: true }).click();
   await row.getByRole('textbox', { name: 'Edit comment', exact: true }).fill(content + ' edited');
   await row.getByRole('button', { name: 'Save comment', exact: true }).click();
   await expect(row.getByRole('textbox', { name: 'Edit comment', exact: true })).toHaveCount(0);
   await expect(row).toContainText('edited');
   await row.getByRole('button', { name: 'Reply', exact: true }).click();
   await page.getByRole('textbox', { name: 'Comment', exact: true }).fill(content + ' reply');
   await page.getByRole('button', { name: 'Comment', exact: true }).click();
   await expect(page.getByRole('article').filter({ hasText: content + ' reply' })).toBeVisible();
   await page.reload();
   await expect(page.getByText(content + ' edited', { exact: true })).toBeVisible();
   await expect(page.getByText(content + ' reply', { exact: true })).toBeVisible();
});

test('Assigned search keeps scope and notification preferences persist', async ({ page }) => {
   await page.goto(`/${fixture.slug}/my-issues?tab=assigned`);
   await page.getByRole('button', { name: 'Search', exact: true }).click();
   await page.getByPlaceholder('Search issues...').fill('unassigned');
   await expect(page.getByText('Unassigned regression bug', { exact: true })).toHaveCount(0);
   await expect(page.getByText(/No results in this view/)).toBeVisible();
   await page.goto(`/${fixture.slug}/team/GEN/all`);
   await page.getByRole('button', { name: 'Notification preferences' }).click();
   const option = page.getByRole('checkbox', {
      name: 'An issue is added to the team',
      exact: true,
   });
   await expect(option).toBeEnabled();
   if (!(await option.isChecked())) await option.click();
   await expect(option).toBeChecked();
   await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0);
   await page.reload();
   await page.getByRole('button', { name: 'Notification preferences' }).click();
   await expect(
      page.getByRole('checkbox', { name: 'An issue is added to the team', exact: true })
   ).toBeChecked();
});

test('mobile issue properties and authenticated profile remain usable', async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.goto(`/${fixture.slug}/issue/${fixture.issues[0].identifier}`);
   await page.getByRole('button', { name: 'Properties', exact: true }).click();
   await expect(page.getByRole('button', { name: 'Hide properties', exact: true })).toBeVisible();
   await expect(page.getByRole('combobox', { name: /Priority:/ }).first()).toBeVisible();
   await expect(page.getByRole('combobox', { name: /Status:/ }).first()).toBeVisible();
   await page.goto(`/${fixture.slug}/profiles/${fixture.userId}`);
   await expect(page.getByText('Regression Owner', { exact: true }).first()).toBeVisible();
   await expect(page).toHaveURL(new RegExp(`/profiles/${fixture.userId}`));
});

test('settings routes expose persisted actions and recovery availability', async ({ page }) => {
   await page.goto(`/${fixture.slug}/settings/releases`);
   await page.getByRole('button', { name: 'New release', exact: true }).click();
   const name = `Regression release ${Date.now()}`;
   await page.getByPlaceholder('Release name').fill(name);
   await page.getByPlaceholder('Version', { exact: true }).fill(`0.0.${Date.now()}-test`);
   await page.getByRole('button', { name: 'Create release', exact: true }).click();
   await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.reload();
   await expect(page.getByText(name, { exact: true })).toBeVisible();
   for (const path of ['slas', 'customer-requests', 'asks', 'emojis']) {
      await page.goto(`/${fixture.slug}/settings/${path}`);
      await expect(page.getByRole('heading', { level: 1 }).last()).toBeVisible();
      await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
   }
   await page.goto('/auth/forgot-password');
   await expect(
      page.getByText(
         'Password recovery email is not configured. Contact your workspace administrator.'
      )
   ).toBeVisible();
});

test('authentication and new preference forms have no serious accessibility violations', async ({
   page,
}) => {
   await page.goto('/auth/login');
   await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
   const loginReport = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
   expect(
      loginReport.violations.filter((violation) =>
         ['serious', 'critical'].includes(violation.impact ?? '')
      )
   ).toEqual([]);
   await page.goto(`/${fixture.slug}/settings/preferences`);
   await expect(page.getByRole('heading', { name: 'Preferences', exact: true })).toBeVisible();
   const report = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
   expect(
      report.violations.filter((violation) =>
         ['serious', 'critical'].includes(violation.impact ?? '')
      )
   ).toEqual([]);
   await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
   await page.getByRole('menuitem', { name: 'Light', exact: true }).click();
   await page.getByRole('menuitem', { name: 'Pure Light', exact: true }).click();
   await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0);
   await expect(page.locator('html')).not.toHaveClass(/dark/);
   const lightReport = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
   expect(
      lightReport.violations.filter((violation) =>
         ['serious', 'critical'].includes(violation.impact ?? '')
      )
   ).toEqual([]);
});

test('failed document save can keep a verified local draft and recover after reload', async ({
   page,
}) => {
   await page.goto(`/${fixture.slug}/team/GEN/documents`);
   await openDocument(page);
   const dialog = page.getByRole('dialog');
   await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
   const content = `Retained offline document ${Date.now()}`;
   await page.route('**/api/v1/documents/*?*', (route) =>
      route.request().method() === 'PATCH' ? route.abort('failed') : route.continue()
   );
   await dialog.getByLabel('Markdown content').fill(content);
   await dialog.getByRole('button', { name: 'Done', exact: true }).click();
   await expect(dialog).toContainText('Save failed');
   await dialog.getByRole('button', { name: 'Close and keep local draft', exact: true }).click();
   await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.unroute('**/api/v1/documents/*?*');
   await page.reload();
   await openDocument(page);
   await expect(page.getByRole('dialog').getByText(content, { exact: true })).toBeVisible();
   await expect(page.getByRole('dialog')).toContainText('All changes saved.');
});

test('failed comment send retains the draft and retry posts one comment', async ({
   page,
   context,
}) => {
   const issue = fixture.issues[0];
   await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
   const content = `Offline draft ${Date.now()}`;
   await page.getByRole('textbox', { name: 'Comment', exact: true }).fill(content);
   await page.route('**/api/v1/comments', (route) => route.abort('failed'));
   await page.getByRole('button', { name: 'Comment', exact: true }).click();
   await expect(page.getByRole('textbox', { name: 'Comment', exact: true })).toHaveValue(content);
   await expect(page.getByRole('alert').filter({ hasText: /fetch|network/i })).toBeVisible();
   await page.unroute('**/api/v1/comments');
   await page.getByRole('button', { name: 'Comment', exact: true }).click();
   await expect(page.getByRole('article').filter({ hasText: content })).toHaveCount(1);
   const saved = (
      await (
         await context.request.get(
            `${api}/comments?workspaceId=${fixture.workspace_id}&issueId=${issue.id}`
         )
      ).json()
   ).data;
   expect(saved.filter((item: { content: string }) => item.content === content)).toHaveLength(1);
});

test('structured bug fields and comment attachments persist through the API', async ({
   page,
   context,
}) => {
   const issue = fixture.issues[1];
   await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
   await page.getByRole('button', { name: 'Edit type and bug details', exact: true }).click();
   await page.getByRole('button', { name: 'Bug', exact: true }).click();
   await page.getByRole('button', { name: 'CRITICAL', exact: true }).click();
   await page.getByLabel('Environment', { exact: true }).fill('Windows / Chromium regression');
   await page
      .getByLabel('Steps to reproduce', { exact: true })
      .fill('Open the issue on a narrow viewport');
   await page.getByLabel('Expected result', { exact: true }).fill('Properties are editable');
   await page.getByLabel('Actual result', { exact: true }).fill('Previous controls were hidden');
   await page.getByRole('button', { name: 'Save bug details', exact: true }).click();
   await expect(page.getByText('Severity: CRITICAL', { exact: true })).toBeVisible();
   const native = (
      await (
         await context.request.get(
            `${api}/issues/lookup/${issue.identifier}?workspaceId=${fixture.workspace_id}`
         )
      ).json()
   ).data;
   expect(native.issueType).toBe('BUG');
   expect(native.reproductionSteps).toBe('Open the issue on a narrow viewport');
   const content = `Attachment comment ${Date.now()}`;
   await page.getByRole('textbox', { name: 'Comment', exact: true }).fill(content);
   await page.getByRole('button', { name: 'Comment', exact: true }).click();
   const row = page.getByRole('article').filter({ hasText: content });
   await expect(row).toBeVisible();
   await row.getByLabel('Select comment attachments').setInputFiles({
      name: 'regression-log.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Synthetic attachment evidence'),
   });
   await expect(row.getByRole('link', { name: 'regression-log.txt' })).toBeVisible();
   const href = await row.getByRole('link', { name: 'regression-log.txt' }).getAttribute('href');
   const download = await context.request.get(href!);
   expect(await download.text()).toBe('Synthetic attachment evidence');
   await page.reload();
   await expect(
      page
         .getByRole('article')
         .filter({ hasText: content })
         .getByRole('link', { name: 'regression-log.txt' })
   ).toBeVisible();
});

test('Help search and project client presets expose meaningful actions', async ({ page }) => {
   await page.goto(`/${fixture.slug}/team/GEN/all`);
   await page.getByRole('button', { name: 'Help and keyboard shortcuts' }).click();
   const help = page.getByRole('dialog');
   await help.getByLabel('Search help topics').fill('password');
   await expect(help.getByText('Password recovery', { exact: true })).toBeVisible();
   await expect(help.getByText('Document editing and history', { exact: true })).toHaveCount(0);
   await page.goto(`/${fixture.slug}/settings/integrations`);
   await expect(page.getByRole('heading', { name: 'AI connections (MCP)' })).toBeVisible();
   await page.getByRole('button', { name: 'Coding project preset' }).click();
   await expect(page.getByRole('checkbox', { name: 'Write comments', exact: true })).toBeChecked();
   await expect(
      page.getByRole('button', { name: 'Create connection', exact: true })
   ).toBeDisabled();
   await page.getByRole('button', { name: 'Claude Code', exact: true }).click();
   await expect(page.getByText(/Bearer.*FLOWIE_MCP_TOKEN/)).toBeVisible();
});

test('SLA request Ask and emoji settings create persisted records', async ({ page }) => {
   const suffix = String(Date.now());
   await page.goto(`/${fixture.slug}/settings/slas`);
   await page.getByRole('button', { name: 'New SLA', exact: true }).click();
   await page.getByPlaceholder('SLA name').fill('Regression SLA ' + suffix);
   await page.getByLabel('Deadline duration').fill('2');
   await page.getByRole('button', { name: 'Create SLA', exact: true }).click();
   await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.reload();
   await expect(page.getByText('Regression SLA ' + suffix, { exact: true })).toBeVisible();
   await page.goto(`/${fixture.slug}/settings/customer-requests`);
   await page.getByRole('button', { name: 'New request', exact: true }).click();
   await page.getByPlaceholder('Request title').fill('Regression request ' + suffix);
   await page.getByPlaceholder('Customer or account').fill('Synthetic customer');
   await page.getByRole('button', { name: 'Create request', exact: true }).click();
   await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.reload();
   await expect(page.getByText('Regression request ' + suffix, { exact: true })).toBeVisible();
   await page.goto(`/${fixture.slug}/settings/asks`);
   await page.getByRole('button', { name: 'New Ask', exact: true }).click();
   await page.getByPlaceholder('What is being requested?').fill('Regression Ask ' + suffix);
   await page.getByRole('button', { name: 'Create Ask', exact: true }).click();
   await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.reload();
   await expect(page.getByText('Regression Ask ' + suffix, { exact: true })).toBeVisible();
   await page.goto(`/${fixture.slug}/settings/emojis`);
   await page.getByRole('button', { name: 'Upload', exact: true }).click();
   const dialog = page.getByRole('dialog');
   await dialog.getByLabel('Name', { exact: true }).fill('regression_' + suffix);
   await dialog.getByLabel('Image', { exact: true }).setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
         'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
         'base64'
      ),
   });
   await dialog.getByRole('button', { name: 'Upload', exact: true }).click();
   await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.reload();
   await expect(
      page.getByRole('img', { name: ':regression_' + suffix + ':', exact: true })
   ).toBeVisible();
});

test('document revision restore creates a new revision and survives reload', async ({
   page,
   context,
}) => {
   const endpoint = `${api}/documents/${fixture.documentId}?workspaceId=${fixture.workspace_id}`;
   const current = (await (await context.request.get(endpoint)).json()).data;
   const content = `Restore target ${Date.now()}`;
   const target = (
      await (
         await context.request.patch(endpoint, {
            data: { content, expectedVersion: current.version },
         })
      ).json()
   ).data;
   await context.request.patch(endpoint, {
      data: { content: 'Newer content before restore', expectedVersion: target.version },
   });
   await page.goto(`/${fixture.slug}/team/GEN/documents`);
   await openDocument(page);
   const dialog = page.getByRole('dialog');
   await dialog.getByRole('button', { name: 'Revision history', exact: true }).click();
   await dialog.getByRole('button', { name: `Compare v${target.version}`, exact: true }).click();
   await dialog.getByRole('button', { name: 'Restore selected revision', exact: true }).click();
   await dialog.getByRole('button', { name: 'Confirm restore', exact: true }).click();
   await expect(dialog.getByText(content, { exact: true })).toBeVisible();
   const restored = (await (await context.request.get(endpoint)).json()).data;
   expect(restored.content).toBe(content);
   expect(restored.version).toBeGreaterThan(target.version + 1);
   await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
   await page.reload();
   await openDocument(page);
   await expect(page.getByRole('dialog').getByText(content, { exact: true })).toBeVisible();
});

test('empty cycle and failed list requests show distinct recoverable states', async ({ page }) => {
   await page.goto(`/${fixture.slug}/team/GEN/cycle/active`);
   await expect(page.getByText('No active cycle', { exact: true })).toBeVisible();
   await page.route('**/api/v1/issues?*', (route) => route.abort('failed'));
   await page.goto(`/${fixture.slug}/team/GEN/all`);
   await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
   await page.unroute('**/api/v1/issues?*');
   await page.getByRole('button', { name: 'Retry', exact: true }).click();
   await expect(page.getByText(fixture.issues[0].title, { exact: true }).first()).toBeVisible();
});

test('Inbox opens an uncached task, sends comments and exposes attachments and properties', async ({
   page,
   context,
}) => {
   const bulkRequests: string[] = [];
   page.on('request', (request) => {
      if (/\/api\/v1\/issues\?/.test(request.url())) bulkRequests.push(request.url());
   });
   await page.goto(`/${fixture.slug}/inbox`);
   await page
      .getByRole('button', { name: `Open notification: ${fixture.issues[0].title}`, exact: true })
      .click();
   await expect(
      page.getByRole('heading', { name: fixture.issues[0].title, exact: true })
   ).toBeVisible();
   const content = `Inbox comment ${Date.now()}`;
   await page.getByRole('textbox', { name: 'Comment', exact: true }).fill(content);
   await page.getByRole('button', { name: 'Comment', exact: true }).click();
   await expect(page.getByRole('article').filter({ hasText: content })).toBeVisible();
   await page.getByRole('button', { name: 'Properties', exact: true }).click();
   await expect(page.getByRole('combobox', { name: /Status:/ }).first()).toBeVisible();
   await expect(page.getByRole('button', { name: 'Attach file', exact: true })).toBeVisible();
   const saved = (
      await (
         await context.request.get(
            `${api}/comments?workspaceId=${fixture.workspace_id}&issueId=${fixture.issues[0].id}`
         )
      ).json()
   ).data;
   expect(saved.some((item: { content: string }) => item.content === content)).toBeTruthy();
   expect(bulkRequests).toEqual([]);
});

test('Inbox shows failed loads with Retry instead of an empty notification list', async ({
   page,
}) => {
   await page.route('**/api/v1/notifications?*', (route) => route.abort('failed'));
   await page.goto(`/${fixture.slug}/inbox`);
   await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
   await expect(page.getByText('No notifications to show.', { exact: true })).toHaveCount(0);
   await page.unroute('**/api/v1/notifications?*');
   await page.getByRole('button', { name: 'Retry', exact: true }).click();
   await expect(
      page.getByRole('button', {
         name: `Open notification: ${fixture.issues[0].title}`,
         exact: true,
      })
   ).toBeVisible();
});

test('older comments and a long reply thread load in bounded pages', async ({ page, context }) => {
   const issue = fixture.issues[1];
   const suffix = String(Date.now());
   let newest = '';
   for (let index = 0; index < 31; index++) {
      const response = await context.request.post(`${api}/comments`, {
         data: {
            workspaceId: fixture.workspace_id,
            issueId: issue.id,
            content: `Paged ${suffix} root ${index}`,
         },
      });
      expect(response.ok()).toBeTruthy();
      newest = (await response.json()).data.id;
   }
   for (let index = 0; index < 8; index++) {
      const response = await context.request.post(`${api}/comments`, {
         data: {
            workspaceId: fixture.workspace_id,
            issueId: issue.id,
            parentCommentId: newest,
            content: `Thread ${suffix} reply ${index}`,
         },
      });
      expect(response.ok()).toBeTruthy();
   }
   await page.goto(`/${fixture.slug}/issue/${issue.identifier}`);
   await expect(page.getByText(`Paged ${suffix} root 30`, { exact: true })).toBeVisible();
   await expect(page.getByText(`Paged ${suffix} root 0`, { exact: true })).toHaveCount(0);
   await page.getByRole('button', { name: 'Load older comments', exact: true }).click();
   await expect(page.getByText(`Paged ${suffix} root 0`, { exact: true })).toBeVisible();
   await expect(page.getByText(`Thread ${suffix} reply 0`, { exact: true })).toHaveCount(0);
   const parent = page.getByRole('article').filter({ hasText: `Paged ${suffix} root 30` });
   await parent
      .locator('..')
      .getByRole('button', { name: 'Load more replies to Regression Owner', exact: true })
      .click();
   await expect(page.getByText(`Thread ${suffix} reply 0`, { exact: true })).toBeVisible();
});

test('workspace search finds server records and opens a document directly', async ({ page }) => {
   await page.goto(`/${fixture.slug}/search`);
   await page
      .getByLabel('Search issues, documents, projects and members')
      .fill('Regression Markdown');
   await page.getByRole('link', { name: fixture.documentTitle, exact: true }).click();
   await expect(page.getByRole('dialog')).toBeVisible();
   await expect(page).toHaveURL(new RegExp(`/documents/${fixture.documentId}`));
});
