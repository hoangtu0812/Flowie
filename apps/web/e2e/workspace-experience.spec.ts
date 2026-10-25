import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, locale: 'en' | 'vi' = 'en') {
   const state = {
      accountId: 'account-one',
      version: 1,
      failSave: false,
      failReport: false,
      signInNext: null as string | null,
      memberships: ['alpha', 'beta'],
      values: {
         locale,
         defaultHome: 'inbox',
         defaultWorkspaceId: null as string | null,
         commentSubmitMode: 'modifier-enter',
         timezone: 'Asia/Ho_Chi_Minh',
         weekStart: 1,
         autoAssignSelf: false,
         fontSize: 'default',
         pointerCursors: true,
         underlineLinks: false,
      },
      queries: [] as Record<string, unknown>[],
   };
   await page
      .context()
      .addCookies([
         { name: 'flowie_refresh', value: 'synthetic-session', url: 'http://localhost:3100' },
      ]);
   await page.addInitScript(() => {
      localStorage.setItem('theme', 'light');
      localStorage.setItem(
         'theme-settings',
         JSON.stringify({
            state: { mode: 'light', lightVariant: 'pure-light', darkVariant: 'dark' },
            version: 0,
         })
      );
   });
   await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      let data: unknown = [];
      if (path === '/users/me')
         data = {
            id: state.accountId,
            name: 'Test member',
            email: 'test@example.test',
            isPlatformAdmin: false,
         };
      if (path === '/users/me/ui-preferences') {
         if (route.request().method() === 'PUT') {
            if (state.failSave)
               return route.fulfill({
                  status: 409,
                  json: { message: 'Preferences changed on another device. Reload before saving.' },
               });
            const body = route.request().postDataJSON();
            expect(body.accountId).toBe(state.accountId);
            expect(body.expectedVersion).toBe(state.version);
            Object.assign(state.values, body.values);
            state.version++;
         }
         data = { accountId: state.accountId, version: state.version, values: state.values };
      }
      if (path === '/workspaces/me')
         data = state.memberships.map((slug) => ({
            id: slug + '-member',
            role: 'OWNER',
            workspace: {
               id: slug,
               slug,
               name: slug === 'beta' ? 'Design workspace' : 'First workspace',
            },
         }));
      if (path === '/teams')
         data = [{ id: 'team', name: 'Product team', key: 'DEV', joined: true, icon: '🛠️' }];
      if (path === '/issue-statuses') data = [{ id: 'todo', name: 'Todo', teamId: 'team' }];
      if (path === '/issues/options')
         data = {
            statuses: [],
            priorities: [],
            labels: [],
            projects: [],
            members: [],
            teams: [],
            cycles: [],
            releases: [],
         };
      if (path === '/auth/providers') data = { microsoft: { enabled: false } };
      if (path === '/auth/login' || path === '/auth/mfa/verify')
         return route.fulfill({
            headers: {
               'Set-Cookie': 'flowie_refresh=synthetic-session; Path=/; HttpOnly; SameSite=Lax',
            },
            json: {
               data: {
                  next: state.signInNext,
                  workspace: { slug: 'alpha' },
                  user: { isPlatformAdmin: false },
               },
            },
         });
      if (path === '/reports/workflow') {
         state.queries.push(route.request().postDataJSON());
         if (state.failReport)
            return route.fulfill({
               status: 503,
               json: { message: 'Reports temporarily unavailable' },
            });
         data = {
            asOf: '2026-10-25T10:00:00Z',
            summary: {
               total: 34,
               open: 29,
               wip: 9,
               completed: 5,
               canceled: 0,
               overdue: 17,
               created_in_range: 8,
               estimated_effort: 9.5,
               actual_effort: 0.5,
            },
            flow: {
               observed_completions: 5,
               lead_mean_seconds: 86400,
               lead_p50_seconds: 72000,
               lead_p85_seconds: 172800,
               lead_samples: 5,
               cycle_mean_seconds: null,
               cycle_p50_seconds: null,
               cycle_p85_seconds: null,
               cycle_samples: 0,
            },
            aging: { under_7_days: 7, days_7_14: 4, days_14_30: 3, days_30_plus: 5, unknown: 10 },
            reopens: { reopened: 1, bugs_reopened: 1 },
            trend: Array.from({ length: 7 }, (_, index) => ({
               day: '2026-10-' + (19 + index),
               created: index % 3,
               completed: index % 2,
               wip: 9,
               unknown: 4,
               complete: true,
            })),
            statuses: [
               { id: 'todo', name: 'Todo', category: 'UNSTARTED', count: 17 },
               { id: 'started', name: 'In progress', category: 'STARTED', count: 12 },
               { id: 'done', name: 'Done', category: 'COMPLETED', count: 5 },
            ],
         };
      }
      await route.fulfill({
         json: { data, meta: { total: Array.isArray(data) ? data.length : 0, nextCursor: null } },
      });
   });
   return state;
}

for (const method of ['password', 'MFA'] as const) {
   for (const destination of ['default workspace', 'direct link'] as const) {
      test(`fresh ${method} sign-in escapes anonymous prefetches and opens the ${destination}`, async ({
         page,
      }) => {
         const state = await fixture(page);
         state.values.defaultWorkspaceId = 'beta';
         state.signInNext = destination === 'direct link' ? '/alpha/reports' : null;
         await page.context().clearCookies();
         const prefetch = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return url.pathname === '/' && url.searchParams.has('_rsc');
         });
         await page.goto(
            method === 'MFA'
               ? '/auth/mfa'
               : `/auth/login${state.signInNext ? '?next=' + encodeURIComponent(state.signInNext) : ''}`
         );
         await prefetch;
         if (method === 'MFA') {
            await page.getByRole('textbox', { name: 'Verification code' }).fill('123456');
            await page.getByRole('button', { name: 'Verify sign-in', exact: true }).click();
         } else {
            await page.getByLabel('Email', { exact: true }).fill('test@example.test');
            await page.getByLabel('Password', { exact: true }).fill('test-password');
            await page.getByRole('button', { name: 'Sign in', exact: true }).click();
         }
         await expect(page).toHaveURL(state.signInNext ?? '/beta/inbox');
      });
   }
}

test('default workspace persists across returning, sign-in and direct links, with safe fallback', async ({
   page,
}) => {
   const state = await fixture(page);
   await page.goto('/beta/reports');
   await page.getByRole('button', { name: /Design workspace/ }).click();
   await expect(page.getByRole('menuitem', { name: 'Set as default workspace' })).toBeEnabled();
   await page.getByRole('menuitem', { name: 'Set as default workspace' }).click();
   await expect(page.getByText('Default workspace saved', { exact: true })).toBeVisible();
   expect(state.values.defaultWorkspaceId).toBe('beta');
   await page.goto('/');
   await expect(page).toHaveURL('/beta/inbox');
   await page.goto('/alpha/reports');
   await expect(page).toHaveURL('/alpha/reports');
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill('test@example.test');
   await page.getByLabel('Password', { exact: true }).fill('test-password');
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL('/beta/inbox');
   state.memberships = ['alpha'];
   await page.goto('/');
   await expect(page).toHaveURL('/alpha/inbox');
   state.memberships = ['alpha', 'beta'];
   state.accountId = 'account-two';
   state.values.defaultWorkspaceId = null;
   await page.goto('/');
   await expect(page).toHaveURL('/alpha/inbox');
});

test('default workspace save errors remain visible and the preference can be removed', async ({
   page,
}) => {
   const state = await fixture(page);
   state.values.defaultWorkspaceId = 'beta';
   state.failSave = true;
   await page.goto('/beta/reports');
   await page.getByRole('button', { name: /Design workspace/ }).click();
   await page.getByRole('menuitem', { name: 'Remove default workspace' }).click();
   await expect(
      page.getByText('Preferences changed on another device. Reload before saving.')
   ).toBeVisible();
   expect(state.values.defaultWorkspaceId).toBe('beta');
   state.failSave = false;
   await page.getByRole('button', { name: /Design workspace/ }).click();
   await page.getByRole('menuitem', { name: 'Remove default workspace' }).click();
   await expect(page.getByText('Default workspace removed', { exact: true })).toBeVisible();
   expect(state.values.defaultWorkspaceId).toBeNull();
});

test('reports keep filters, daily drilldown and recovery usable at desktop and mobile widths', async ({
   page,
}, testInfo) => {
   const state = await fixture(page);
   const errors: string[] = [];
   page.on('pageerror', (error) => errors.push(error.message));
   await page.setViewportSize({ width: 1600, height: 1100 });
   await page.goto('/beta/reports');
   await expect(page.getByRole('group', { name: 'Accessible tasks', exact: true })).toContainText(
      '34'
   );
   const heading = page.getByRole('heading', { name: 'Workspace analytics', exact: true });
   await expect
      .poll(() => heading.evaluate((node) => getComputedStyle(node).colorScheme))
      .toBe('light');
   await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('reports-desktop.png'),
      fullPage: true,
   });
   await page.getByRole('button', { name: 'More filters and calendar settings' }).click();
   await page.getByRole('textbox', { name: 'Report timezone', exact: true }).fill('UTC');
   await page.getByRole('textbox', { name: 'Report task search', exact: true }).fill('Design');
   await page.getByRole('button', { name: 'Apply report filters' }).click();
   await expect.poll(() => state.queries.at(-1)?.timezone).toBe('UTC');
   await page.getByRole('button', { name: 'Show daily values' }).click();
   await page.getByText('2026-10-19', { exact: true }).click();
   await expect(page.getByRole('heading', { name: 'Captured activity: 2026-10-19' })).toBeVisible();
   await page.getByRole('button', { name: 'Close day activity' }).click();
   await page.setViewportSize({ width: 390, height: 844 });
   await page
      .getByRole('heading', { name: 'Workspace analytics', exact: true })
      .scrollIntoViewIfNeeded();
   await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('reports-mobile.png'),
      fullPage: true,
   });
   expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
   ).toBe(true);
   const apply = await page.getByRole('button', { name: 'Apply report filters' }).boundingBox();
   expect(apply!.x + apply!.width).toBeLessThanOrEqual(390);
   state.failReport = true;
   await page.getByRole('button', { name: 'Refresh workspace analytics' }).click();
   await expect(
      page.getByRole('alert').filter({ hasText: 'Reports temporarily unavailable' })
   ).toBeVisible();
   state.failReport = false;
   await page.getByRole('button', { name: 'Refresh workspace analytics' }).click();
   await expect(page.getByRole('group', { name: 'Accessible tasks', exact: true })).toContainText(
      '34'
   );
   await page.setViewportSize({ width: 1600, height: 1100 });
   await page.getByRole('button', { name: 'Toggle theme' }).click();
   await page.getByRole('menuitem', { name: 'Dark', exact: true }).click();
   await page.getByRole('menuitem', { name: 'Classic Dark', exact: true }).click();
   await expect
      .poll(() => heading.evaluate((node) => getComputedStyle(node).colorScheme))
      .toBe('dark');
   await heading.scrollIntoViewIfNeeded();
   await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('reports-dark.png') });
   expect(errors).toEqual([]);
});

test('Help restores release highlights and provides searchable Vietnamese guidance and shortcuts', async ({
   page,
}, testInfo) => {
   await fixture(page, 'vi');
   await page.setViewportSize({ width: 1280, height: 900 });
   await page.goto('/beta/reports');
   await page.getByRole('button', { name: 'Trợ giúp và phím tắt' }).click();
   await expect(page.getByRole('menu').getByText('Có gì mới', { exact: true })).toBeVisible();
   await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('help-menu.png') });
   await page.getByRole('menuitem', { name: 'Xem thông tin bản cập nhật' }).click();
   await expect(page.getByRole('dialog')).toBeVisible();
   await expect(page.getByRole('heading', { name: 'Có gì mới' })).toBeVisible();
   await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('release-notes.png'),
   });
   await page.getByRole('button', { name: 'Hướng dẫn chức năng', exact: true }).click();
   await page.getByRole('textbox', { name: 'Tìm hướng dẫn' }).fill('chi so bao cao');
   await expect(page.getByText(/Mean là trung bình/)).toBeVisible();
   await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('help-guide.png') });
   await page.getByRole('button', { name: 'Phím tắt', exact: true }).click();
   await expect(page.getByText('Mở bảng lệnh', { exact: true })).toBeVisible();
   await page.setViewportSize({ width: 390, height: 844 });
   await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('help-mobile.png') });
   const dialog = await page.getByRole('dialog').boundingBox();
   expect(dialog!.x).toBeGreaterThanOrEqual(0);
   expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(390);
   await page.keyboard.press('Escape');
   await expect(page.getByRole('dialog')).not.toBeVisible();
   await page.keyboard.press('Control+/');
   await expect(page.getByRole('dialog')).toBeVisible();
   await page.keyboard.press('Escape');
   await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
   await page.getByRole('button', { name: 'Trợ giúp và phím tắt' }).click();
   await page.getByRole('menuitem', { name: 'Hướng dẫn chức năng' }).click();
   await expect(page.getByRole('dialog')).toHaveCount(1);
   await expect(page.getByRole('heading', { name: 'Trợ giúp Flowie', exact: true })).toBeVisible();
});
