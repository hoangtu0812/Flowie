//! What the configuration window can read and change.
//!
//! The window never decides anything. It reads the file through the same type
//! the companion runs on and writes through the same validation, so a setting
//! the window accepts is one the companion will accept too. A screen with its
//! own idea of what is valid is a screen that lets someone save a machine that
//! cannot work.
//! VI: Những gì cửa sổ cấu hình đọc và thay đổi được.
//! VI: Cửa sổ không tự quyết định gì. Nó đọc file qua đúng kiểu dữ liệu mà
//! VI: companion đang chạy và ghi qua đúng bước kiểm tra đó, nên một thiết lập
//! VI: cửa sổ chấp nhận cũng là thiết lập companion chấp nhận. Một màn hình có
//! VI: quan niệm riêng về thế nào là hợp lệ là màn hình cho phép lưu một cấu
//! VI: hình máy không chạy được.
//!
//! There is no "test the connection" button, on purpose. The worker checks the
//! connection on every pass and reports what it found, so the window shows
//! that rather than running a second, separate check that could disagree with
//! the one the companion actually uses.
//! VI: Cố ý không có nút "kiểm tra kết nối". Worker kiểm kết nối ở mỗi lượt và
//! VI: báo lại kết quả, nên cửa sổ hiển thị đúng thứ đó thay vì chạy một phép
//! VI: kiểm thứ hai, tách biệt, có thể mâu thuẫn với phép kiểm mà companion
//! VI: thật sự dùng.

use flowie_core::CompanionConfig;
use flowie_platform::credential::CredentialStore;
use serde::Serialize;
use tauri::State;

use tauri_plugin_autostart::ManagerExt;

use crate::Companion;

/// Everything the window draws in one answer, so it cannot show a token state
/// from one moment beside a configuration from another.
/// VI: Mọi thứ cửa sổ cần vẽ trong một câu trả lời, để nó không hiển thị trạng
/// VI: thái token của lúc này cạnh cấu hình của lúc khác.
#[derive(Debug, Serialize)]
// Named for the window that reads it. The configuration file keeps its own
// snake_case field names, which are the ones a person edits.
// VI: Đặt tên theo cách cửa sổ đọc nó. File cấu hình giữ tên trường snake_case
// VI: của riêng nó, đó mới là thứ người dùng sửa.
#[serde(rename_all = "camelCase")]
pub struct SetupView {
    /// The configuration as it is on disk, pretty-printed for editing, or an
    /// empty string on a machine that has none.
    /// VI: Cấu hình đúng như trên đĩa, in đẹp để sửa, hoặc chuỗi rỗng trên máy
    /// VI: chưa có cấu hình nào.
    pub configuration: String,
    /// Named so a person can find the file, back it up, or fix it by hand
    /// when the window will not let them save something.
    /// VI: Nêu rõ để người dùng tìm được file, sao lưu, hoặc sửa tay khi cửa sổ
    /// VI: không cho lưu một thứ gì đó.
    pub path: String,
    /// Whether a token is stored, never the token itself. The window has no
    /// reason to see it and a window that displays it is a window that leaks
    /// it into a screenshot.
    /// VI: Có token đang được lưu hay không, không bao giờ là chính token đó.
    /// VI: Cửa sổ không có lý do gì để thấy nó, và một cửa sổ hiển thị nó là cửa
    /// VI: sổ làm lộ nó vào một ảnh chụp màn hình.
    pub has_token: bool,
    /// What the worker last reported, in the reader's language.
    /// VI: Những gì worker báo lần gần nhất, theo ngôn ngữ người đọc.
    pub state: String,
    /// Whether that state is something a person has to act on.
    /// VI: Trạng thái đó có phải thứ cần người dùng xử lý hay không.
    pub needs_person: bool,
    /// The task in hand, when there is one.
    /// VI: Task đang làm, nếu có.
    pub activity: Option<String>,
    /// Whether the machine will actually start the companion at sign-in, read
    /// back from the system rather than from the file, so a registration that
    /// did not take is visible.
    /// VI: Máy có thật sự khởi động companion lúc đăng nhập hay không, đọc từ hệ
    /// VI: thống chứ không từ file, để một lần đăng ký không ăn thì nhìn thấy
    /// VI: được.
    pub starts_at_login: bool,
    /// Why the configuration on disk cannot be used, when that is the case.
    /// VI: Vì sao cấu hình trên đĩa không dùng được, nếu đúng là vậy.
    pub problem: Option<String>,
}

#[tauri::command]
pub fn load_setup(app: tauri::AppHandle, companion: State<'_, Companion>) -> SetupView {
    let path = CompanionConfig::path_in(&companion.directory);
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let problem = match CompanionConfig::load(&companion.directory) {
        Ok(_) => None,
        Err(flowie_core::ConfigError::NotConfigured) => None,
        Err(error) => Some(error.to_string()),
    };
    let readiness = companion.shared.readiness();

    SetupView {
        configuration: raw,
        path: path.display().to_string(),
        has_token: stored_token(&companion.directory),
        state: readiness.summary(crate::VIETNAMESE),
        needs_person: readiness.needs_person(),
        activity: companion.shared.task(),
        starts_at_login: app.autolaunch().is_enabled().unwrap_or(false),
        problem,
    }
}

/// Saves the configuration, refusing anything the companion would refuse.
///
/// The text is parsed into the same type the companion runs on, so a field
/// that is misspelled or a path that is not absolute is rejected here with the
/// same complaint the companion would make, rather than being written and
/// discovered on the next poll.
/// VI: Lưu cấu hình, từ chối mọi thứ mà companion sẽ từ chối.
/// VI: Phần chữ được parse thành đúng kiểu dữ liệu companion đang chạy, nên một
/// VI: trường gõ sai hay một đường dẫn không tuyệt đối đều bị từ chối ngay tại
/// VI: đây với đúng lời phàn nàn companion sẽ đưa ra, thay vì được ghi xuống rồi
/// VI: mới bị phát hiện ở lượt poll kế tiếp.
#[tauri::command]
pub fn save_setup(
    app: tauri::AppHandle,
    companion: State<'_, Companion>,
    configuration: String,
) -> Result<(), String> {
    let parsed: CompanionConfig =
        serde_json::from_str(&configuration).map_err(|error| error.to_string())?;
    parsed
        .save(&companion.directory)
        .map_err(|error| error.to_string())?;
    // Registration follows the saved file, not the other way round. Doing it
    // after the save means a configuration that was refused never changes what
    // happens at sign-in.
    // VI: Việc đăng ký đi theo file đã lưu chứ không ngược lại. Làm sau khi lưu
    // VI: nghĩa là một cấu hình bị từ chối không bao giờ đổi được điều xảy ra
    // VI: lúc đăng nhập.
    apply_start_at_login(&app, parsed.start_at_login)?;

    // The tray's pause entry works off this copy, so it is replaced rather
    // than left describing the previous file.
    // VI: Mục tạm dừng trên tray hoạt động dựa vào bản sao này, nên nó được thay
    // VI: mới chứ không để mô tả file cũ.
    if let Ok(mut held) = companion.config.lock() {
        *held = Some(parsed);
    }
    Ok(())
}

/// Brings the sign-in registration into line with the setting.
///
/// Read back afterwards rather than assumed: a registration that silently
/// failed would leave the window reporting a choice the machine will not
/// honour, which is worse than refusing to save it.
/// VI: Đưa phần đăng ký khởi động-lúc-đăng-nhập về đúng thiết lập.
/// VI: Đọc lại sau khi đặt chứ không mặc định là xong: một lần đăng ký hỏng âm
/// VI: thầm sẽ để cửa sổ báo một lựa chọn mà máy không thực hiện, và điều đó tệ
/// VI: hơn là từ chối lưu nó.
pub fn apply_start_at_login(app: &tauri::AppHandle, wanted: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    let result = if wanted {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|error| format!("không đặt được khởi động cùng đăng nhập: {error}"))?;

    match manager.is_enabled() {
        Ok(actual) if actual == wanted => Ok(()),
        Ok(actual) => Err(format!(
            "đã yêu cầu khởi động cùng đăng nhập = {wanted} nhưng hệ thống báo {actual}"
        )),
        Err(error) => Err(format!("không đọc lại được trạng thái khởi động: {error}")),
    }
}

/// Puts the token in the operating system's credential store.
///
/// It never reaches the configuration file: that file is copied into bug
/// reports and synced to backups, and a bearer token that can claim runs does
/// not belong there. The type has no field for it and this is the only way in.
/// VI: Đặt token vào kho credential của hệ điều hành.
/// VI: Nó không bao giờ tới file cấu hình: file đó bị chép vào báo cáo lỗi và
/// VI: đồng bộ lên backup, mà một bearer token claim được run thì không thuộc về
/// VI: đó. Kiểu dữ liệu không có trường cho nó, và đây là đường vào duy nhất.
#[tauri::command]
pub fn save_token(companion: State<'_, Companion>, token: String) -> Result<(), String> {
    let account = account(&companion.directory)?;
    CredentialStore::new(account)
        .map_err(|error| error.to_string())?
        .save(token.trim())
        .map_err(|error| error.to_string())
}

/// Removes the stored token, which is what someone does when they hand the
/// machine on or when a token is revoked.
/// VI: Xoá token đang lưu, việc người dùng làm khi nhượng lại máy hoặc khi một
/// VI: token bị thu hồi.
#[tauri::command]
pub fn forget_token(companion: State<'_, Companion>) -> Result<(), String> {
    let account = account(&companion.directory)?;
    CredentialStore::new(account)
        .map_err(|error| error.to_string())?
        .delete()
        .map_err(|error| error.to_string())
}

/// The credential account the saved configuration names.
///
/// Read from the file rather than from the copy in memory, because the token
/// belongs to the configuration that was saved: storing it against an account
/// from an older version would leave the companion looking in the wrong place.
/// VI: Credential account mà cấu hình đã lưu nêu tên.
/// VI: Đọc từ file chứ không từ bản sao trong bộ nhớ, vì token thuộc về cấu hình
/// VI: đã được lưu: lưu nó theo một account của phiên bản cũ sẽ khiến companion
/// VI: đi tìm sai chỗ.
fn account(directory: &std::path::Path) -> Result<String, String> {
    CompanionConfig::load(directory)
        .map(|config| config.credential_account)
        .map_err(|error| format!("lưu cấu hình trước đã: {error}"))
}

fn stored_token(directory: &std::path::Path) -> bool {
    CompanionConfig::load(directory)
        .ok()
        .and_then(|config| CredentialStore::new(config.credential_account).ok())
        .and_then(|store| store.is_configured().ok())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flowie_core::config::{Provider, RepositoryMapping};
    use std::path::PathBuf;

    fn config(account: &str) -> CompanionConfig {
        CompanionConfig {
            endpoint: "https://flowie.example.com/mcp/".into(),
            credential_account: account.into(),
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
            start_at_login: false,
        }
    }

    #[test]
    fn the_account_comes_from_the_saved_file_not_an_unsaved_edit() {
        // A token stored against an account the companion does not read is a
        // token the companion cannot find.
        // VI: Một token lưu theo account mà companion không đọc tới là token
        // VI: companion không tìm thấy.
        let directory = tempfile::tempdir().expect("a temporary directory");
        assert!(account(directory.path()).is_err(), "nothing saved yet");

        config("saved-account")
            .save(directory.path())
            .expect("the configuration saves");
        assert_eq!(account(directory.path()).unwrap(), "saved-account");
    }

    #[test]
    fn asking_to_store_a_token_before_the_configuration_says_what_to_do_first() {
        // The complaint has to name the order, because "no such account" would
        // send someone looking for a credential problem they do not have.
        // VI: Lời phàn nàn phải nêu rõ thứ tự, vì "không có account đó" sẽ đẩy
        // VI: người dùng đi tìm một vấn đề credential mà họ không gặp.
        let directory = tempfile::tempdir().expect("a temporary directory");
        let error = account(directory.path()).expect_err("no configuration");
        assert!(error.contains("lưu cấu hình trước"), "{error}");
    }

    #[test]
    fn a_configuration_the_companion_would_refuse_is_refused_here_too() {
        // Saving it and discovering the problem on the next poll would leave
        // the window claiming success over a machine that cannot work.
        // VI: Lưu nó rồi tới lượt poll sau mới phát hiện sẽ khiến cửa sổ báo
        // VI: thành công cho một cấu hình máy không chạy được.
        let directory = tempfile::tempdir().expect("a temporary directory");
        let mut wrong = config("refused");
        wrong.endpoint = "not-a-url".into();
        let text = serde_json::to_string(&wrong).expect("serialises");
        let parsed: CompanionConfig = serde_json::from_str(&text).expect("parses");
        assert!(parsed.save(directory.path()).is_err());
        // Nothing was written, so a later load does not pick up the bad file.
        // VI: Không có gì được ghi, nên lần đọc sau không nhặt phải file hỏng.
        assert!(matches!(
            CompanionConfig::load(directory.path()),
            Err(flowie_core::ConfigError::NotConfigured)
        ));
    }

    #[test]
    fn a_machine_with_no_configuration_reports_no_token_rather_than_failing() {
        let directory = tempfile::tempdir().expect("a temporary directory");
        assert!(!stored_token(directory.path()));
    }
}
