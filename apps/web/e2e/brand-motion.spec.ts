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
   const motion = await context.request.get(`${base}/brand/flowie-motion-v2.svg`);
   const markup = await motion.text();
   expect(markup.match(/<image /g)).toHaveLength(5);
   expect(markup).toContain('animation-duration:5s');
   expect(markup).not.toContain('<rect');
   expect(markup).toContain('animation-fill-mode:both');
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
   for (const variant of ['flowie-motion-v2.svg', 'flowie-motion-dark-v2.svg']) {
      await probe.goto(`${base}/brand/${variant}`);
      const frames = await probe.evaluate(() => {
         const animations = document.getAnimations();
         return [0, 1000, 1500, 2000, 2150, 2400, 3000, 4500, 4900, 5100].map((time) => {
            for (const animation of animations) {
               animation.pause();
               animation.currentTime = time;
            }
            return Object.fromEntries(
               ['blue', 'teal', 'green', 'word', 'dot'].map((name) => {
                  const style = getComputedStyle(document.querySelector(`.${name}`)!);
                  return [
                     name,
                     {
                        opacity: Number(style.opacity),
                        transform: style.transform,
                        clip: style.clipPath,
                        filter: style.filter,
                     },
                  ];
               })
            );
         });
      });
      expect(Object.values(frames[0]).every((layer) => layer.opacity === 0)).toBeTruthy();
      expect(frames[0].blue.filter).toContain('blur(8px)');
      expect(frames[1].blue.opacity).toBe(1);
      expect(frames[1].word.opacity).toBe(0);
      expect(frames[2].green.opacity).toBe(1);
      expect(frames[2].word.opacity).toBeGreaterThan(0);
      expect(frames[2].word.opacity).toBeLessThan(1);
      expect(frames[2].dot.opacity).toBe(0);
      expect(frames[3].word.clip).not.toEqual(frames[4].word.clip);
      expect(frames[4].dot.opacity).toBe(1);
      expect(frames[4].dot.transform).not.toEqual(frames[5].dot.transform);
      expect(Object.values(frames[6]).every((layer) => layer.opacity === 1)).toBeTruthy();
      expect(Object.values(frames[7]).every((layer) => layer.opacity < 1)).toBeTruthy();
      expect(Object.values(frames[8]).every((layer) => layer.opacity === 0)).toBeTruthy();
      expect(frames[9].blue.opacity).toBe(0);
      for (const time of [1000, 1800, 3000]) {
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
            (el) => getComputedStyle(el).opacity === '1' && getComputedStyle(el).clipPath === 'none'
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
      .toContain('/brand/flowie-motion-dark-v2.svg');
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
      .toContain('/brand/flowie-motion-dark-v2.svg');
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
      .toContain('/brand/flowie-motion-dark-v2.svg');
   expect((await loadingLogo.boundingBox())!.width).toBe(256);
   expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
   ).toBeTruthy();
   await loadingLogo.evaluate((el) => (el as HTMLImageElement).decode());
   const entering = await loadingLogo.screenshot();
   await page.waitForTimeout(700);
   expect(await loadingLogo.screenshot()).not.toEqual(entering);
   await page.waitForTimeout(1800);
   await page.screenshot({ path: testInfo.outputPath('brand-shared-motion-mobile.png') });
   await page.emulateMedia({ reducedMotion: 'reduce' });
   await expect
      .poll(() => loadingLogo.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-logo-dark.svg');
   await page.screenshot({ path: testInfo.outputPath('brand-shared-loading.png') });
   releaseIssue();
   await page.unrouteAll({ behavior: 'wait' });
   expect(hydrationErrors).toEqual([]);
});
