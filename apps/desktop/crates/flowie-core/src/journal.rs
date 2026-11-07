//! What the companion remembers about a run across a restart.
//!
//! After a crash, a sleep or a quit, the companion has to answer one question
//! before doing anything: did the run I was working on already have an effect
//! on the server? Re-running a task from the beginning would duplicate
//! comments and documents; reporting a result twice could overwrite what
//! another connection recorded. The journal exists so that question has an
//! answer on disk.
//! VI: Những gì companion nhớ về một run qua một lần khởi động lại.
//! VI: Sau khi crash, ngủ hoặc thoát, companion phải trả lời một câu hỏi
//! VI: trước khi làm bất cứ điều gì: run tôi đang làm đã gây ra tác động nào
//! VI: lên server chưa? Chạy lại task từ đầu sẽ nhân đôi comment và tài liệu;
//! VI: báo kết quả hai lần có thể đè lên thứ một connection khác đã ghi.
//! VI: Journal tồn tại để câu hỏi đó có câu trả lời nằm trên đĩa.
//!
//! A credential is never written here. The journal is a plain file a person
//! may be asked to send when something goes wrong.
//! VI: Không bao giờ ghi credential vào đây. Journal là một file thường mà
//! VI: người dùng có thể được yêu cầu gửi đi khi có sự cố.

use std::collections::BTreeMap;

use crate::sequence::Step;

/// One run's record. Identifiers only: enough to ask the server what
/// happened, never enough to act on the run by itself.
/// VI: Bản ghi của một run. Chỉ gồm định danh: đủ để hỏi server chuyện gì đã
/// VI: xảy ra, không bao giờ đủ để tự mình hành động trên run đó.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub run_id: String,
    pub issue_id: String,
    pub connection_id: String,
    pub provider: String,
    pub worktree: Option<String>,
    pub session_id: Option<String>,
    /// Steps already completed, in order.
    /// VI: Các bước đã hoàn thành, theo thứ tự.
    pub completed: Vec<Step>,
    /// Idempotency keys already used, by logical action, so a retry after a
    /// restart reuses the key instead of creating a second action.
    /// VI: Các idempotency key đã dùng, theo từng hành động logic, để lần thử
    /// VI: lại sau khi khởi động lại dùng lại key thay vì tạo ra hành động thứ
    /// VI: hai.
    pub keys: BTreeMap<String, String>,
    pub reported: bool,
}

impl Entry {
    pub fn new(
        run_id: impl Into<String>,
        issue_id: impl Into<String>,
        connection_id: impl Into<String>,
        provider: impl Into<String>,
    ) -> Self {
        Self {
            run_id: run_id.into(),
            issue_id: issue_id.into(),
            connection_id: connection_id.into(),
            provider: provider.into(),
            worktree: None,
            session_id: None,
            completed: Vec::new(),
            keys: BTreeMap::new(),
            reported: false,
        }
    }

    pub fn completed(&mut self, step: Step) {
        if !self.completed.contains(&step) {
            self.completed.push(step);
        }
    }

    pub fn has_completed(&self, step: Step) -> bool {
        self.completed.contains(&step)
    }

    /// Returns the key already used for `action`, or records and returns the
    /// one offered. Retrying with a fresh key is how one logical action turns
    /// into two, so the stored key always wins.
    /// VI: Trả về key đã dùng cho `action`, hoặc ghi lại và trả về key được
    /// VI: đưa vào. Thử lại với key mới chính là cách một hành động logic biến
    /// VI: thành hai, nên key đã lưu luôn thắng.
    pub fn key_for(&mut self, action: &str, offered: &str) -> String {
        self.keys
            .entry(action.to_string())
            .or_insert_with(|| offered.to_string())
            .clone()
    }

    /// Whether this run has already changed something on the server. A run
    /// that has must never be restarted from the beginning.
    /// VI: Run này đã thay đổi thứ gì trên server hay chưa. Một run đã thay
    /// VI: đổi thì không bao giờ được chạy lại từ đầu.
    pub fn has_server_side_effect(&self) -> bool {
        self.completed.iter().any(|step| step.has_side_effect())
    }

    /// What to do with this entry when the companion starts again.
    /// VI: Phải làm gì với bản ghi này khi companion khởi động lại.
    pub fn recovery(&self) -> Recovery {
        if self.reported {
            return Recovery::Settled;
        }
        if self.has_server_side_effect() {
            return Recovery::AskServer;
        }
        Recovery::SafeToDiscard
    }
}

/// How a journal entry found at startup should be treated.
/// VI: Cách xử lý một bản ghi journal tìm thấy lúc khởi động.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Recovery {
    /// The result was reported; nothing is owed.
    /// VI: Kết quả đã được báo; không còn nợ gì.
    Settled,
    /// Ask the server what state the run is in before doing anything. The
    /// companion must not guess, and must not claim work that now belongs to
    /// another connection.
    /// VI: Hỏi server xem run đang ở trạng thái nào trước khi làm gì. Companion
    /// VI: không được đoán, và không được claim việc nay thuộc về một connection
    /// VI: khác.
    AskServer,
    /// Nothing reached the server, so the entry can be dropped.
    /// VI: Chưa có gì tới được server nên bản ghi có thể bỏ đi.
    SafeToDiscard,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry() -> Entry {
        Entry::new("crun1", "DTD-1", "cconn1", "claude")
    }

    #[test]
    fn a_run_that_only_read_can_be_discarded() {
        let mut entry = entry();
        entry.completed(Step::VerifyEnvironment);
        entry.completed(Step::ReadContext);
        assert!(!entry.has_server_side_effect());
        assert_eq!(entry.recovery(), Recovery::SafeToDiscard);
    }

    #[test]
    fn a_claimed_run_must_be_checked_with_the_server() {
        let mut entry = entry();
        entry.completed(Step::ReadContext);
        entry.completed(Step::Claim);
        assert!(entry.has_server_side_effect());
        assert_eq!(entry.recovery(), Recovery::AskServer);
    }

    #[test]
    fn a_reported_run_is_settled_even_though_it_had_effects() {
        let mut entry = entry();
        entry.completed(Step::Claim);
        entry.completed(Step::ReportResult);
        entry.reported = true;
        assert_eq!(entry.recovery(), Recovery::Settled);
    }

    #[test]
    fn a_retry_reuses_the_key_it_already_sent() {
        let mut entry = entry();
        let first = entry.key_for("claim", "key-a");
        let second = entry.key_for("claim", "key-b");
        assert_eq!(first, "key-a");
        assert_eq!(
            second, "key-a",
            "a retry must not invent a key; that creates a second action"
        );
    }

    #[test]
    fn different_actions_keep_different_keys() {
        let mut entry = entry();
        assert_eq!(entry.key_for("claim", "key-a"), "key-a");
        assert_eq!(entry.key_for("report", "key-b"), "key-b");
        assert_eq!(entry.keys.len(), 2);
    }

    #[test]
    fn a_step_is_recorded_once_however_often_it_is_reported() {
        let mut entry = entry();
        entry.completed(Step::Claim);
        entry.completed(Step::Claim);
        assert_eq!(entry.completed.len(), 1);
        assert!(entry.has_completed(Step::Claim));
    }

    #[test]
    fn the_record_carries_identifiers_rather_than_secrets() {
        // The journal is a file a person may be asked to attach to a report,
        // so the type has no field a credential could sit in.
        // VI: Journal là một file người dùng có thể được yêu cầu đính kèm vào
        // VI: báo cáo, nên kiểu dữ liệu này không có chỗ nào để credential nằm.
        let entry = entry();
        let rendered = format!("{entry:?}");
        assert!(rendered.contains("crun1"));
        assert!(!rendered.to_lowercase().contains("token"));
        assert!(!rendered.to_lowercase().contains("secret"));
    }
}
