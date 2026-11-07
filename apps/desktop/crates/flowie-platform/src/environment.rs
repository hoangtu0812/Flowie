//! The environment a child process is allowed to see.
//!
//! A child never inherits the companion's environment. The companion holds a
//! Flowie connection token and may hold SCM credentials; an agent CLI reading
//! them would be able to act as the companion, and anything the agent prints
//! or logs could carry them off the machine. Only the variables a tool needs
//! to find its own installation and its own login are passed through.
//! VI: Môi trường mà một tiến trình con được phép nhìn thấy.
//! VI: Tiến trình con không bao giờ kế thừa môi trường của companion.
//! VI: Companion giữ token kết nối Flowie và có thể giữ credential SCM; một
//! VI: agent CLI đọc được chúng sẽ hành động được với tư cách companion, và
//! VI: bất cứ thứ gì agent in ra hay ghi log đều có thể mang chúng ra khỏi
//! VI: máy. Chỉ những biến mà một công cụ cần để tìm bản cài đặt và thông tin
//! VI: đăng nhập của chính nó mới được truyền qua.
//!
//! The list is the one the Python runner already uses, so moving a machine
//! from the runner to the companion does not change what an agent can see.
//! VI: Danh sách này đúng bằng danh sách runner Python đang dùng, nên chuyển
//! VI: một máy từ runner sang companion không làm thay đổi những gì agent
//! VI: nhìn thấy.

use std::collections::BTreeMap;
use std::process::Command;

/// Variables a child may receive, matched without regard to case because
/// Windows environment names are case insensitive.
/// VI: Các biến tiến trình con được nhận, đối chiếu không phân biệt hoa thường
/// VI: vì tên biến môi trường trên Windows không phân biệt hoa thường.
pub const ALLOWED: &[&str] = &[
    // Finding and running programs.
    // VI: Tìm và chạy chương trình.
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    // The user's own home, where a provider keeps its credentials. On macOS
    // USER is what unlocks the keychain for the signed-in account.
    // VI: Thư mục home của người dùng, nơi provider giữ credential của nó.
    // VI: Trên macOS, USER là thứ mở khoá keychain cho tài khoản đang đăng nhập.
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    // Where each provider keeps its own configuration.
    // VI: Nơi mỗi provider giữ cấu hình riêng.
    "CODEX_HOME",
    "CLAUDE_CONFIG_DIR",
    "USER",
    "LOGNAME",
    // Text handling, so output is not mangled.
    // VI: Xử lý văn bản, để output không bị hỏng.
    "LANG",
    "LC_ALL",
];

fn is_allowed(name: &str) -> bool {
    ALLOWED
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(name))
}

/// Builds the child environment from the current process environment.
/// VI: Dựng môi trường cho tiến trình con từ môi trường của tiến trình hiện tại.
pub fn child_environment() -> BTreeMap<String, String> {
    filter(std::env::vars())
}

/// The filtering itself, separated so it can be tested without touching the
/// real process environment.
/// VI: Phần lọc được tách riêng để kiểm thử được mà không đụng vào môi trường
/// VI: thật của tiến trình.
pub fn filter<I>(variables: I) -> BTreeMap<String, String>
where
    I: IntoIterator<Item = (String, String)>,
{
    variables
        .into_iter()
        .filter(|(name, _)| is_allowed(name))
        .collect()
}

/// Replaces a command's environment with the allowed set. `env_clear` is what
/// makes this a guarantee rather than an addition: without it the child would
/// still inherit everything the parent holds.
/// VI: Thay toàn bộ môi trường của một lệnh bằng tập được phép. `env_clear`
/// VI: là thứ biến điều này thành một bảo đảm chứ không phải một phép bổ sung:
/// VI: thiếu nó thì tiến trình con vẫn kế thừa mọi thứ tiến trình cha đang giữ.
pub fn apply(command: &mut Command) {
    command.env_clear();
    for (name, value) in child_environment() {
        command.env(name, value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_flowie_token_never_reaches_a_child() {
        let environment = filter([
            ("PATH".to_string(), "/usr/bin".to_string()),
            ("FLOWIE_MCP_TOKEN".to_string(), "secret".to_string()),
            ("GITHUB_TOKEN".to_string(), "secret".to_string()),
            ("AWS_SECRET_ACCESS_KEY".to_string(), "secret".to_string()),
            ("DATABASE_URL".to_string(), "secret".to_string()),
        ]);
        assert_eq!(environment.len(), 1);
        assert!(environment.contains_key("PATH"));
        assert!(!environment.values().any(|value| value == "secret"));
    }

    #[test]
    fn the_provider_configuration_variables_pass_through() {
        let environment = filter([
            (
                "CLAUDE_CONFIG_DIR".to_string(),
                "/home/me/.claude".to_string(),
            ),
            ("CODEX_HOME".to_string(), "/home/me/.codex".to_string()),
        ]);
        assert_eq!(environment.len(), 2);
    }

    #[test]
    fn windows_names_match_without_regard_to_case() {
        let environment = filter([
            ("Path".to_string(), "C:\\bin".to_string()),
            ("PathExt".to_string(), ".COM;.EXE".to_string()),
            ("UserProfile".to_string(), "C:\\Users\\me".to_string()),
        ]);
        assert_eq!(environment.len(), 3);
    }

    #[test]
    fn the_allowed_list_has_no_duplicates() {
        let mut seen: Vec<String> = ALLOWED.iter().map(|n| n.to_ascii_uppercase()).collect();
        seen.sort();
        let count = seen.len();
        seen.dedup();
        assert_eq!(seen.len(), count, "the allowed list repeats a name");
    }

    #[test]
    fn nothing_outside_the_list_survives_even_when_it_looks_harmless() {
        let environment = filter([
            ("EDITOR".to_string(), "vim".to_string()),
            ("SHELL".to_string(), "/bin/zsh".to_string()),
            ("TERM".to_string(), "xterm".to_string()),
        ]);
        assert!(environment.is_empty());
    }
}
