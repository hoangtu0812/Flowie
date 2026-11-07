//! Provider adapters for Claude Code and Codex, their capability probes, and
//! the lifecycle of the processes they run. Children never inherit the
//! application environment, and cancelling a run must take the whole process
//! tree with it, not just the direct child.
//! VI: Adapter provider cho Claude Code và Codex, probe khả năng của chúng, và
//! VI: vòng đời các tiến trình chúng chạy. Tiến trình con không bao giờ kế thừa
//! VI: môi trường của ứng dụng, và hủy một run phải mang theo cả cây tiến trình
//! VI: chứ không chỉ tiến trình con trực tiếp.
//!
//! Scaffolding only: the behaviour arrives with DTD-496.
//! VI: Mới là khung: hành vi sẽ có ở DTD-496.

pub fn crate_name() -> &'static str {
    "flowie-agent"
}

#[cfg(test)]
mod tests {
    #[test]
    fn crate_is_wired_into_the_workspace() {
        assert_eq!(super::crate_name(), "flowie-agent");
    }
}
