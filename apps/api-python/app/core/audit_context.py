from contextvars import ContextVar

# Request middleware sets the trusted transport; background jobs keep SYSTEM.
audit_source = ContextVar("flowie_audit_source", default="SYSTEM")
