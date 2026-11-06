-- One row per completion sent to a workspace's AI provider. It holds usage and outcome only, so
-- prompts and replies never reach this table. Rows are deleted after 90 days by maintenance.
-- VI: Mỗi dòng là một lần gọi provider AI của workspace. Chỉ gồm usage và kết quả, nên prompt và câu
-- VI: trả lời không bao giờ vào bảng này. Maintenance xoá dòng sau 90 ngày.
CREATE TABLE "ai_provider_calls" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "status_code" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "attempts" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_provider_calls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_provider_calls_workspace_id_created_at_idx" ON "ai_provider_calls"("workspace_id", "created_at");
CREATE INDEX "ai_provider_calls_created_at_idx" ON "ai_provider_calls"("created_at");

ALTER TABLE "ai_provider_calls" ADD CONSTRAINT "ai_provider_calls_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
