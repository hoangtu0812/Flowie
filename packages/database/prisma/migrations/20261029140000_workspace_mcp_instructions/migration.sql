-- Workspace MCP workflow: the task workflow sent to AI clients at MCP initialize. NULL keeps the
-- built-in workflow from the API, so existing workspaces are unchanged.
-- VI: Quy trình MCP của workspace: quy trình xử lý task gửi cho AI client lúc MCP initialize.
-- VI: NULL giữ quy trình có sẵn trong API, nên các workspace hiện có không thay đổi.
ALTER TABLE "workspaces" ADD COLUMN "mcp_instructions" TEXT;
