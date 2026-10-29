-- Rejects a parent change that would make an issue its own ancestor (a cycle of any length).
-- The advisory lock serializes hierarchy changes per workspace until the transaction ends, so
-- two concurrent moves (A under B, B under A) cannot both pass; the ancestor walk runs after the
-- lock and sees every committed change. The API takes the same lock first to return a clear
-- error; this trigger is the last guard for every other write path. INSERT is not guarded: a
-- new row cannot be anyone's ancestor yet.
-- VI: Từ chối thay đổi cha khiến một issue thành tổ tiên của chính nó (chu trình mọi độ dài).
-- VI: Khóa advisory tuần tự hóa thay đổi phân cấp theo workspace đến hết transaction, nên hai
-- VI: thao tác đồng thời (A dưới B, B dưới A) không thể cùng qua; truy vấn tổ tiên chạy sau khi
-- VI: lấy khóa nên thấy mọi thay đổi đã commit. API lấy cùng khóa trước để trả lỗi rõ ràng;
-- VI: trigger này là lớp bảo vệ cuối cho mọi đường ghi khác. Không kiểm tra INSERT: dòng mới
-- VI: chưa thể là tổ tiên của issue nào.
CREATE FUNCTION flowie_issue_parent_guard() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.parent_issue_id IS NULL OR NEW.parent_issue_id IS NOT DISTINCT FROM OLD.parent_issue_id THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('issue-hierarchy:' || NEW.workspace_id, 0));
    IF EXISTS (
        WITH RECURSIVE ancestors(id, parent_issue_id) AS (
            SELECT id, parent_issue_id FROM issues WHERE id = NEW.parent_issue_id
            UNION
            SELECT i.id, i.parent_issue_id FROM issues i JOIN ancestors a ON i.id = a.parent_issue_id
        )
        SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'An issue cannot be moved under its own sub-issue.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'issues_parent_issue_acyclic';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER issue_parent_guard BEFORE UPDATE OF parent_issue_id ON issues
FOR EACH ROW EXECUTE FUNCTION flowie_issue_parent_guard();
