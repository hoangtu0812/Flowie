//! Configuration, the run state machine, scheduling policy and the local
//! journal. This crate owns the order of operations a run must follow and the
//! lease rules that keep two agents off the same run; it calls the other
//! crates and is called only by the application shell.
//! VI: Cấu hình, state machine của run, policy điều phối và journal cục bộ.
//! VI: Crate này sở hữu thứ tự các bước của một run và các quy tắc lease giữ
//! VI: cho hai agent không cùng chạy một run; nó gọi các crate khác và chỉ
//! VI: được gọi bởi vỏ ứng dụng.
//!
//! Scaffolding only: the behaviour arrives with DTD-498.
//! VI: Mới là khung: hành vi sẽ có ở DTD-498.

/// Marks the crate as wired into the workspace build.
/// VI: Đánh dấu crate đã được nối vào bản build của workspace.
pub fn crate_name() -> &'static str {
    "flowie-core"
}

#[cfg(test)]
mod tests {
    #[test]
    fn crate_is_wired_into_the_workspace() {
        assert_eq!(super::crate_name(), "flowie-core");
    }
}
