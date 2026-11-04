import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const base = process.env.FLOWIE_E2E_BASE_PATH ?? '';

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
   await expect(logo.locator('image')).toHaveAttribute('href', `${base}/brand/flowie-logo.svg`);
   const icon = await context.request.get(`${base}/flowie-icon.svg`);
   expect(icon.ok()).toBeTruthy();
   expect((await icon.text()).match(/<image /g)).toHaveLength(3);
   const manifest = await context.request.get(`${base}/manifest.webmanifest`);
   expect(
      (await manifest.json()).icons.every(
         (item: { src: string }) => item.src === `${base}/flowie-icon.svg`
      )
   ).toBeTruthy();
   const motion = await context.request.get(`${base}/brand/flowie-motion.svg`);
   const markup = await motion.text();
   expect(markup.match(/<image /g)).toHaveLength(5);
   expect(markup).toContain('animation-duration:5s');
   expect(markup).not.toMatch(/<rect|blur\(|opacity:0/);
   expect(markup).not.toMatch(/<script|foreignObject|https?:\/\/(?!www\.w3\.org)/);
   await page.screenshot({ path: testInfo.outputPath('brand-auth-light.png') });
   await page.emulateMedia({ colorScheme: 'dark' });
   await page.reload();
   await expect(page.locator('html')).toHaveClass(/dark/);
   await expect(logo.locator('image')).toHaveAttribute(
      'href',
      `${base}/brand/flowie-logo-dark.svg`
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
   await expect(page.locator('html')).toHaveClass(/dark/);
   await expect(logo.locator('image')).toHaveAttribute(
      'href',
      `${base}/brand/flowie-logo-dark.svg`
   );
   await page.reload();
   await expect(logo.locator('image')).toHaveAttribute(
      'href',
      `${base}/brand/flowie-logo-dark.svg`
   );
   const probe = await context.newPage();
   await probe.goto(`${base}/brand/flowie-motion.svg`);
   const frames = await probe.evaluate(() => {
      const animations = document.getAnimations();
      const blue = document.querySelector('.blue')!;
      return [0, 1250, 2500, 3750, 5000].map((time) => {
         for (const animation of animations) {
            animation.pause();
            animation.currentTime = time;
         }
         return {
            transform: getComputedStyle(blue).transform,
            visible: [...document.querySelectorAll('image')].every(
               (el) => getComputedStyle(el).opacity === '1'
            ),
         };
      });
   });
   expect(frames.every((frame) => frame.visible)).toBeTruthy();
   expect(frames[0].transform).not.toEqual(frames[2].transform);
   await probe.emulateMedia({ reducedMotion: 'reduce' });
   expect(await probe.evaluate(() => document.getAnimations().length)).toBe(0);
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
      .toContain('/brand/flowie-motion-dark.svg');
   expect((await image.boundingBox())!.width).toBeCloseTo(logoBefore.width, 0);
   expect((await image.boundingBox())!.height).toBeCloseTo(logoBefore.height, 0);
   await page.emulateMedia({ reducedMotion: 'reduce' });
   await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-logo-dark.svg');
   await page.screenshot({ path: testInfo.outputPath('brand-loading-reduced-mobile.png') });
   await page.emulateMedia({ reducedMotion: 'no-preference' });
   await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-motion-dark.svg');
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
   const symbol = status.locator('picture img');
   await expect(symbol).toBeVisible();
   await expect
      .poll(() => symbol.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-symbol-motion.svg');
   expect((await symbol.boundingBox())!.width).toBeLessThan(80);
   await page.emulateMedia({ reducedMotion: 'reduce' });
   await expect
      .poll(() => symbol.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/flowie-icon.svg');
   await page.screenshot({ path: testInfo.outputPath('brand-shared-loading.png') });
   releaseIssue();
   await page.unrouteAll({ behavior: 'wait' });
   expect(hydrationErrors).toEqual([]);
});
