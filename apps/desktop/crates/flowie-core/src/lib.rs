//! The rules a run follows: the order of its steps, the lease that grants
//! the right to perform them, and the journal that says what already
//! happened if the companion restarts.
//!
//! This crate holds no input and output of its own. It decides; the shell
//! and the other crates act. That split is what lets the rules that matter
//! most — stop when ownership is uncertain, never restart a run that already
//! changed something, never reuse a fresh idempotency key on a retry — be
//! tested without a server, a repository or an agent in the way.
//! VI: Các quy tắc một run tuân theo: thứ tự các bước, lease trao quyền thực
//! VI: hiện chúng, và journal cho biết chuyện gì đã xảy ra nếu companion khởi
//! VI: động lại.
//! VI: Crate này không tự làm việc vào ra. Nó quyết định; vỏ ứng dụng và các
//! VI: crate khác hành động. Chính sự tách bạch đó cho phép kiểm thử những quy
//! VI: tắc quan trọng nhất — dừng khi quyền sở hữu không chắc chắn, không bao
//! VI: giờ chạy lại một run đã thay đổi thứ gì, không bao giờ dùng key
//! VI: idempotency mới khi thử lại — mà không cần server, repository hay agent
//! VI: chen vào.

pub mod config;
pub mod error;
pub mod journal;
pub mod lease;
pub mod poll;
pub mod readiness;
pub mod run;
pub mod sequence;
pub mod translate;

pub use config::{CompanionConfig, Provider, RepositoryMapping};
pub use error::ConfigError;
pub use journal::{Entry, Recovery};
pub use lease::{BudgetPolicy, Decision, LeaseTracker, HEARTBEAT_INTERVAL, SERVER_LEASE};
pub use poll::Schedule;
pub use readiness::{Readiness, REQUIRED_SCOPES};
pub use run::{
    Achievement, Completed, DocType, FeatureDoc, Review, Run, RunFailure, TaskContext, TestOutcome,
};
pub use sequence::{plan, Outcome, Step, ORDER};
pub use translate::translate;

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
