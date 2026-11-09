-- Removes agent runs, label automations and the issue event queue that fed them,
-- together with the Flowie Desktop companion that consumed them (DTD-544).
-- Run history and automation rules are deleted for good. project_repositories
-- stays: interactive agents still read it through get_project_repositories.
-- VI: Gỡ agent run, luật giao việc theo nhãn và hàng đợi sự kiện issue cấp cho
-- VI: chúng, cùng với Flowie Desktop companion đã dùng chúng (DTD-544). Lịch sử
-- VI: run và luật giao việc bị xoá vĩnh viễn. project_repositories được giữ vì
-- VI: agent tương tác vẫn đọc nó qua get_project_repositories.
DROP TRIGGER IF EXISTS agent_issue_event ON issues;
DROP FUNCTION IF EXISTS flowie_agent_issue_event();
DROP TABLE IF EXISTS agent_issue_events;
DROP TABLE IF EXISTS agent_automations;
DROP TABLE IF EXISTS agent_runs;

-- Connections that held the removed run scopes keep every other grant, so an
-- edit made later is not rejected for carrying a scope that no longer exists.
-- VI: Kết nối từng có scope run đã gỡ vẫn giữ mọi quyền khác, để một lần sửa
-- VI: sau này không bị từ chối vì mang một scope không còn tồn tại.
UPDATE mcp_connections
SET scopes = array_remove(array_remove(scopes, 'runs:read'), 'runs:write')
WHERE scopes && ARRAY['runs:read', 'runs:write']::text[];
