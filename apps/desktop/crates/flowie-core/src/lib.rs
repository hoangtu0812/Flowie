//! The rules a run follows: the order of its steps, the lease that grants
//! the right to perform them, and the journal that says what already
//! happened if the companion restarts.
//!
//! This crate holds no input and output of its own. It decides; the shell
//! and the other crates act. That split is what lets the rules that matter
//! most â€” stop when ownership is uncertain, never restart a run that already
//! changed something, never reuse a fresh idempotency key on a retry â€” be
//! tested without a server, a repository or an agent in the way.
//! VI: CÃ¡c quy táº¯c má»™t run tuÃ¢n theo: thá»© tá»± cÃ¡c bÆ°á»›c, lease trao quyá»n thá»±c
//! VI: hiá»‡n chÃºng, vÃ  journal cho biáº¿t chuyá»‡n gÃ¬ Ä‘Ã£ xáº£y ra náº¿u companion khá»Ÿi
//! VI: Ä‘á»™ng láº¡i.
//! VI: Crate nÃ y khÃ´ng tá»± lÃ m viá»‡c vÃ o ra. NÃ³ quyáº¿t Ä‘á»‹nh; vá» á»©ng dá»¥ng vÃ  cÃ¡c
//! VI: crate khÃ¡c hÃ nh Ä‘á»™ng. ChÃ­nh sá»± tÃ¡ch báº¡ch Ä‘Ã³ cho phÃ©p kiá»ƒm thá»­ nhá»¯ng quy
//! VI: táº¯c quan trá»ng nháº¥t â€” dá»«ng khi quyá»n sá»Ÿ há»¯u khÃ´ng cháº¯c cháº¯n, khÃ´ng bao
//! VI: giá» cháº¡y láº¡i má»™t run Ä‘Ã£ thay Ä‘á»•i thá»© gÃ¬, khÃ´ng bao giá» dÃ¹ng key
//! VI: idempotency má»›i khi thá»­ láº¡i â€” mÃ  khÃ´ng cáº§n server, repository hay agent
//! VI: chen vÃ o.

pub mod config;
pub mod error;
pub mod journal;
pub mod lease;
pub mod poll;
pub mod readiness;
pub mod run;
pub mod sequence;

pub use config::{CompanionConfig, Provider, RepositoryMapping};
pub use error::ConfigError;
pub use journal::{Entry, Recovery};
pub use lease::{BudgetPolicy, Decision, LeaseTracker, HEARTBEAT_INTERVAL, SERVER_LEASE};
pub use poll::Schedule;
pub use readiness::{Readiness, REQUIRED_SCOPES};
pub use run::{Completed, Run, RunFailure};
pub use sequence::{plan, Outcome, Step, ORDER};

/// Marks the crate as wired into the workspace build.
/// VI: ÄÃ¡nh dáº¥u crate Ä‘Ã£ Ä‘Æ°á»£c ná»‘i vÃ o báº£n build cá»§a workspace.
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
