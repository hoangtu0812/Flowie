import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
const owners: string[] = [];
test.afterEach(async ({ context }) => {
   for (const id of owners.splice(0))
      await context.request.delete(`${api}/issues/${id}?workspaceId=${fixture.workspace_id}`);
});

// The mockup records what its script can reach: the origin it runs as, its own storage, Flowie's
// cookie, the parent page and the Flowie API.
// VI: Mockup ghi lại những gì script của nó chạm tới được: origin nó chạy, storage của chính nó,
// VI: cookie của Flowie, trang cha và API của Flowie.
const MOCKUP = `<!doctype html><html><body><h1>Synthetic mockup</h1><pre id="out"></pre><script>
const r = { origin: self.origin };
localStorage.setItem('k', 'v'); r.storage = localStorage.getItem('k');
try { r.cookie = document.cookie } catch (e) { r.cookie = e.name }
try { r.parent = String(parent.document.title) } catch (e) { r.parent = e.name }
try { parent.document.title = 'pwned' } catch (e) {}
fetch('${api}/workspaces', { credentials: 'include' })
   .then((x) => (r.fetch = 'status ' + x.status), (e) => (r.fetch = e.name))
   .finally(() => (document.getElementById('out').textContent = JSON.stringify(r)));
</script></body></html>`;

async function sandboxReport(frame: ReturnType<import('@playwright/test').Page['frameLocator']>) {
   await expect(frame.getByRole('heading', { name: 'Synthetic mockup' })).toBeVisible();
   await expect(frame.locator('#out')).not.toBeEmpty();
   return JSON.parse((await frame.locator('#out').textContent()) ?? '{}');
}

test('HTML runs as an opaque origin that cannot reach Flowie; CSV stays static', async ({
   page,
   context,
}) => {
   test.setTimeout(90000);
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const ownerResponse = await context.request.post(`${api}/issues`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: fixture.team_id,
         title: 'Synthetic attachment preview owner',
      },
   });
   expect(ownerResponse.ok()).toBeTruthy();
   const owner = (await ownerResponse.json()).data;
   owners.push(owner.id);
   const ids: Record<string, string> = {};
   for (const [name, mimeType, text] of [
      ['mockup.html', 'text/html', MOCKUP],
      ['plan.csv', 'text/csv', 'Task,Owner\nReview,Lan'],
   ]) {
      const response = await context.request.post(`${api}/attachments`, {
         multipart: {
            workspaceId: fixture.workspace_id,
            entityType: 'issue',
            entityId: owner.id,
            file: { name, mimeType, buffer: Buffer.from(text) },
         },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      ids[name] = (await response.json()).data.id;
   }
   await page.goto(`/${fixture.slug}/issue/${owner.identifier}?tab=attachments`);

   await page.getByRole('button', { name: /mockup\.html/ }).click();
   const dialog = page.getByRole('dialog');
   await expect(dialog.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts allow-modals');
   const report = await sandboxReport(dialog.frameLocator('iframe[title="mockup.html"]'));
   expect(report.origin).toBe('null');
   expect(report.storage).toBe('v');
   expect(report.cookie).not.toContain('flowie');
   expect(report.parent).toBe('SecurityError');
   expect(report.fetch).toBe('TypeError');
   await expect(page).not.toHaveTitle('pwned');
   await expect(dialog.getByRole('link', { name: 'Open in new tab' })).toHaveAttribute(
      'href',
      new RegExp(`/preview/${ids['mockup.html']}$`)
   );
   await page.keyboard.press('Escape');

   await page.getByRole('button', { name: /plan\.csv/ }).click();
   const plan = page.getByRole('dialog').frameLocator('iframe[title="plan.csv"]');
   await expect(plan.getByRole('cell', { name: 'Lan' })).toBeVisible();
   await expect(page.getByRole('dialog').locator('iframe')).toHaveAttribute('sandbox', '');

   // Opening the raw file in a tab lands on the wrapper page with its warning header.
   // VI: Mở tệp thô trên tab sẽ về trang wrapper có header cảnh báo.
   await page.goto(`${api}/attachments/${ids['mockup.html']}/preview`);
   await expect(page).toHaveURL(new RegExp(`/preview/${ids['mockup.html']}$`));
   await expect(page.getByRole('heading', { name: 'mockup.html' })).toBeVisible();
   await expect(page.getByRole('note')).toHaveText(/Do not enter passwords/);
   const wrapped = await sandboxReport(page.frameLocator('iframe[title="mockup.html"]'));
   expect(wrapped.origin).toBe('null');
   expect(wrapped.fetch).toBe('TypeError');
});
