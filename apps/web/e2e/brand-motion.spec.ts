import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const base = process.env.FLOWIE_E2E_BASE_PATH ?? '';

test('supplied branding loads locally and motion respects reduced-motion preferences', async ({
   page,
   context,
}, testInfo) => {
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
   expect(markup).not.toMatch(/<script|foreignObject|https?:\/\/(?!www\.w3\.org)/);
   await page.screenshot({ path: testInfo.outputPath('brand-auth-light.png') });
   await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
   });
   await page.screenshot({ path: testInfo.outputPath('brand-auth-dark.png') });
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
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   const image = page.locator('picture img[alt="Flowie"]');
   await expect(image).toBeVisible();
   await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-motion.svg');
   await page.emulateMedia({ reducedMotion: 'reduce' });
   await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-logo.svg');
   await page.screenshot({ path: testInfo.outputPath('brand-loading-reduced-mobile.png') });
   await page.emulateMedia({ reducedMotion: 'no-preference' });
   await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc))
      .toContain('/brand/flowie-motion.svg');
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
   await expect(status.locator('picture img')).toBeVisible();
   await page.screenshot({ path: testInfo.outputPath('brand-shared-loading.png') });
   releaseIssue();
   await page.unrouteAll({ behavior: 'wait' });
});
