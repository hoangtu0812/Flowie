import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   email: string;
   password: string;
   projectId: string;
   userId: string;
   documentId: string;
   issues: { id: string }[];
};
const api = 'http://localhost:4000/api/v1';
const query = `workspaceId=${fixture.workspace_id}`;
const row = (page: Page, id: string) => page.locator(`[data-tree-id="${id}"]`);
const surface = (page: Page, id: string) => row(page, id).locator('.astryx-tree-list-item').first();

test.beforeEach(async ({ page, context }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   const current = (await (await context.request.get(`${api}/users/me/ui-preferences`)).json())
      .data;
   const preferences = await context.request.put(`${api}/users/me/ui-preferences`, {
      data: {
         accountId: fixture.userId,
         expectedVersion: current.version,
         values: { ...current.values, locale: 'en' },
      },
   });
   expect(preferences.ok()).toBeTruthy();
});

async function seed(page: Page, request: APIRequestContext, projectTab = false) {
   const post = async (path: string, data: object) => {
      const response = await request.post(`${api}${path}`, {
         data: { workspaceId: fixture.workspace_id, ...data },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return (await response.json()).data;
   };
   const tree = await post('/documents/project-tree/scaffold', { projectId: fixture.projectId });
   const root = tree.folders.find((folder: { kind: string }) => folder.kind === 'project');
   const name = Date.now();
   const source = await post('/documents/folders', {
      name: `Drag source ${name}`,
      parentId: root.id,
      kind: 'module',
   });
   const destination = await post('/documents/folders', {
      name: `Drag destination ${name}`,
      parentId: root.id,
      kind: 'module',
   });
   const child = await post('/documents/folders', {
      name: `Subtree ${name}`,
      parentId: source.id,
      kind: 'feature',
   });
   await request.patch(`${api}/documents/folders/${child.id}?${query}`, { data: { number: null } });
   const nested = await post('/documents/folders', {
      name: `Nested ${name}`,
      parentId: destination.id,
      kind: 'feature',
   });
   const document = await post('/documents', {
      teamId: tree.teamId,
      folderId: source.id,
      title: `Drag spec ${name}`,
      content: '# Retained spec',
   });
   const subtreeDocument = await post('/documents', {
      teamId: tree.teamId,
      folderId: child.id,
      title: `Subtree spec ${name}`,
      content: '# Child content',
   });
   const file = await request.post(`${api}/attachments`, {
      multipart: {
         workspaceId: fixture.workspace_id,
         entityType: 'document-folder',
         entityId: source.id,
         file: {
            name: 'drag.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4\n%%EOF'),
         },
      },
   });
   expect(file.ok(), await file.text()).toBeTruthy();
   const pdf = (await file.json()).data;
   const moves: string[] = [];
   page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().includes('/documents/'))
         moves.push(request.url());
   });
   await page.goto(
      projectTab
         ? `/${fixture.slug}/project/${fixture.projectId}/docs`
         : `/${fixture.slug}/docs?project=${fixture.projectId}`
   );
   await expect(row(page, source.id)).toHaveAttribute('draggable', 'true');
   await row(page, source.id).locator('[data-tree-toggle]').first().click();
   const readTree = async () =>
      (
         await (
            await request.get(
               `${api}/documents/project-tree?${query}&projectId=${fixture.projectId}`
            )
         ).json()
      ).data;
   const cleanup = async () => {
      for (const doc of [document, subtreeDocument])
         await request.delete(`${api}/documents/${doc.id}?${query}`);
      for (const folder of [source, root, destination, nested])
         await request.delete(
            `${api}/documents/folder-files/${pdf.id}?${query}&expectedFolderId=${folder.id}`
         );
      for (const folder of [child, nested, source, destination])
         await request.delete(`${api}/documents/folders/${folder.id}?${query}`);
   };
   return {
      post,
      root,
      source,
      destination,
      child,
      nested,
      document,
      subtreeDocument,
      pdf,
      moves,
      readTree,
      cleanup,
   };
}

async function beginDrag(page: Page, id: string) {
   const box = await surface(page, id).boundingBox();
   if (!box) throw new Error('Missing drag source');
   await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
   await page.mouse.down();
   await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 8, { steps: 5 });
}

async function hoverRow(page: Page, id: string) {
   const box = await surface(page, id).boundingBox();
   if (!box) throw new Error('Missing drop destination');
   await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
}

test('native drag moves documents, PDFs and a subtree, opens a hovered folder and survives reload', async ({
   page,
   context,
}, info) => {
   const data = await seed(page, context.request);
   try {
      await beginDrag(page, data.document.id);
      await hoverRow(page, data.destination.id);
      await expect(surface(page, data.destination.id)).toHaveAttribute('data-docs-drop', 'valid');
      await expect(row(page, data.destination.id)).toHaveAttribute('aria-expanded', 'true');
      await hoverRow(page, data.nested.id);
      await page.screenshot({
         path: info.outputPath('docs-drag-destination.png'),
         animations: 'disabled',
      });
      await page.mouse.up();
      await expect
         .poll(
            async () =>
               (await data.readTree()).documents.find(
                  (item: { id: string }) => item.id === data.document.id
               )?.folderId
         )
         .toBe(data.nested.id);
      await expect(page.getByText('Moving…', { exact: true })).toHaveCount(0);
      await surface(page, data.pdf.id).dragTo(surface(page, data.root.id));
      await expect
         .poll(
            async () =>
               (await data.readTree()).files.find((item: { id: string }) => item.id === data.pdf.id)
                  ?.folderId
         )
         .toBe(data.root.id);
      await surface(page, data.child.id).dragTo(surface(page, data.destination.id));
      await expect
         .poll(
            async () =>
               (await data.readTree()).folders.find(
                  (item: { id: string }) => item.id === data.child.id
               )?.parentId
         )
         .toBe(data.destination.id);
      expect(data.moves).toHaveLength(3);
      const tree = await data.readTree();
      expect(
         tree.documents.find((item: { id: string }) => item.id === data.subtreeDocument.id).folderId
      ).toBe(data.child.id);
      expect(
         tree.documents.find((item: { id: string }) => item.id === data.document.id).content
      ).toBe('# Retained spec');
      await page.reload();
      const stored = await data.readTree();
      expect(
         stored.documents.find((item: { id: string }) => item.id === data.document.id).folderId
      ).toBe(data.nested.id);
   } finally {
      await page.mouse.up();
      info.setTimeout(info.timeout + 10000);
      await data.cleanup();
   }
});

test('invalid drops, no-op, Escape and auto-scroll never send a move', async ({
   page,
   context,
}, info) => {
   const data = await seed(page, context.request);
   try {
      await expect(row(page, data.root.id)).toHaveAttribute('draggable', 'false');
      await surface(page, data.source.id).dragTo(surface(page, data.child.id));
      await surface(page, data.document.id).dragTo(surface(page, data.source.id));
      await surface(page, data.document.id).dragTo(surface(page, data.pdf.id));
      expect(data.moves).toHaveLength(0);
      await beginDrag(page, data.document.id);
      await hoverRow(page, data.destination.id);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect(data.moves).toHaveLength(0);
      const scrollFolders = [];
      for (let i = 0; i < 35; i++)
         scrollFolders.push(
            await data.post('/documents/folders', {
               name: `Scroll ${Date.now()} ${i}`,
               parentId: data.source.id,
               kind: 'general',
            })
         );
      await page.reload();
      await row(page, data.source.id).locator('[data-tree-toggle]').first().click();
      const scroller = page.locator('[data-docs-scroll]');
      await scroller.evaluate((element) => {
         element.scrollTop = 0;
      });
      await beginDrag(page, scrollFolders[0].id);
      const box = await scroller.boundingBox();
      if (!box) throw new Error('Missing scroll container');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height - 5, { steps: 15 });
      await expect
         .poll(async () => scroller.evaluate((element) => element.scrollTop))
         .toBeGreaterThan(0);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect(data.moves).toHaveLength(0);
      const folders = (await data.readTree()).folders.filter(
         (folder: { parentId: string; name: string }) =>
            folder.parentId === data.source.id && folder.name.startsWith('Scroll ')
      );
      for (const folder of folders)
         await context.request.delete(`${api}/documents/folders/${folder.id}?${query}`);
   } finally {
      await page.mouse.up();
      info.setTimeout(info.timeout + 10000);
      await data.cleanup();
   }
});

test('project Docs resolves folder conflicts and recovers a rejected drop through the move dialog', async ({
   page,
   context,
}, info) => {
   const data = await seed(page, context.request, true);
   try {
      await context.request.patch(`${api}/documents/folders/${data.child.id}?${query}`, {
         data: { number: 1 },
      });
      await page.reload();
      await row(page, data.source.id).locator('[data-tree-toggle]').first().click();
      await surface(page, data.child.id).dragTo(surface(page, data.destination.id));
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      expect(data.moves).toHaveLength(0);
      await expect(dialog.getByLabel('Destination folder')).toHaveValue(data.destination.id);
      await dialog.getByLabel('Folder number').fill('');
      await dialog.getByRole('button', { name: 'Move', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(data.moves).toHaveLength(1);
      const path = `**/documents/${data.document.id}?*`;
      await page.route(path, async (route) =>
         route.request().method() === 'PATCH'
            ? route.fulfill({
                 status: 409,
                 contentType: 'application/json',
                 body: JSON.stringify({ message: 'The document changed during drag.' }),
              })
            : route.continue()
      );
      await surface(page, data.document.id).dragTo(surface(page, data.destination.id));
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('alert')).toContainText('choose a destination again');
      expect(
         (await data.readTree()).documents.find(
            (item: { id: string }) => item.id === data.document.id
         ).folderId
      ).toBe(data.source.id);
      await page.unroute(path);
      await dialog.getByRole('button', { name: 'Move', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(
         (await data.readTree()).documents.find(
            (item: { id: string }) => item.id === data.document.id
         ).folderId
      ).toBe(data.destination.id);
   } finally {
      await page.mouse.up();
      info.setTimeout(info.timeout + 10000);
      await data.cleanup();
   }
});

test('linked-only documents and readonly trees cannot start moves', async ({
   page,
   context,
}, info) => {
   const data = await seed(page, context.request);
   const linked = `${api}/documents/${fixture.documentId}/issue-links`;
   try {
      expect(
         (
            await context.request.post(linked, {
               data: { workspaceId: fixture.workspace_id, issueId: fixture.issues[0].id },
            })
         ).ok()
      ).toBeTruthy();
      await page.reload();
      await expect(row(page, fixture.documentId)).toBeVisible();
      expect(
         await row(page, fixture.documentId).evaluate(
            (element) => (element as HTMLElement).draggable
         )
      ).toBeFalsy();
      await surface(page, fixture.documentId).dragTo(surface(page, data.destination.id));
      expect(data.moves).toHaveLength(0);
      await page.route('**/documents/project-tree?*', async (route) => {
         const response = await route.fetch();
         const body = await response.json();
         await route.fulfill({
            response,
            json: { ...body, data: { ...body.data, canManage: false } },
         });
      });
      await page.reload();
      await expect(row(page, data.source.id)).toHaveAttribute('draggable', 'false');
      await expect(
         row(page, data.source.id)
            .getByRole('button', { name: /^Actions for/ })
            .first()
      ).toHaveCount(0);
      await surface(page, data.source.id).dragTo(surface(page, data.destination.id));
      expect(data.moves).toHaveLength(0);
   } finally {
      info.setTimeout(info.timeout + 10000);
      await context.request.delete(`${linked}/${fixture.issues[0].id}?${query}`);
      await data.cleanup();
   }
});
