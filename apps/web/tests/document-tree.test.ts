import assert from 'node:assert/strict';
import test from 'node:test';
import {
   buildTree,
   filterTree,
   folderLabel,
   type TreeDocument,
   type TreeFolder,
} from '../lib/document-tree';
import { documentTemplate, documentTitle } from '../lib/document-templates';
import { markdownHeadings } from '../lib/markdown-headings';

const folder = (id: string, parentId: string | null, name: string, position = 0): TreeFolder => ({
   id,
   parentId,
   kind: 'general',
   name,
   icon: '📁',
   position,
});
const doc = (
   id: string,
   folderId: string | null,
   title: string,
   extra: Partial<TreeDocument> = {}
) =>
   ({
      id,
      folderId,
      title,
      content: '',
      icon: '📄',
      docType: 'OTHER',
      status: 'DRAFT',
      updatedAt: '2026-10-28',
      ...extra,
   }) as TreeDocument;

test('folders nest under parents and documents file into them', () => {
   const { roots, unfiled } = buildTree(
      [
         folder('m', 'root', 'Module'),
         folder('root', null, 'Project'),
         folder('x', 'gone', 'Orphan', 1),
      ],
      [doc('a', 'm', 'Spec'), doc('b', 'm', 'Linked', { linked: true }), doc('c', null, 'Loose')]
   );
   assert.deepEqual(
      roots.map((node) => node.folder.id),
      ['root', 'x']
   );
   assert.equal(roots[0].children[0].documents[0].id, 'a');
   assert.deepEqual(
      unfiled.map((d) => d.id),
      ['b', 'c']
   );
});

test('filtering keeps matching documents, their folders and folder-name matches', () => {
   const { roots } = buildTree(
      [folder('root', null, 'Dự án'), folder('m', 'root', 'Tài liệu'), folder('n', 'root', 'Khác')],
      [
         doc('a', 'm', 'FDS · Cây', { docType: 'FDS', content: 'Đồng bộ SharePoint' }),
         doc('b', 'n', 'Ghi chú'),
      ]
   );
   const byContent = filterTree(roots, 'dong bo', 'ALL');
   assert.deepEqual(
      byContent[0].children.map((n) => n.folder.id),
      ['m']
   );
   assert.equal(filterTree(roots, '', 'TDS').length, 0);
   assert.deepEqual(
      filterTree(roots, 'khac', 'ALL')[0].children.map((n) => n.folder.id),
      ['n']
   );
   assert.equal(filterTree(roots, '', 'ALL'), roots);
});

test('files sit in their folder and match only "all types" by filename', () => {
   const file = (id: string, folderId: string, filename: string) => ({
      id,
      folderId,
      filename,
      mimeType: 'application/pdf',
      size: 1,
      createdAt: '2026-10-29',
   });
   const { roots } = buildTree(
      [folder('root', null, 'Dự án'), folder('m', 'root', 'Module')],
      [doc('a', 'root', 'FDS · Cây', { docType: 'FDS' })],
      [file('f', 'm', 'Đặc tả.pdf'), file('g', 'gone', 'lost.pdf')]
   );
   assert.deepEqual(
      roots[0].children[0].files.map((f) => f.id),
      ['f']
   );
   assert.deepEqual(
      filterTree(roots, 'dac ta', 'ALL')[0].children[0].files.map((f) => f.id),
      ['f']
   );
   assert.equal(filterTree(roots, '', 'FDS')[0].children.length, 0);
});

test('templates and titles follow the FDS/TDS convention', () => {
   assert.equal(documentTitle('FDS', ' Timeline '), 'FDS · Timeline');
   assert.equal(documentTitle('GUIDE', 'Runbook'), 'Runbook');
   assert.match(documentTemplate('TDS', 'Timeline'), /^# TDS · Timeline/);
   assert.equal(documentTemplate('OTHER', 'x'), '');
});

test('table of contents reads headings outside code with unique anchors', () => {
   const headings = markdownHeadings(
      '# Tổng quan\n```\n# not a heading\n```\n## Luồng **chính**\n## Luồng chính\n#### Deep'
   );
   assert.deepEqual(headings, [
      { level: 1, text: 'Tổng quan', id: 'tong-quan' },
      { level: 2, text: 'Luồng chính', id: 'luong-chinh' },
      { level: 2, text: 'Luồng chính', id: 'luong-chinh-2' },
   ]);
});

test('numbered folders show a two-digit prefix, sort by number and match it in search', () => {
   const { roots } = buildTree(
      [
         folder('root', null, 'Project'),
         { ...folder('ops', 'root', 'Vận hành', 1), number: 99 },
         { ...folder('mod', 'root', 'Turn Around', 2), number: 1 },
         { ...folder('gen', 'root', 'Tổng quan', 5), number: 0 },
         folder('loose', 'root', 'Loose', 0),
      ],
      []
   );
   assert.deepEqual(
      roots[0].children.map((node) => folderLabel(node.folder)),
      ['00 · Tổng quan', '01 · Turn Around', '99 · Vận hành', 'Loose']
   );
   assert.deepEqual(
      filterTree(roots, '01', 'ALL')[0].children.map((node) => node.folder.id),
      ['mod']
   );
});
