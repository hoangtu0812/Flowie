from contextvars import ContextVar

# Request middleware sets the trusted transport; background jobs keep SYSTEM.
audit_source = ContextVar("flowie_audit_source", default="SYSTEM")
# The MCP transport sets the authenticated connection so records written on an agent's behalf
# can name it ({"connectionId", "name"}); every other request leaves it unset.
# VI: MCP transport gán connection đã xác thực để bản ghi do agent tạo có thể ghi tên agent
# VI: ({"connectionId", "name"}); mọi request khác để trống.
audit_agent: ContextVar[dict[str, str] | None] = ContextVar("flowie_audit_agent", default=None)
