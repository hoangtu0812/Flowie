from contextvars import ContextVar
from typing import Any

# Request middleware sets the trusted transport; background jobs keep SYSTEM.
audit_source = ContextVar("flowie_audit_source", default="SYSTEM")
# The MCP transport sets the authenticated connection so records written on an agent's behalf
# can name it ({"connectionId", "name"}); every other request leaves it unset.
# VI: MCP transport gán connection đã xác thực để bản ghi do agent tạo có thể ghi tên agent
# VI: ({"connectionId", "name"}); mọi request khác để trống.
audit_agent: ContextVar[dict[str, str] | None] = ContextVar("flowie_audit_agent", default=None)
# The automation worker sets the rule it is running ({"ruleId", "name", "depth"}) so the records the
# rule writes name it, and the events it causes carry the rule and the chain depth that stop loops.
# VI: Worker automation gán rule đang chạy ({"ruleId", "name", "depth"}) để bản ghi do rule tạo ghi
# VI: tên rule, và sự kiện nó gây ra mang theo rule cùng độ sâu chuỗi dùng để chặn vòng lặp.
audit_automation: ContextVar[dict[str, Any] | None] = ContextVar("flowie_audit_automation", default=None)
