//! MCP client and the Flowie tool contract: the streamable HTTP transport, the
//! `{data: ...}` envelope, and typed wrappers for the tools a runner needs.
//! Every error the server can return must stay distinguishable here, because
//! the shell shows a different state for a revoked token, a missing scope, a
//! lost lease and an exhausted run budget.
//! VI: Client MCP và hợp đồng tool Flowie: transport streamable HTTP, envelope
//! VI: `{data: ...}`, và lớp bọc có kiểu cho các tool runner cần. Mọi lỗi server
//! VI: trả về phải giữ được tính phân biệt ở đây, vì vỏ ứng dụng hiển thị trạng
//! VI: thái khác nhau cho token bị thu hồi, thiếu scope, mất lease và hết budget.
//!
//! Scaffolding only: the behaviour arrives with DTD-494.
//! VI: Mới là khung: hành vi sẽ có ở DTD-494.

pub fn crate_name() -> &'static str {
    "flowie-mcp"
}

#[cfg(test)]
mod tests {
    #[test]
    fn crate_is_wired_into_the_workspace() {
        assert_eq!(super::crate_name(), "flowie-mcp");
    }
}
