-- Sort rule of an issue's sub-issue tree, chosen in its Sub-issues section and reused by the
-- project Timeline so both show children in the same order. Existing rows keep manual order.
-- VI: Quy tắc sắp xếp cây sub-issue của một issue, chọn ở khu Sub-issues và dùng lại ở Timeline
-- VI: project để hai nơi hiển thị con cùng thứ tự. Dòng có sẵn giữ thứ tự thủ công.
ALTER TABLE "issues" ADD COLUMN "sub_issue_sort" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "issues" ADD CONSTRAINT "issues_sub_issue_sort_check"
  CHECK ("sub_issue_sort" IN ('manual', 'identifier-asc', 'identifier-desc', 'status-asc', 'status-desc'));
