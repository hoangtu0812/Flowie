import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const base = process.env.FLOWIE_E2E_BASE_PATH ?? '';

// The supplied pixel kit animates ten sliced layers on a 5.5s loop: three
// ribbons slide in, the wordmark letters stagger, then the green dot pops.
// VI: Bộ pixel được cung cấp chuyển động mười lớp đã cắt trong vòng 5,5 giây:
// ba dải màu trượt vào, các chữ của wordmark lần lượt hiện, rồi chấm xanh bật lên.
const layers = ['k-blue', 'k-teal', 'k-green', 'k-F', 'k-l', 'k-o', 'k-w', 'k-i', 'k-e', 'k-dot'];

test('supplied branding loads locally and motion respects reduced-motion preferences', async ({
   page,
   context,
}, testInfo) => {
   const hydrationErrors: string[] = [];
   page.on('console', (message) => {
      if (message.type() === 'error' && /hydration|hydrating|#418|#425/i.test(message.text()))
         hydrationErrors.push(message.text());
   });
   await page.goto(`${base}/auth/login`);
   const logo = page.getByRole('img', { name: 'Flowie', exact: true });
   await expect(logo).toBeVisible();
   await expect(logo.locator('image')).toHaveAttribute(
      'href',
      `${base}/brand/flowie-pixel-logo.svg`
   );
   const icon = await context.request.get(`${base}/flowie-icon.svg`);
   expect(icon.ok()).toBeTruthy();
   const iconMarkup = await icon.text();
   expect(iconMarkup.match(/<image /g)).toHaveLength(1);
   // Pixel art that is resampled smoothly stops reading as pixel art, so both
   // still assets must ask for nearest-neighbour scaling.
   // VI: Pixel art bị nội suy mượt sẽ không còn ra pixel art, nên cả hai asset
   // tĩnh đều phải yêu cầu phóng theo điểm ảnh gần nhất.
   expect(iconMarkup).toContain('image-rendering:pixelated');
   const still = await context.request.get(`${base}/brand/flowie-pixel-logo.svg`);
   expect(await still.text()).toContain('image-rendering:pixelated');
   const manifest = await context.request.get(`${base}/manifest.webmanifest`);
   expect(
      (await manifest.json()).icons.every(
         (item: { src: string }) => item.src === `${base}/flowie-icon.svg`
      )
   ).toBeTruthy();
   const motion = await context.request.get(`${base}/brand/flowie-pixel-motion.svg`);
   const markup = await motion.text();
   expect(markup.match(/<image /g)).toHaveLength(layers.length);
   expect(markup).toContain('animation:k-blue 5.5s steps(6,end) infinite');
   // The asset carries its own reduced-motion fallback, so it behaves even when
   // something renders it outside FlowieLogo's picture element.
   // VI: Asset tự mang phương án giảm chuyển động, nên vẫn đúng khi được render
   // ở ngoài phần tử picture của FlowieLogo.
   expect(markup).toContain('@media(prefers-reduced-motion:reduce)');
   // A background rectangle would show as a light slab on the dark theme.
   // VI: Một hình chữ nhật nền sẽ thành mảng sáng trên theme tối.
   expect(markup).not.toContain('<rect');
   expect(markup).not.toMatch(/<script|foreignObject|<use |https?:\/\/(?!www\.w3\.org)/);
   await page.screenshot({ path: testInfo.outputPath('brand-auth-light.png') });
   await page.emulateMedia({ colorScheme: 'dark' });
   await page.reload();
   await expect(page.locator('html')).toHaveClass(/dark/);
   await expect(logo.locator('image')).toHaveAttribute(
      'href',
      `${base}/brand/flowie-pixel-logo-dark.svg`
   );
   await page.screenshot({ path: testInfo.outputPath('brand-auth-dark.png') });
   await page.evaluate(() =>
      localStorage.setItem(
         'theme-settings',
         JSON.stringify({ state: { mode: 'dark' }, version: 0 })
      )
   );
   await page.emulateMedia({ colorScheme: 'light' });
   await page.reload();
   // The app's own theme wins over the system preference, both times.
   // VI: Theme của app thắng tuỳ chọn hệ thống, ở cả hai lần tải.
   await expect(page.locator('html')).toHaveClass(/dark/);
   await expect(logo.locator('image')).toHaveAttribute(
      'href',
      `${base}/brand/flowie-pixel-logo-dark.svg`
   );
   await page.reload();
   await expect(logo.locator('image')).toHaveAttribute(
      'href',
      `${base}/brand/flowie-pixel-logo-dark.svg`
   );

   const probe = await context.newPage();
   for (const variant of ['flowie-pixel-motion.svg', 'flowie-pixel-motion-dark.svg']) {
      await probe.goto(`${base}/brand/${variant}`);
      const sampled = await probe.evaluate(
         ({ names, times }) => {
            const animations = document.getAnimations();
            const durations = animations.map(
               (animation) => animation.effect!.getComputedTiming().duration
            );
            const frames = times.map((time) => {
               for (const animation of animations) {
                  animation.pause();
                  animation.currentTime = time;
               }
               return Object.fromEntries(
                  names.map((name) => [
                     name,
                     Number(getComputedStyle(document.querySelector('.' + name)!).opacity),
                  ])
               );
            });
            return { count: animations.length, durations, frames };
         },
         { names: layers, times: [0, 1000, 2000, 3000] }
      );
      expect(sampled.count).toBe(layers.length);
      expect(sampled.durations.every((duration) => duration === 5500)).toBeTruthy();
      const [start, ribbons, wordmark, settled] = sampled.frames;
      // Nothing is on screen when the loop begins.
      // VI: Không có gì trên màn hình khi vòng lặp bắt đầu.
      expect(Object.values(start).every((opacity) => opacity === 0)).toBeTruthy();
      // The ribbons arrive in order, and neither the last letter nor the dot has
      // started while they do.
      // VI: Các dải màu vào theo thứ tự, và cả chữ cuối lẫn chấm xanh đều chưa
      // bắt đầu trong lúc đó.
      expect(ribbons['k-blue']).toBeGreaterThanOrEqual(ribbons['k-teal']);
      expect(ribbons['k-teal']).toBeGreaterThanOrEqual(ribbons['k-green']);
      expect(ribbons['k-e']).toBe(0);
      expect(ribbons['k-dot']).toBe(0);
      // The dot still waits once the ribbons have fully arrived.
      // VI: Chấm xanh vẫn chờ sau khi các dải màu đã vào hết.
      expect(wordmark['k-green']).toBe(1);
      expect(wordmark['k-dot']).toBe(0);
      // Mid-hold the whole logo is assembled.
      // VI: Giữa đoạn giữ, toàn bộ logo đã hoàn chỉnh.
      expect(Object.values(settled).every((opacity) => opacity === 1)).toBeTruthy();
      for (const time of [1000, 2000, 3000]) {
         await probe.evaluate((time) => {
            for (const animation of document.getAnimations()) animation.currentTime = time;
         }, time);
         await probe.screenshot({ path: testInfo.outputPath(`timeline-${time}-${variant}.png`) });
      }
   }
   await probe.emulateMedia({ reducedMotion: 'reduce' });
   expect(await probe.evaluate(() => document.getAnimations().length)).toBe(0);
   expect(
      await probe.evaluate(() =>
         [...document.querySelectorAll('image')].every(
            (el) =>
               getComputedStyle(el).opacity === '1' && getComputedStyle(el).transform === 'none'
         )
      )
   ).toBeTruthy();
   await probe.close();

   await page.setViewportSize({ width: 390, height: 844 });
   let release!: () => void;
   const pending = new Promise<void>((resolve) => {
      release = resolve;
   });
   await page.route('**/api/v1/auth/login', async (route) => {
      await pending;
      await route.continue();
   });
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   const logoBefore = (await logo.boundingBox())!;
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   const image = page.locator('picture img[alt="Flowie"]');
   await expect(image).toBeVisible();
   await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-pixel-motion-dark.svg');
   // Submitting must not resize the logo, or the form jumps under the pointer.
   // VI: Lúc gửi form logo không được đổi kích thước, nếu không form nhảy dưới con trỏ.
   expect((await image.boundingBox())!.width).toBeCloseTo(logoBefore.width, 0);
   expect((await image.boundingBox())!.height).toBeCloseTo(logoBefore.height, 0);
   await page.emulateMedia({ reducedMotion: 'reduce' });
   await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-pixel-logo-dark.svg');
   await page.screenshot({ path: testInfo.outputPath('brand-loading-reduced-mobile.png') });
   await page.emulateMedia({ reducedMotion: 'no-preference' });
   await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-pixel-motion-dark.svg');
   release();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   let releaseIssue!: () => void;
   const issuePending = new Promise<void>((resolve) => {
      releaseIssue = resolve;
   });
   await page.route('**/api/v1/issues/**', async (route) => {
      if (route.request().method() === 'GET') await issuePending;
      await route.continue();
   });
   await page.goto(`${base}/${fixture.slug}/issue/GEN-999999`);
   const status = page.getByRole('status').filter({ hasText: 'Loading issue' });
   await expect(status).toBeVisible();
   const loadingLogo = status.locator('picture img');
   await expect(loadingLogo).toBeVisible();
   await expect
      .poll(() => loadingLogo.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-pixel-motion-dark.svg');
   expect((await loadingLogo.boundingBox())!.width).toBe(256);
   expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
   ).toBeTruthy();
   await loadingLogo.evaluate((el) => (el as HTMLImageElement).decode());
   const entering = await loadingLogo.screenshot();
   // A slow WebKit runner can paint the next frame later than a fixed wait allows.
   // shortcut: WebKit on Linux keeps this SVG image on one frame in screenshots, so frames are
   // compared everywhere else; compare there too if a later Playwright WebKit advances them.
   // VI: Máy WebKit chậm có thể vẽ frame kế tiếp muộn hơn một khoảng chờ cố định.
   // VI: shortcut: WebKit trên Linux giữ ảnh SVG này ở một frame khi chụp màn hình nên chỉ so frame ở
   // VI: nơi khác; so cả ở đó nếu bản WebKit của Playwright sau này chuyển được frame.
   if (testInfo.project.name !== 'webkit' || process.platform !== 'linux') {
      await expect
         .poll(async () => (await loadingLogo.screenshot()).equals(entering), { timeout: 8000 })
         .toBe(false);
   }
   await page.waitForTimeout(1800);
   await page.screenshot({ path: testInfo.outputPath('brand-shared-motion-mobile.png') });
   await page.emulateMedia({ reducedMotion: 'reduce' });
   await expect
      .poll(() => loadingLogo.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-pixel-logo-dark.svg');
   await page.screenshot({ path: testInfo.outputPath('brand-shared-loading.png') });
   releaseIssue();
   await page.unrouteAll({ behavior: 'wait' });
   expect(hydrationErrors).toEqual([]);
});
