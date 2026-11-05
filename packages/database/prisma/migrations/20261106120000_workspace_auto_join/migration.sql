-- Workspaces can let accounts of one Microsoft tenant join on sign-in; null keeps this off, as it is
-- for every workspace after this migration. Removing a member deletes their row, so a separate table
-- remembers who must not rejoin by themselves. People who left are known from the audit log; people
-- removed earlier left no record and cannot be listed here.
-- VI: Workspace có thể cho tài khoản của một tenant Microsoft tự vào khi đăng nhập; null là tắt, và mọi
-- VI: workspace đều tắt sau migration này. Xoá thành viên sẽ xoá dòng của họ, nên cần bảng riêng nhớ ai
-- VI: không được tự vào lại. Người đã tự rời lấy được từ audit log; người bị xoá trước đây không để lại
-- VI: dấu vết nên không liệt kê được.
ALTER TABLE "workspaces" ADD COLUMN "auto_join_tenant_id" TEXT;

CREATE TABLE "workspace_auto_join_blocks" (
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_auto_join_blocks_pkey" PRIMARY KEY ("workspace_id","user_id")
);

CREATE INDEX "workspace_auto_join_blocks_user_id_idx" ON "workspace_auto_join_blocks"("user_id");

ALTER TABLE "workspace_auto_join_blocks" ADD CONSTRAINT "workspace_auto_join_blocks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_auto_join_blocks" ADD CONSTRAINT "workspace_auto_join_blocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "workspace_auto_join_blocks" ("workspace_id", "user_id")
SELECT DISTINCT log."workspace_id", log."actor_id"
FROM "audit_logs" log
JOIN "workspaces" workspace ON workspace."id" = log."workspace_id"
JOIN "users" person ON person."id" = log."actor_id"
WHERE log."action" = 'workspace.member.left';
