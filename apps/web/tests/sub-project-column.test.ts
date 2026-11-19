import { test } from 'node:test';
import assert from 'node:assert/strict';
import { otherSubProjects } from '../features/issues/sub-project-groups';

test('the Other sub projects column leaves out the row group', () => {
   const labels = [{ id: 'mobile' }, { id: 'maintenance' }, { id: 'turnaround' }];
   assert.deepEqual(
      otherSubProjects(labels, 'mobile').map((label) => label.id),
      ['maintenance', 'turnaround']
   );
   // An issue in one sub project leaves the cell empty; no group keeps all.
   // VI: Issue chỉ có một sub project thì ô trống; không có nhóm thì giữ tất cả.
   assert.deepEqual(otherSubProjects([{ id: 'mobile' }], 'mobile'), []);
   assert.equal(otherSubProjects(labels).length, 3);
});
