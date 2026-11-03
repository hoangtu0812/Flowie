import assert from 'node:assert/strict';
import test from 'node:test';
import {
   documentDropReason,
   documentMoveConflict,
   type MoveSource,
} from '../lib/document-tree-move';
import type { TreeFolder } from '../lib/document-tree';

const folder = (
   id: string,
   parentId: string | null,
   extra: Partial<TreeFolder> = {}
): TreeFolder => ({ id, parentId, kind: 'general', name: id, icon: '📁', position: 0, ...extra });
const source: MoveSource = { id: 'module', kind: 'folder', folderId: 'root' };
const folders = [
   folder('root', null, { kind: 'project' }),
   folder('module', 'root'),
   folder('child', 'module'),
   folder('destination', 'root'),
];

test('folder drops preserve subtree boundaries and distinguish no-op from valid moves', () => {
   assert.equal(documentDropReason(folders, source, 'destination'), null);
   assert.equal(documentDropReason(folders, source, 'root'), 'same');
   assert.equal(documentDropReason(folders, source, 'module'), 'cycle');
   assert.equal(documentDropReason(folders, source, 'child'), 'cycle');
   assert.equal(documentDropReason(folders, source, 'missing'), 'missing');
   assert.equal(
      documentDropReason(folders, { ...source, id: 'missing' }, 'destination'),
      'missing'
   );
});

test('documents and PDFs can move to a project root but not remain in their current folder', () => {
   for (const kind of ['document', 'file'] as const) {
      const item = { id: 'spec', kind, folderId: 'module' };
      assert.equal(documentDropReason(folders, item, 'root'), null);
      assert.equal(documentDropReason(folders, item, 'module'), 'same');
      assert.equal(documentMoveConflict(folders, item, 'destination'), null);
   }
});

test('destination depth includes the entire moved subtree and matches the server limit', () => {
   const deep = Array.from({ length: 8 }, (_, index) =>
      folder(`level${index}`, index ? `level${index - 1}` : null)
   );
   const tree = [...deep, folder('branch', 'level0'), folder('leaf', 'branch')];
   const branch = { id: 'branch', kind: 'folder' as const, folderId: 'level0' };
   assert.equal(documentDropReason(tree, branch, 'level5'), null);
   assert.equal(documentDropReason(tree, branch, 'level6'), 'depth');
   assert.equal(
      documentDropReason(tree, { id: 'spec', kind: 'document', folderId: 'branch' }, 'level7'),
      null
   );
});

test('corrupt parent chains and source subtree cycles fail closed instead of hanging', () => {
   assert.equal(
      documentDropReason([...folders, folder('orphan', 'gone')], source, 'orphan'),
      'missing'
   );
   assert.equal(
      documentDropReason([...folders, folder('x', 'y'), folder('y', 'x')], source, 'x'),
      'cycle'
   );
   assert.equal(
      documentDropReason(
         [folder('module', 'child'), folder('child', 'module'), folder('destination', null)],
         source,
         'destination'
      ),
      'cycle'
   );
});

test('folder name and number conflicts require review without inventing a replacement number', () => {
   const source = { id: 'source', kind: 'folder' as const, folderId: 'root' };
   const tree = [
      folder('root', null),
      folder('source', 'root', { name: 'Module', number: 1 }),
      folder('destination', 'root'),
      folder('existing', 'destination', { name: 'MODULE', number: 2 }),
   ];
   assert.equal(documentMoveConflict(tree, source, 'destination'), 'name');
   tree[3] = { ...tree[3], name: 'Different', number: 1 };
   assert.equal(documentMoveConflict(tree, source, 'destination'), 'number');
   tree[3] = { ...tree[3], number: null };
   assert.equal(documentMoveConflict(tree, source, 'destination'), null);
   assert.equal(tree[1].number, 1);
});
