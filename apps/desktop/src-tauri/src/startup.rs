//! What the companion knows about itself the moment it starts, before any
//! window or tray exists.
//!
//! Startup has to answer one question — what state is this machine in — and
//! it has to answer it without a server, because the most common reasons a
//! companion cannot work are local: nothing configured, no token, another
//! copy already running. Those are decided here so the shell has something
//! to show immediately rather than an icon that means nothing until the
//! first poll returns.
//! VI: Những gì companion biết về chính nó ngay lúc khởi động, trước khi có
//! VI: cửa sổ hay tray nào.
//! VI: Khởi động phải trả lời một câu hỏi — máy này đang ở trạng thái nào — và
//! VI: phải trả lời mà không cần server, vì những lý do phổ biến nhất khiến
//! VI: companion không làm việc được đều nằm tại máy: chưa cấu hình, không có
//! VI: token, đã có một bản khác đang chạy. Những điều đó được quyết ở đây để
//! VI: vỏ ứng dụng có thứ hiển thị ngay, thay vì một icon vô nghĩa cho tới khi
//! VI: lần poll đầu tiên trả về.
//!
//! The logic is kept out of the Tauri callbacks so it can be tested without
//! starting a desktop application.
//! VI: Phần logic được tách khỏi các callback của Tauri để kiểm thử được mà
//! VI: không cần khởi động một ứng dụng desktop.

use std::path::Path;

use flowie_core::{CompanionConfig, ConfigError, Readiness};
use flowie_platform::credential::{CredentialError, CredentialStore};

/// What startup produced: the configuration if there is one, and the state
/// to show.
/// VI: Kết quả của quá trình khởi động: cấu hình nếu có, và trạng thái cần
/// VI: hiển thị.
#[derive(Debug)]
pub struct Startup {
    pub config: Option<CompanionConfig>,
    pub readiness: Readiness,
}

/// Decides the local state. The server is not contacted: a machine that is
/// not set up, has no token or is already running a companion cannot be
/// helped by asking the server anything.
/// VI: Quyết định trạng thái cục bộ. Không liên hệ server: một máy chưa cấu
/// VI: hình, không có token, hoặc đã có companion đang chạy thì hỏi server
/// VI: cũng không giải quyết được gì.
pub fn assess_local(directory: &Path) -> Startup {
    let config = match CompanionConfig::load(directory) {
        Ok(config) => config,
        Err(ConfigError::NotConfigured) => {
            return Startup {
                config: None,
                readiness: Readiness::NotConfigured,
            }
        }
        Err(error) => {
            // A configuration that exists but cannot be used is not the same
            // as none: telling someone to set up a machine they already set
            // up hides the actual complaint, which this carries.
            // VI: Một cấu hình có tồn tại nhưng không dùng được thì khác với
            // VI: không có: bảo ai đó thiết lập một máy họ đã thiết lập rồi sẽ
            // VI: che mất lời phàn nàn thật, thứ mà trạng thái này mang theo.
            return Startup {
                config: None,
                readiness: Readiness::NeedsSignIn {
                    reason: error.to_string(),
                },
            };
        }
    };

    let store = match CredentialStore::new(&config.credential_account) {
        Ok(store) => store,
        Err(error) => {
            return Startup {
                config: Some(config),
                readiness: Readiness::NeedsSignIn {
                    reason: error.to_string(),
                },
            }
        }
    };

    let readiness = match store.is_configured() {
        Ok(true) => {
            if config.paused {
                Readiness::Paused
            } else {
                // Locally everything is in place. Whether the connection can
                // actually do the work is a question only the server can
                // answer, so the first poll refines this.
                // VI: Về phía máy thì mọi thứ đã đủ. Kết nối có thật sự làm
                // VI: được việc hay không là câu hỏi chỉ server trả lời được,
                // VI: nên lần poll đầu tiên sẽ làm rõ thêm.
                Readiness::Disconnected {
                    detail: "not contacted yet".into(),
                }
            }
        }
        Ok(false) => Readiness::NeedsSignIn {
            reason: "no token is stored for this endpoint".into(),
        },
        Err(CredentialError::Unavailable(detail)) => Readiness::NeedsSignIn {
            reason: format!("the credential store is unavailable: {detail}"),
        },
        Err(error) => Readiness::NeedsSignIn {
            reason: error.to_string(),
        },
    };

    Startup {
        config: Some(config),
        readiness,
    }
}

/// Turns pausing on or off and writes it down, so the choice survives a
/// restart. A pause that is forgotten when the app reopens is worse than no
/// pause at all: the person believes the machine is holding still and it is
/// not.
/// VI: Bật hoặc tắt tạm dừng và ghi lại, để lựa chọn đó sống sót qua lần khởi
/// VI: động lại. Một lần tạm dừng bị quên khi mở lại ứng dụng còn tệ hơn không
/// VI: tạm dừng: người dùng tin rằng máy đang đứng yên trong khi nó không.
pub fn set_paused(
    directory: &Path,
    config: &mut CompanionConfig,
    paused: bool,
) -> Result<(), ConfigError> {
    config.paused = paused;
    config.save(directory)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flowie_core::config::{Provider, RepositoryMapping};
    use std::path::PathBuf;

    /// Each test gets its own credential account. Sharing one lets a test
    /// that deletes a token race a test that just saved one, which is how
    /// this suite failed the first time it ran in parallel.
    /// VI: Mỗi test có một credential account riêng. Dùng chung một account
    /// VI: khiến test đang xoá token đua với test vừa lưu token, và đó chính
    /// VI: là cách bộ test này hỏng ở lần đầu chạy song song.
    fn config(name: &str) -> CompanionConfig {
        CompanionConfig {
            endpoint: "https://flowie.example.com/mcp/".into(),
            credential_account: format!("startup-test-{name}-{}", std::process::id()),
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
            paused: false,
        }
    }

    #[test]
    fn a_machine_with_no_configuration_is_not_set_up() {
        let directory = tempfile::tempdir().unwrap();
        let startup = assess_local(directory.path());
        assert_eq!(startup.readiness, Readiness::NotConfigured);
        assert!(startup.config.is_none());
        assert!(startup.readiness.needs_person());
    }

    #[test]
    fn a_broken_configuration_is_not_reported_as_a_fresh_machine() {
        // Telling someone to set up a machine they already set up hides the
        // real complaint, so this keeps the complaint.
        // VI: Bảo ai đó thiết lập một máy họ đã thiết lập rồi sẽ che mất lời
        // VI: phàn nàn thật, nên ở đây giữ lại lời phàn nàn đó.
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(
            CompanionConfig::path_in(directory.path()),
            "{ not json at all",
        )
        .unwrap();
        let startup = assess_local(directory.path());
        assert_ne!(startup.readiness, Readiness::NotConfigured);
        match startup.readiness {
            Readiness::NeedsSignIn { reason } => assert!(!reason.is_empty()),
            other => panic!("expected a reason, got {other:?}"),
        }
    }

    #[test]
    fn a_configured_machine_without_a_token_asks_for_one() {
        let directory = tempfile::tempdir().unwrap();
        config("no-token").save(directory.path()).unwrap();
        let startup = assess_local(directory.path());
        assert!(startup.config.is_some());
        match startup.readiness {
            Readiness::NeedsSignIn { .. } => {}
            // A machine with no usable credential store cannot distinguish
            // these; CI covers the platforms that can.
            // VI: Máy không có kho credential dùng được thì không phân biệt
            // VI: được hai trường hợp; CI phủ các nền tảng phân biệt được.
            other => panic!("expected NeedsSignIn, got {other:?}"),
        }
    }

    #[test]
    fn pausing_is_remembered_across_a_restart() {
        let directory = tempfile::tempdir().unwrap();
        let mut config = config("pause-restart");
        config.save(directory.path()).unwrap();

        set_paused(directory.path(), &mut config, true).unwrap();
        let reloaded = CompanionConfig::load(directory.path()).unwrap();
        assert!(reloaded.paused, "a forgotten pause is worse than none");

        let mut reloaded = reloaded;
        set_paused(directory.path(), &mut reloaded, false).unwrap();
        assert!(!CompanionConfig::load(directory.path()).unwrap().paused);
    }

    #[test]
    fn a_paused_machine_says_so_before_contacting_anything() {
        let directory = tempfile::tempdir().unwrap();
        let mut config = config("paused");
        config.paused = true;
        config.save(directory.path()).unwrap();

        let store = CredentialStore::new(&config.credential_account).unwrap();
        if store.save("flowie_live_startup_test").is_err() {
            return; // no usable credential store here
        }
        let startup = assess_local(directory.path());
        let _ = store.delete();
        assert_eq!(startup.readiness, Readiness::Paused);
        assert!(!startup.readiness.needs_person());
    }

    #[test]
    fn a_ready_machine_starts_disconnected_rather_than_claiming_to_be_ready() {
        // Local checks cannot prove the connection works, and showing Ready
        // before the server has answered would be a claim the app cannot
        // support.
        // VI: Kiểm tra cục bộ không chứng minh được kết nối hoạt động, và hiện
        // VI: Ready trước khi server trả lời là một khẳng định ứng dụng không
        // VI: có cơ sở.
        let directory = tempfile::tempdir().unwrap();
        let config = config("ready");
        config.save(directory.path()).unwrap();
        let store = CredentialStore::new(&config.credential_account).unwrap();
        if store.save("flowie_live_startup_test").is_err() {
            return;
        }
        let startup = assess_local(directory.path());
        let _ = store.delete();
        assert!(matches!(startup.readiness, Readiness::Disconnected { .. }));
        assert!(!startup.readiness.may_claim());
    }
}
