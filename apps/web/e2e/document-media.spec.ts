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
   const rendered = reading.locator('image[data-mermaid-image]');
   await expect(rendered).toBeVisible();
   await expect(reading.getByText('mermaid:', { exact: false })).toHaveCount(0);
   const graphData = () =>
      rendered.evaluate(async (el) => {
         const source = await (await fetch(el.getAttribute('href')!)).text();
         const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
         return { path: svg.querySelector('.flowchart-link')?.getAttribute('d'), source };
      });
   expect((await graphData()).path).not.toMatch(/[CQ]/);
   expect((await graphData()).source).toContain('#ECECFF');

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
      const viewport = root.locator('[data-media-scroll]');
      const media = viewport.locator(':scope > svg');
      const original = await media.getAttribute('viewBox');
      const initialHeight = (await media.boundingBox())!.height;
      const beforeZoom = (await after.boundingBox())!.y - (await root.boundingBox())!.y;
      await root.getByRole('button', { name: 'Zoom in', exact: true }).click();
      expect((await media.boundingBox())!.height).toBeGreaterThan(initialHeight * 1.2);
      expect(await media.getAttribute('viewBox')).toEqual(original);
      expect((await after.boundingBox())!.y - (await root.boundingBox())!.y).toBeGreaterThan(
         beforeZoom
      );
      await viewport.focus();
      await viewport.press('ArrowRight');
      expect(await viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      await viewport.scrollIntoViewIfNeeded();
      const box = (await viewport.boundingBox())!;
      const beforeDrag = await viewport.evaluate((el) => el.scrollLeft);
      await page.mouse.move(box.x + box.width / 2, Math.max(100, box.y + 80));
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 40, Math.max(100, box.y + 80) - 20, {
         steps: 5,
      });
      await page.mouse.up();
      expect(await viewport.evaluate((el) => el.scrollLeft)).toBeLessThan(beforeDrag);
      await expect(root).toHaveAttribute('data-media-expanded', 'true');
      await root.getByRole('button', { name: 'Reset view', exact: true }).click();
      expect((await media.boundingBox())!.height).toBeCloseTo(initialHeight, 0);
      expect(await viewport.evaluate((el) => el.scrollLeft)).toBe(0);
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
   expect((await graphData()).path).toMatch(/[CQ]/);
   await expect(reading.getByText('Ordinary text', { exact: true })).toBeVisible();
   await page.setViewportSize({ width: 1280, height: 800 });
   const er =
      'erDiagram\n  document ||--o{ revision : contains\n  document {\n    string id PK\n    string title\n  }\n  revision {\n    string id PK\n    string document_id FK\n  }';
   const sequence =
      'sequenceDiagram\n  participant A as Author\n  participant B as Reader\n' +
      Array.from({ length: 35 }, (_, i) => `A->>B: Step ${i + 1}`).join('\n');
   const localSamples: string[] = process.env.FLOWIE_MEDIA_SAMPLE
      ? JSON.parse(readFileSync(process.env.FLOWIE_MEDIA_SAMPLE, 'utf8')).slice(0, 2)
      : [er, sequence];
   const tall = await create(
      'Local media verification',
      header +
         localSamples
            .map((code, i) => `\n\`\`\`mermaid\n${code}\n\`\`\`\n\nAfter tall diagram ${i}`)
            .join('\n')
   );
   await page.goto(`/${fixture.slug}/documents/${tall.id}`);
   await expect(rendered).toHaveCount(2);
   await expect(
      reading.getByRole('button', { name: 'Expand Mermaid diagram', exact: true })
   ).toHaveCount(2);
   await page.evaluate(() => document.documentElement.classList.add('dark'));
   const probe = await context.newPage();
   for (let index = 0; index < 2; index++) {
      const url = await reading
         .locator('image[data-mermaid-image]')
         .nth(index)
         .getAttribute('href');
      const source = await page.evaluate(async (url) => (await fetch(url!)).text(), url);
      await probe.setContent(source);
      const colors = await probe
         .locator('text:not(.sequenceNumber), foreignObject .nodeLabel')
         .evaluateAll((elements) =>
            elements.map((el) => {
               const css = getComputedStyle(el);
               return el.tagName === 'text' ? css.fill : css.color;
            })
         );
      expect(colors.length).toBeGreaterThan(0);
      const clipped = await probe.locator('foreignObject p').evaluateAll((elements) =>
         elements.some((el) => {
            const box = el.closest('foreignObject')!.getBoundingClientRect();
            const text = el.getBoundingClientRect();
            return text.height > box.height + 1 || el.scrollWidth > box.width + 1;
         })
      );
      expect(clipped).toBeFalsy();
      expect(
         colors.every((color) => color !== 'rgb(255, 255, 255)' && color !== 'rgb(221, 221, 221)')
      ).toBeTruthy();
      await expect(probe.locator('[data-preview-background]')).toHaveAttribute(
         'fill',
         /^(white|#f4f4f4)$/
      );
      if (!process.env.FLOWIE_MEDIA_SAMPLE)
         await probe.screenshot({ path: testInfo.outputPath(`palette-${index}.png`) });
   }
   await probe.close();
   for (let index = 0; index < 2; index++) {
      const root = reading.locator('[data-media-expanded]').nth(index);
      const image = root.getByRole('img', { name: 'Mermaid diagram', exact: true });
      const ratio = await image.evaluate((el) => {
         const svg = el as SVGSVGElement;
         return svg.getBoundingClientRect().height / svg.getBoundingClientRect().width;
      });
      const bounds = (await image.getAttribute('viewBox'))!.split(' ').map(Number);
      expect(ratio).toBeCloseTo(bounds[3] / bounds[2], 2);
      await root.getByRole('button', { name: 'Expand Mermaid diagram', exact: true }).click();
      const media = root.getByRole('img', { name: 'Mermaid diagram', exact: true });
      const height = (await media.boundingBox())!.height;
      await root.getByRole('button', { name: 'Zoom in', exact: true }).click();
      expect((await media.boundingBox())!.height).toBeGreaterThan(height * 1.2);
      expect(await reading.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
      const scroll = root.locator('[data-media-scroll]');
      await scroll.focus();
      await scroll.press('ArrowDown');
      await expect(root).toHaveAttribute('data-media-expanded', 'true');
      await root.getByRole('button', { name: 'Collapse', exact: true }).click();
   }
   const settings = reading.getByRole('button', { name: 'Mermaid Settings', exact: true }).first();
   await settings.click();
   const panel = page.getByRole('dialog', { name: 'Mermaid Settings', exact: true });
   await expect(panel.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
   await panel.getByRole('combobox', { name: 'Theme', exact: true }).click();
   await page.getByRole('option', { name: 'dark', exact: true }).click();
   await panel.getByRole('checkbox', { name: 'Custom background', exact: true }).check();
   await panel.getByRole('combobox', { name: 'Background color', exact: true }).click();
   await page.getByRole('option', { name: 'Transparent', exact: true }).click();
   await panel.getByRole('button', { name: 'Apply', exact: true }).click();
   await expect.poll(() => reading.locator('image[data-mermaid-image]').count()).toBe(2);
   await page.reload();
   await expect(reading.locator('image[data-mermaid-image]')).toHaveCount(2);
   await settings.click();
   await expect(panel.getByRole('combobox', { name: 'Theme', exact: true })).toContainText('dark');
   await expect(
      panel.getByRole('combobox', { name: 'Background color', exact: true })
   ).toContainText('Transparent');
   await panel.getByRole('button', { name: 'Reset', exact: true }).click();
   await expect(reading.locator('image[data-mermaid-image]')).toHaveCount(2);
   const stored = await context.request.get(
      `${api}/documents/${tall.id}?workspaceId=${fixture.workspace_id}`
   );
   expect((await stored.json()).data.content).toEqual(
      header +
         localSamples
            .map((code, i) => `\n\`\`\`mermaid\n${code}\n\`\`\`\n\nAfter tall diagram ${i}`)
            .join('\n')
   );
   const invalid = await create(
      'Synthetic invalid metadata',
      '---\nmermaid: [\n---\n# Retained body\n\nText survives'
   );
   await page.goto(`/${fixture.slug}/documents/${invalid.id}`);
   await expect(reading.getByRole('alert')).toContainText('Invalid document front matter');
   await expect(reading.getByRole('heading', { name: 'Retained body', exact: true })).toBeVisible();
});

test('media toolbar keeps zoom together, leaves a sticky inset and uses compact app popovers', async ({
   page,
   context,
}, testInfo) => {
   test.setTimeout(60000);
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const scaffold = await context.request.post(`${api}/documents/project-tree/scaffold`, {
      data: { workspaceId: fixture.workspace_id, projectId: fixture.projectId },
   });
   expect(scaffold.ok()).toBeTruthy();
   const tree = (await scaffold.json()).data;
   const rootFolder = tree.folders.find((folder: { kind: string }) => folder.kind === 'project');
   const response = await context.request.post(`${api}/documents`, {
      data: {
         workspaceId: fixture.workspace_id,
         teamId: tree.teamId,
         folderId: rootFolder.id,
         title: `Synthetic toolbar ${Date.now()}`,
         content:
            '# Synthetic controls\n\n```mermaid\nsequenceDiagram\n  participant A as Start\n  participant B as Finish\n' +
            Array.from({ length: 30 }, (_, i) => `  A->>B: Step ${i + 1}`).join('\n') +
            '\n```\n\nAfter diagram',
         docType: 'GUIDE',
      },
   });
   expect(response.ok()).toBeTruthy();
   const document = (await response.json()).data;
   created.push(document.id);
   const reading = page.getByTestId('document-reading-area');
   const controls = reading.locator('[data-media-toolbar]');
   const zoom = controls.getByRole('group', { name: 'Zoom controls', exact: true });
   const settings = reading.getByRole('button', { name: 'Mermaid Settings', exact: true });
   const panel = page.getByRole('dialog', { name: 'Mermaid Settings', exact: true });
   const assertContrast = async () => {
      const contrast = await panel
         .getByRole('combobox', { name: 'Theme', exact: true })
         .evaluate((el) => {
            const surface = el.closest('[role="dialog"]')!;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext('2d')!;
            const luminance = (color: string) => {
               ctx.fillStyle = color;
               ctx.fillRect(0, 0, 1, 1);
               const channels = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
                  const c = value / 255;
                  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
               });
               return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
            };
            const text = luminance(getComputedStyle(el).color);
            const background = luminance(getComputedStyle(surface).backgroundColor);
            return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
         });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
   };
   const assertZoom = async (percent: string) => {
      const minus = (await zoom
         .getByRole('button', { name: 'Zoom out', exact: true })
         .boundingBox())!;
      const plus = (await zoom
         .getByRole('button', { name: 'Zoom in', exact: true })
         .boundingBox())!;
      const value = (await zoom.getByText(percent, { exact: true }).boundingBox())!;
      expect(value.x).toBeGreaterThanOrEqual(minus.x + minus.width);
      expect(value.x + value.width).toBeLessThanOrEqual(plus.x);
      expect(Math.abs(value.y + value.height / 2 - (plus.y + plus.height / 2))).toBeLessThan(2);
      expect(Math.abs(minus.y - plus.y)).toBeLessThan(1);
   };
   for (const entry of ['standalone', 'docs']) {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(
         entry === 'standalone'
            ? `/${fixture.slug}/documents/${document.id}`
            : `/${fixture.slug}/docs?project=${fixture.projectId}`
      );
      if (entry === 'docs') await page.locator(`[data-tree-id="${document.id}"]`).click();
      await settings.click();
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('data-slot', 'popover-content');
      expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(300);
      await assertContrast();
      await panel.screenshot({ path: testInfo.outputPath(`settings-light-${entry}.png`) });
      await panel.getByRole('combobox', { name: 'Theme', exact: true }).click();
      await page.getByRole('option', { name: 'forest', exact: true }).click();
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(settings).toBeFocused();
      await settings.click();
      await expect(panel.getByRole('combobox', { name: 'Theme', exact: true })).toContainText(
         'Use document'
      );
      await panel.getByRole('button', { name: 'Close settings', exact: true }).click();
      await reading.getByRole('button', { name: 'Expand Mermaid diagram', exact: true }).click();
      await assertZoom('100%');
      await zoom.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await assertZoom('125%');
      const scroller = reading.locator('..');
      await scroller.evaluate((el) => {
         const bar = el.querySelector('[data-media-toolbar]')!;
         el.scrollTop += bar.getBoundingClientRect().top - el.getBoundingClientRect().top + 120;
      });
      await expect
         .poll(async () => (await controls.boundingBox())!.y - (await scroller.boundingBox())!.y)
         .toBeGreaterThanOrEqual(11);
      expect(
         (await controls.boundingBox())!.y - (await scroller.boundingBox())!.y
      ).toBeLessThanOrEqual(13);
      await page.screenshot({ path: testInfo.outputPath(`toolbar-sticky-${entry}.png`) });
      await controls.screenshot({ path: testInfo.outputPath(`toolbar-only-${entry}.png`) });
      await controls.getByRole('button', { name: 'Collapse', exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(page.locator('html')).toHaveClass(/dark/);
      await settings.click();
      await assertContrast();
      const box = (await panel.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
      await panel.screenshot({ path: testInfo.outputPath(`settings-only-${entry}.png`) });
      await page.screenshot({ path: testInfo.outputPath(`settings-mobile-${entry}.png`) });
      await panel.getByRole('button', { name: 'Close settings', exact: true }).click();
      await reading.getByRole('button', { name: 'Expand Mermaid diagram', exact: true }).click();
      await assertZoom('100%');
      expect(await reading.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
      await controls.getByRole('button', { name: 'Collapse', exact: true }).click();
   }
});
