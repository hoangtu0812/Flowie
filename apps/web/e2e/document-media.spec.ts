import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8'));
const api = 'http://localhost:4000/api/v1';
const created: string[] = [];
const owners: string[] = [];
test.afterEach(async ({ context }) => {
   test.setTimeout(30000);
   for (const id of owners.splice(0))
      await context.request.delete(`${api}/issues/${id}?workspaceId=${fixture.workspace_id}`);
   for (const id of created.splice(0))
      await context.request.delete(`${api}/documents/${id}?workspaceId=${fixture.workspace_id}`);
});

test('Docs front matter configures Mermaid and all image kinds expand in flow with zoom/pan', async ({
   page,
   context,
}, testInfo) => {
   test.setTimeout(90000);
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const raster = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM3sAAAAASUVORK5CYII=',
      'base64'
   );
   const vector = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="steelblue"/><text x="400" y="300" fill="white" font-size="40">Synthetic vector</text><script>window.svgUnsafe=true</script></svg>'
   );
   const ownerResponse = await context.request.post(`${api}/issues`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: fixture.team_id,
         title: 'Synthetic document media owner',
      },
   });
   expect(ownerResponse.ok()).toBeTruthy();
   const owner = (await ownerResponse.json()).data;
   owners.push(owner.id);
   const upload = async (name: string, mimeType: string, buffer: Buffer) => {
      const response = await context.request.post(`${api}/attachments`, {
         multipart: {
            workspaceId: fixture.workspace_id,
            entityType: 'issue',
            entityId: owner.id,
            file: { name, mimeType, buffer },
         },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const attachment = (await response.json()).data;
      return `${api}/attachments/${attachment.id}/preview`;
   };
   const [png, svg] = [
      await upload('inline.png', 'image/png', raster),
      await upload('inline.svg', 'image/svg+xml', vector),
   ];
   const graph =
      'flowchart TD\n  A[Start] --> B[Review]\n  A --> C[Build]\n  B --> D[Finish]\n  C --> D';
   const create = async (title: string, content: string) => {
      const response = await context.request.post(`${api}/documents`, {
         data: {
            workspaceId: fixture.workspace_id,
            teamId: fixture.team_id,
            title,
            content,
            docType: 'GUIDE',
         },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const document = (await response.json()).data;
      created.push(document.id);
      return document;
   };
   const header =
      '---\nmermaid:\n  theme: default\n  flowchart:\n    curve: linear\n  securityLevel: loose\n  dompurifyConfig: {ADD_TAGS: [script]}\n---\n';
   const document = await create(
      'Synthetic inline media',
      `${header}# Media document\n\n\`\`\`mermaid\n${graph}\n\`\`\`\n\nAfter diagram\n\n![Raster](${png})\n\nAfter raster\n\n![Vector](${svg})\n\nAfter vector`
   );
   await page.goto(`/${fixture.slug}/documents/${document.id}`);
   const reading = page.getByTestId('document-reading-area');
   const rendered = reading.locator('svg[id^="flowie-mermaid-"]');
   await expect(rendered).toBeVisible();
   await expect(reading.getByText('mermaid:', { exact: false })).toHaveCount(0);
   expect(await rendered.locator('.flowchart-link').first().getAttribute('d')).not.toMatch(/[CQ]/);
   const fill = await rendered
      .locator('.node rect')
      .first()
      .evaluate((el) => getComputedStyle(el).fill);
   expect(fill).toBe('rgb(236, 236, 255)');

   const exercise = async (label: string, below: string) => {
      const button = reading.getByRole('button', { name: `Expand ${label}`, exact: true });
      const root = reading
         .locator('[data-media-expanded]')
         .filter({ has: page.getByRole('img', { name: label, exact: true }) });
      const after = reading.getByText(below, { exact: true });
      const initial = await root.boundingBox();
      const belowBefore = (await after.boundingBox())!.y - initial!.y;
      await button.click();
      await expect(root).toHaveAttribute('data-media-expanded', 'true');
      expect((await root.boundingBox())!.height).toBeGreaterThan(initial!.height);
      expect((await root.boundingBox())!.width).toBeGreaterThanOrEqual(initial!.width);
      const readingBox = (await reading.boundingBox())!;
      expect((await root.boundingBox())!.width).toBeGreaterThan(readingBox.width - 60);
      expect((await after.boundingBox())!.y - (await root.boundingBox())!.y).toBeGreaterThan(
         belowBefore
      );
      const viewport = root.locator(':scope > svg');
      const view = async () => (await viewport.getAttribute('viewBox'))!.split(' ').map(Number);
      const original = await view();
      await root.getByRole('button', { name: 'Zoom in', exact: true }).click();
      expect((await view())[2]).toBeLessThan(original[2]);
      const zoomed = await view();
      await viewport.focus();
      await viewport.press('ArrowRight');
      expect((await view())[0]).toBeGreaterThan(zoomed[0]);
      const box = (await viewport.boundingBox())!;
      const beforeDrag = await view();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 5 });
      await page.mouse.up();
      expect(await view()).not.toEqual(beforeDrag);
      await root.getByRole('button', { name: 'Reset view', exact: true }).click();
      expect(await view()).toEqual(original);
      if (label === 'Mermaid diagram') {
         await root.scrollIntoViewIfNeeded();
         await page.screenshot({ path: testInfo.outputPath('document-diagram-expanded.png') });
      }
      await root.getByRole('button', { name: 'Collapse', exact: true }).click();
      await expect(root).toHaveAttribute('data-media-expanded', 'false');
      await expect(page.getByRole('dialog')).toHaveCount(0);
   };
   await exercise('Mermaid diagram', 'After diagram');
   await exercise('Raster', 'After raster');
   await exercise('Vector', 'After vector');
   expect(
      await page.evaluate(() => (window as unknown as { svgUnsafe?: boolean }).svgUnsafe)
   ).toBeUndefined();
   await page.setViewportSize({ width: 390, height: 844 });
   await reading.getByRole('button', { name: 'Expand Vector', exact: true }).click();
   await reading.locator('[data-media-expanded=true]').scrollIntoViewIfNeeded();
   expect(await reading.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
   await page.screenshot({
      path: testInfo.outputPath('document-inline-mobile.png'),
      fullPage: true,
   });

   const plain = await create(
      'Synthetic defaults',
      `# No metadata\n\n\`\`\`mermaid\n${graph}\n\`\`\`\n\nOrdinary text`
   );
   await page.goto(`/${fixture.slug}/documents/${plain.id}`);
   await expect(rendered).toBeVisible();
   expect(await rendered.locator('.flowchart-link').first().getAttribute('d')).toMatch(/[CQ]/);
   await expect(reading.getByText('Ordinary text', { exact: true })).toBeVisible();
   const invalid = await create(
      'Synthetic invalid metadata',
      '---\nmermaid: [\n---\n# Retained body\n\nText survives'
   );
   await page.goto(`/${fixture.slug}/documents/${invalid.id}`);
   await expect(reading.getByRole('alert')).toContainText('Invalid document front matter');
   await expect(reading.getByRole('heading', { name: 'Retained body', exact: true })).toBeVisible();
});
