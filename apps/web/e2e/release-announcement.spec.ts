import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   userId: string;
   email: string;
   password: string;
};
const api = 'http://localhost:4000/api/v1',
   endpoint = `${api}/users/me/ui-preferences`;
const semver = /^\d+\.\d+\.\d+$/;

test('a new release announces itself once per account and stays closed afterwards', async ({
   page,
   context,
}) => {
   test.setTimeout(90000);
   const errors: string[] = [];
   // WebKit reports a request cancelled by navigation as a page error worded
   // "… due to access control checks.", so each goto here contributes one per
   // RSC prefetch still in flight. Those are cancelled loads, not exceptions the
   // app threw, and no other engine surfaces them this way — the assertion below
   // is still looking for real exceptions from the announcement.
   // VI: WebKit báo request bị huỷ do điều hướng thành page error với nội dung
   // "… due to access control checks.", nên mỗi lần goto ở đây sinh thêm một
   // dòng cho từng RSC prefetch còn đang bay. Đó là request bị huỷ, không phải
   // exception do app ném ra, và không engine nào khác báo kiểu này — khẳng định
   // bên dưới vẫn đang tìm exception thật từ phần thông báo.
   page.on('pageerror', (value) => {
      if (!/due to access control checks\.$/.test(value.message)) errors.push(value.message);
   });
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const read = async () => (await (await context.request.get(endpoint)).json()).data;
   const announcement = page.getByRole('dialog', { name: "What's new in Flowie" });
   const original = await read();
   // Writes the version this account has supposedly seen. The open page records
   // the running version by itself, so a write of ours can lose the optimistic
   // version race; retrying on 409 keeps the fixture deterministic. Locale is
   // pinned because the accessible names below are the English ones.
   const record = async (version: string | null) => {
      await expect
         .poll(
            async () => {
               const current = await read();
               const response = await context.request.put(endpoint, {
                  data: {
                     accountId: fixture.userId,
                     expectedVersion: current.version,
                     values: { ...current.values, locale: 'en', lastSeenReleaseVersion: version },
                  },
               });
               return response.status();
            },
            { timeout: 20000 }
         )
         .toBe(200);
   };
   try {
      // An account that has never been told about a release is not interrupted:
      // the running version is recorded silently and no dialog opens.
      await record(null);
      await page.goto(`/${fixture.slug}/dashboard`);
      await page.waitForLoadState('networkidle');
      await expect
         .poll(async () => (await read()).values.lastSeenReleaseVersion, { timeout: 20000 })
         .toMatch(semver);
      await expect(announcement).toHaveCount(0);
      const running = (await read()).values.lastSeenReleaseVersion as string;

      // An account that last saw an older release is told about this one, once.
      await record('0.0.1');
      await page.goto(`/${fixture.slug}/dashboard`);
      await expect(announcement).toBeVisible();
      await expect(announcement).toContainText(`Flowie v${running}`);
      // Every entry has to be reachable. A release carries as many entries as it
      // carries, so the dialog must stay inside the viewport and scroll its body
      // rather than grow past the screen and clip the rest: 0.14.0 shipped with
      // eleven entries and nothing below the fifth could be read. Scrolling to
      // the last one is a no-op when they already fit, so this holds either way.
      // VI: Mọi mục đều phải xem được. Một bản phát hành có bao nhiêu mục là bấy
      // nhiêu, nên dialog phải nằm trong khung nhìn và cuộn phần thân thay vì
      // giãn quá màn hình rồi cắt cụt phần còn lại: bản 0.14.0 phát hành với mười
      // một mục mà không đọc được gì dưới mục thứ năm. Cuộn tới mục cuối không
      // làm gì khi chúng vốn đã vừa màn hình, nên khẳng định này đúng cả hai cách.
      const viewport = page.viewportSize()!;
      expect((await announcement.boundingBox())!.height).toBeLessThanOrEqual(viewport.height);
      const lastEntry = announcement.getByRole('listitem').last();
      await lastEntry.scrollIntoViewIfNeeded();
      await expect(lastEntry).toBeInViewport();
      await announcement.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(announcement).toHaveCount(0);
      await expect
         .poll(async () => (await read()).values.lastSeenReleaseVersion, { timeout: 20000 })
         .toBe(running);

      // Closing it is remembered on the account, not in this page's state.
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(announcement).toHaveCount(0);

      // The same notes stay reachable on demand from Help & feedback.
      await page.getByRole('button', { name: 'Help and keyboard shortcuts', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Read release notes', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Flowie help' })).toContainText(
         `Flowie v${running}`
      );
      expect(errors).toEqual([]);
   } finally {
      const current = await read();
      await context.request.put(endpoint, {
         data: {
            accountId: fixture.userId,
            expectedVersion: current.version,
            values: original.values,
         },
      });
   }
});
