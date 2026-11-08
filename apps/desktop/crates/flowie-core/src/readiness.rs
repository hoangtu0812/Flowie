//! Whether this machine can take work, and what to show when it cannot.
//!
//! The companion has no screen of its own beyond a tray icon, so the state it
//! reports has to be specific enough to act on. "Something is wrong" sends a
//! person to restart the network when their token was revoked, or to re-enter
//! a token when the real problem is a missing scope that only an
//! administrator can grant.
//! VI: Máy này có nhận việc được không, và hiển thị gì khi không.
//! VI: Companion không có màn hình riêng ngoài một icon tray, nên trạng thái
//! VI: nó báo phải đủ cụ thể để hành động. "Có gì đó sai" sẽ đẩy người dùng đi
//! VI: khởi động lại mạng trong khi token của họ bị thu hồi, hoặc đi nhập lại
//! VI: token trong khi vấn đề thật là thiếu một scope mà chỉ quản trị viên cấp
//! VI: được.
//!
//! Permission is probed against the work, not inferred from a successful
//! connection. A token that authenticates may still be missing `runs:write`,
//! and discovering that halfway through a run means the agent has already
//! edited a repository for a result it cannot report.
//! VI: Quyền được probe theo công việc thật, không suy ra từ việc kết nối
//! VI: thành công. Một token xác thực được vẫn có thể thiếu `runs:write`, và
//! VI: phát hiện điều đó giữa chừng nghĩa là agent đã sửa repository cho một
//! VI: kết quả mà nó không báo được.

use crate::config::CompanionConfig;

/// Scopes the companion needs before it may accept a single run.
///
/// Each one is needed by a step the run will certainly reach, so a machine
/// missing any of them cannot finish and should not start. `issues:write` and
/// `comments:write` matter as much as `runs:write`: the plan comment and the
/// target date are written before the agent touches code, so a token without
/// them fails after claiming rather than before.
/// VI: Các scope companion cần trước khi được nhận dù chỉ một run.
/// VI: Mỗi scope đều cần cho một bước mà run chắc chắn đi tới, nên máy thiếu
/// VI: bất kỳ scope nào cũng không hoàn thành được và không nên bắt đầu.
/// VI: `issues:write` và `comments:write` quan trọng ngang `runs:write`:
/// VI: comment kế hoạch và ngày kết thúc được ghi trước khi agent đụng vào
/// VI: code, nên token thiếu chúng sẽ hỏng sau khi đã claim chứ không phải
/// VI: trước đó.
pub const REQUIRED_SCOPES: &[&str] = &[
    "context:read",
    "issues:read",
    "issues:write",
    "comments:write",
    "documents:read",
    "documents:write",
    "projects:read",
    "runs:read",
    "runs:write",
];

/// What the tray shows and what the loop may do.
/// VI: Những gì tray hiển thị và những gì vòng lặp được phép làm.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Readiness {
    /// Nothing has been set up on this machine.
    /// VI: Máy này chưa được thiết lập gì.
    NotConfigured,
    /// Set up, but no usable token: none stored, or the server rejected it.
    /// VI: Đã thiết lập nhưng không có token dùng được: chưa lưu, hoặc server
    /// VI: từ chối.
    NeedsSignIn { reason: String },
    /// Authenticated, but the connection cannot do the whole job. Naming the
    /// scopes matters because granting them is an administrator's action, not
    /// something the person at this machine can fix by signing in again.
    /// VI: Đã xác thực nhưng kết nối không làm trọn được công việc. Nêu tên
    /// VI: scope là quan trọng vì cấp chúng là việc của quản trị viên, không
    /// VI: phải thứ người ngồi ở máy này sửa được bằng cách đăng nhập lại.
    MissingScopes { scopes: Vec<String> },
    /// The server cannot be reached right now. Transient by assumption, so
    /// the loop keeps trying instead of asking anyone to do anything.
    /// VI: Hiện không liên lạc được với server. Mặc định coi là tạm thời, nên
    /// VI: vòng lặp cứ thử lại thay vì yêu cầu ai làm gì.
    Disconnected { detail: String },
    /// Able to work, but told not to take anything new.
    /// VI: Làm việc được, nhưng đang được yêu cầu không nhận thêm việc mới.
    Paused,
    /// Able to work and waiting for something to do.
    /// VI: Làm việc được và đang chờ việc.
    Ready,
}

impl Readiness {
    /// Whether the loop may claim a run in this state.
    /// VI: Vòng lặp có được claim một run ở trạng thái này không.
    pub fn may_claim(&self) -> bool {
        matches!(self, Readiness::Ready)
    }

    /// Whether a person has to do something before this machine works again.
    /// A disconnected companion is not in this set: waiting is the right
    /// response to a network that is down.
    /// VI: Có cần người làm gì đó thì máy này mới chạy lại được không. Companion
    /// VI: mất kết nối không thuộc nhóm này: chờ là phản ứng đúng với một mạng
    /// VI: đang hỏng.
    pub fn needs_person(&self) -> bool {
        matches!(
            self,
            Readiness::NotConfigured
                | Readiness::NeedsSignIn { .. }
                | Readiness::MissingScopes { .. }
        )
    }

    /// A single line for the tray, in the reader's language.
    /// VI: Một dòng cho tray, theo ngôn ngữ người đọc.
    pub fn summary(&self, vietnamese: bool) -> String {
        match self {
            Readiness::NotConfigured => if vietnamese {
                "Chưa cấu hình"
            } else {
                "Not set up yet"
            }
            .to_string(),
            Readiness::NeedsSignIn { .. } => if vietnamese {
                "Cần đăng nhập lại"
            } else {
                "Needs signing in"
            }
            .to_string(),
            Readiness::MissingScopes { scopes } => {
                let list = scopes.join(", ");
                if vietnamese {
                    format!("Thiếu quyền: {list}")
                } else {
                    format!("Missing permission: {list}")
                }
            }
            Readiness::Disconnected { .. } => if vietnamese {
                "Mất kết nối"
            } else {
                "Disconnected"
            }
            .to_string(),
            Readiness::Paused => if vietnamese {
                "Tạm dừng nhận việc"
            } else {
                "Paused"
            }
            .to_string(),
            Readiness::Ready => if vietnamese { "Sẵn sàng" } else { "Ready" }.to_string(),
        }
    }
}

/// Decides readiness from what the server said about this connection.
///
/// `scopes` is what `get_my_access` reported. Taking it as data rather than
/// calling the server here keeps the decision testable and keeps this crate
/// free of the transport.
/// VI: Quyết định trạng thái sẵn sàng từ những gì server nói về kết nối này.
/// VI: `scopes` là thứ `get_my_access` báo về. Nhận nó dưới dạng dữ liệu thay
/// VI: vì tự gọi server giúp quyết định này kiểm thử được và giữ crate này
/// VI: không dính tới transport.
pub fn assess(config: &CompanionConfig, scopes: &[String], writes_enabled: bool) -> Readiness {
    let missing: Vec<String> = REQUIRED_SCOPES
        .iter()
        .filter(|needed| !scopes.iter().any(|held| held == *needed))
        .map(|needed| (*needed).to_string())
        .collect();
    if !missing.is_empty() {
        return Readiness::MissingScopes { scopes: missing };
    }
    // A connection can hold every scope and still be read-only, which the
    // server reports separately. Claiming with it would fail at the first
    // write, after the run is already taken.
    // VI: Một kết nối có thể đủ mọi scope mà vẫn ở chế độ chỉ đọc, điều server
    // VI: báo riêng. Claim bằng nó sẽ hỏng ở lần ghi đầu tiên, khi run đã bị
    // VI: nhận rồi.
    if !writes_enabled {
        return Readiness::MissingScopes {
            scopes: vec!["writes are disabled for this connection".into()],
        };
    }
    if config.paused {
        return Readiness::Paused;
    }
    Readiness::Ready
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{CompanionConfig, Provider, RepositoryMapping};
    use std::path::PathBuf;

    fn config(paused: bool) -> CompanionConfig {
        CompanionConfig {
            endpoint: "https://flowie.example.com/mcp/".into(),
            credential_account: "flowie.example.com".into(),
            provider: Provider::Claude,
            repositories: vec![RepositoryMapping {
                project_id: "cproj1".into(),
                repository_url: "https://github.com/a/b".into(),
                base_branch: "main".into(),
                path: if cfg!(windows) {
                    PathBuf::from("C:\\code\\b")
                } else {
                    PathBuf::from("/code/b")
                },
                approved_tests: vec![vec!["pnpm".into(), "test".into()]],
                may_publish: false,
            }],
            poll_seconds: 10,
            paused,
        }
    }

    fn all_scopes() -> Vec<String> {
        REQUIRED_SCOPES.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn a_fully_scoped_connection_is_ready() {
        assert_eq!(
            assess(&config(false), &all_scopes(), true),
            Readiness::Ready
        );
    }

    #[test]
    fn a_paused_companion_is_able_but_not_claiming() {
        let state = assess(&config(true), &all_scopes(), true);
        assert_eq!(state, Readiness::Paused);
        assert!(!state.may_claim());
        // Pausing is a choice, not a fault; nobody needs to fix anything.
        // VI: Tạm dừng là một lựa chọn chứ không phải lỗi; không ai cần sửa gì.
        assert!(!state.needs_person());
    }

    #[test]
    fn a_missing_write_scope_is_named_rather_than_generic() {
        let mut scopes = all_scopes();
        scopes.retain(|scope| scope != "runs:write");
        match assess(&config(false), &scopes, true) {
            Readiness::MissingScopes { scopes } => assert_eq!(scopes, vec!["runs:write"]),
            other => panic!("expected the scope named, got {other:?}"),
        }
    }

    #[test]
    fn the_scopes_needed_after_claiming_are_checked_before_it() {
        // issues:write and comments:write are used after the run is claimed,
        // writing the plan and the target date. A token without them would
        // fail with work already taken, so they gate the start.
        // VI: issues:write và comments:write được dùng sau khi claim, lúc ghi
        // VI: kế hoạch và ngày kết thúc. Token thiếu chúng sẽ hỏng khi việc đã
        // VI: bị nhận, nên chúng chặn ngay từ đầu.
        for scope in ["issues:write", "comments:write", "documents:write"] {
            let mut scopes = all_scopes();
            scopes.retain(|held| held != scope);
            let state = assess(&config(false), &scopes, true);
            assert!(!state.may_claim(), "{scope} must block claiming");
            assert!(state.needs_person(), "{scope} needs someone to grant it");
        }
    }

    #[test]
    fn a_read_only_connection_cannot_claim_even_with_every_scope() {
        let state = assess(&config(false), &all_scopes(), false);
        assert!(!state.may_claim());
        assert!(matches!(state, Readiness::MissingScopes { .. }));
    }

    #[test]
    fn extra_scopes_do_not_matter() {
        let mut scopes = all_scopes();
        scopes.push("activities:read".into());
        assert_eq!(assess(&config(false), &scopes, true), Readiness::Ready);
    }

    #[test]
    fn being_offline_is_not_something_a_person_must_fix() {
        let state = Readiness::Disconnected {
            detail: "timed out".into(),
        };
        assert!(!state.may_claim());
        assert!(!state.needs_person());
    }

    #[test]
    fn every_state_says_something_in_both_languages() {
        let states = [
            Readiness::NotConfigured,
            Readiness::NeedsSignIn {
                reason: "revoked".into(),
            },
            Readiness::MissingScopes {
                scopes: vec!["runs:write".into()],
            },
            Readiness::Disconnected {
                detail: "offline".into(),
            },
            Readiness::Paused,
            Readiness::Ready,
        ];
        for state in states {
            assert!(!state.summary(false).is_empty());
            assert!(!state.summary(true).is_empty());
            assert_ne!(state.summary(false), state.summary(true));
        }
    }

    #[test]
    fn the_required_scopes_have_no_duplicates() {
        let mut sorted: Vec<&str> = REQUIRED_SCOPES.to_vec();
        sorted.sort_unstable();
        let count = sorted.len();
        sorted.dedup();
        assert_eq!(sorted.len(), count);
    }
}
