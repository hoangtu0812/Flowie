import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));

test('MCP setup shows token-free certificate guidance for every client and OS before connecting', async ({
   page,
}, testInfo) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await page.route('**/api/v1/mcp/configuration', async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.data.endpointPath = 'https://flowie.example.test/flowie/mcp/';
      await route.fulfill({ response, json: payload });
   });
   await page.goto(`/${fixture.slug}/settings/integrations`);
   const guide = page.getByRole('region', { name: 'Certificates (.crt / TLS)', exact: true });
   await expect(
      guide.getByRole('heading', { name: 'Certificates (.crt / TLS)', exact: true })
   ).toBeVisible();
   await expect(
      page.getByRole('button', { name: 'Check new connection endpoint and grant', exact: true })
   ).toBeDisabled();
   for (const client of ['Claude Code', 'Codex', 'Cursor', 'VS Code', 'Antigravity']) {
      await page.getByRole('button', { name: client, exact: true }).click();
      await expect(
         guide.getByText(`Fully quit and reopen ${client}`, { exact: false })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Windows', exact: true })).toBeVisible();
   }
   for (const [os, expected] of [
      ['macOS', 'Open Keychain Access'],
      ['Windows', 'Open certmgr.msc'],
      ['Linux', 'On Ubuntu/Debian'],
   ]) {
      await page.getByRole('button', { name: os, exact: true }).click();
      await expect(guide.getByText(expected, { exact: false })).toBeVisible();
      const code = await guide.locator('pre').allTextContents();
      expect(code[0]).toContain('--cacert');
      expect(code[0]).toContain('https://flowie.example.test/flowie/mcp/');
      expect(code.join(' ')).not.toMatch(/Authorization|Bearer|FLOWIE_MCP_TOKEN|flowie_mcp_/);
      expect(code[1]).toContain('NODE_EXTRA_CA_CERTS');
      expect(code[0].startsWith('curl.exe')).toBe(os === 'Windows');
   }
   await expect(guide.getByText(/This is not a universal setting for Codex/)).toBeVisible();
   await expect(guide.getByRole('link', { name: 'Node.js CA', exact: true })).toHaveAttribute(
      'href',
      /nodejs.org/
   );
   await page.setViewportSize({ width: 390, height: 844 });
   await guide.scrollIntoViewIfNeeded();
   await page.screenshot({ path: testInfo.outputPath('mcp-tls-mobile.png') });
   expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
   ).toBeTruthy();
   expect(await guide.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
});
