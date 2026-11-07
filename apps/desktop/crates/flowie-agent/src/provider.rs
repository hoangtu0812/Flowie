//! Capability probes for the agent command line tools.
//!
//! The checks mirror `ClaudeProvider.doctor` and `CodexProvider.doctor` in
//! the Python runner, so a machine that satisfies the runner satisfies the
//! companion and nothing silently becomes stricter during the move.
//! VI: Probe khả năng cho các công cụ dòng lệnh của agent.
//! VI: Các kiểm tra mô phỏng `ClaudeProvider.doctor` và `CodexProvider.doctor`
//! VI: của runner Python, để một máy đạt yêu cầu của runner cũng đạt yêu cầu
//! VI: của companion và không có gì âm thầm trở nên khắt khe hơn khi chuyển.
//!
//! A missing tool, a tool too old for the flags the runner depends on, and a
//! tool nobody has signed into are three different situations with three
//! different fixes, so they are three different outcomes here.
//! VI: Công cụ không có, công cụ quá cũ so với các flag runner cần, và công cụ
//! VI: chưa ai đăng nhập là ba tình huống khác nhau với ba cách xử lý khác
//! VI: nhau, nên ở đây chúng là ba kết quả khác nhau.

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::error::{Error, Result};

/// Flags `ClaudeProvider.doctor` requires; without any of them the runner
/// cannot constrain what the agent is allowed to do.
/// VI: Các flag `ClaudeProvider.doctor` yêu cầu; thiếu bất kỳ flag nào thì
/// VI: runner không giới hạn được agent được phép làm gì.
pub const CLAUDE_REQUIRED_FLAGS: &[&str] = &[
    "--print",
    "--output-format",
    "--verbose",
    "--json-schema",
    "--permission-mode",
    "--permission-prompts",
    "--tools",
    "--restricted",
    "--strict-mcp-config",
    "--session-id",
    "--name",
];

/// Flags `CodexProvider.doctor` requires, which are what keep a run inside a
/// sandbox with a checked output shape.
/// VI: Các flag `CodexProvider.doctor` yêu cầu, đây là thứ giữ một run nằm
/// VI: trong sandbox với hình dạng output được kiểm tra.
pub const CODEX_REQUIRED_FLAGS: &[&str] = &[
    "--sandbox",
    "--ephemeral",
    "--ignore-user-config",
    "--output-last-message",
    "--output-schema",
];

const PROBE_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Claude,
    Codex,
}

impl Provider {
    pub fn default_program(self) -> &'static str {
        match self {
            Provider::Claude => "claude",
            Provider::Codex => "codex",
        }
    }

    pub fn required_flags(self) -> &'static [&'static str] {
        match self {
            Provider::Claude => CLAUDE_REQUIRED_FLAGS,
            Provider::Codex => CODEX_REQUIRED_FLAGS,
        }
    }

    /// The arguments that print the help text the required flags are looked
    /// for in. Codex keeps them on a subcommand.
    /// VI: Các argument in ra trợ giúp để tìm những flag bắt buộc. Codex đặt
    /// VI: chúng ở một subcommand.
    pub fn help_arguments(self) -> &'static [&'static str] {
        match self {
            Provider::Claude => &["--help"],
            Provider::Codex => &["exec", "--help"],
        }
    }

    pub fn login_arguments(self) -> &'static [&'static str] {
        match self {
            Provider::Claude => &["auth", "status", "--json"],
            Provider::Codex => &["login", "status"],
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Provider::Claude => "Claude Code",
            Provider::Codex => "Codex CLI",
        }
    }
}

/// What a probe found. Anything other than `Ready` names what a person has
/// to do.
/// VI: Những gì probe tìm thấy. Mọi kết quả khác `Ready` đều nêu rõ một người
/// VI: phải làm gì.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Capability {
    Ready {
        path: PathBuf,
        version: String,
    },
    NotInstalled {
        program: String,
    },
    TooOld {
        path: PathBuf,
        missing_flags: Vec<String>,
    },
    NotSignedIn {
        path: PathBuf,
    },
}

impl Capability {
    pub fn is_ready(&self) -> bool {
        matches!(self, Capability::Ready { .. })
    }
}

/// Runs a provider command and captures both streams.
/// VI: Chạy một lệnh của provider và thu cả hai luồng output.
fn capture(path: &std::path::Path, arguments: &[&str]) -> Result<(i32, String)> {
    let mut command = Command::new(path);
    command
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    flowie_platform::environment::apply(&mut command);
    flowie_platform::spawn_in_own_group(&mut command);

    let child = command.spawn().map_err(|error| Error::Spawn {
        program: path.display().to_string(),
        message: error.to_string(),
    })?;

    let output =
        crate::stream::wait_with_deadline(child, PROBE_TIMEOUT).map_err(|error| Error::Spawn {
            program: path.display().to_string(),
            message: error.to_string(),
        })?;

    let mut text = output.stdout;
    text.push_str(&output.stderr);
    Ok((output.status, text))
}

/// Checks one provider on this machine.
/// VI: Kiểm tra một provider trên máy này.
pub fn probe(provider: Provider, program: Option<&str>) -> Result<Capability> {
    let program = program.unwrap_or_else(|| provider.default_program());
    let Some(path) = flowie_platform::executable::resolve(program) else {
        return Ok(Capability::NotInstalled {
            program: program.to_string(),
        });
    };

    let (help_status, help_text) = capture(&path, provider.help_arguments())?;
    let missing: Vec<String> = provider
        .required_flags()
        .iter()
        .filter(|flag| !help_text.contains(**flag))
        .map(|flag| (*flag).to_string())
        .collect();
    if help_status != 0 || !missing.is_empty() {
        return Ok(Capability::TooOld {
            path,
            missing_flags: missing,
        });
    }

    let (login_status, login_text) = capture(&path, provider.login_arguments())?;
    if !signed_in(provider, login_status, &login_text) {
        return Ok(Capability::NotSignedIn { path });
    }

    let (_, version) = capture(&path, &["--version"])?;
    Ok(Capability::Ready {
        path,
        version: version
            .lines()
            .next()
            .unwrap_or_default()
            .trim()
            .to_string(),
    })
}

/// Claude reports a JSON document with `loggedIn`; Codex answers with its
/// exit code. Reading each the way it actually reports keeps a signed-out
/// machine from looking ready.
/// VI: Claude trả về một tài liệu JSON có `loggedIn`; Codex trả lời bằng exit
/// VI: code. Đọc mỗi bên theo đúng cách nó báo giúp một máy chưa đăng nhập
/// VI: không bị hiểu nhầm là sẵn sàng.
pub fn signed_in(provider: Provider, status: i32, text: &str) -> bool {
    match provider {
        Provider::Codex => status == 0,
        Provider::Claude => {
            if status != 0 {
                return false;
            }
            // A minimal scan rather than a JSON dependency: the field is a
            // boolean at the top level and the document is small.
            // VI: Quét tối giản thay vì phụ thuộc một thư viện JSON: trường
            // VI: này là boolean ở cấp cao nhất và tài liệu thì nhỏ.
            let compact: String = text.chars().filter(|c| !c.is_whitespace()).collect();
            compact.contains("\"loggedIn\":true")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_sign_in_is_read_from_the_json_field() {
        assert!(signed_in(
            Provider::Claude,
            0,
            r#"{ "loggedIn": true, "authMethod": "claude.ai" }"#
        ));
        assert!(!signed_in(Provider::Claude, 0, r#"{ "loggedIn": false }"#));
        // A zero exit with an unreadable body is not a signed-in machine.
        // VI: Exit bằng 0 với body không đọc được không phải là máy đã đăng nhập.
        assert!(!signed_in(Provider::Claude, 0, "not json"));
        assert!(!signed_in(Provider::Claude, 1, r#"{ "loggedIn": true }"#));
    }

    #[test]
    fn codex_sign_in_is_read_from_the_exit_code() {
        assert!(signed_in(Provider::Codex, 0, "Logged in using ChatGPT"));
        assert!(!signed_in(Provider::Codex, 1, "Not logged in"));
    }

    #[test]
    fn the_required_flags_are_the_ones_the_runner_depends_on() {
        // Pinned so a reviewer notices if the list is quietly shortened; a
        // missing --permission-mode would let an agent run unconstrained.
        // VI: Ghim lại để người review nhận ra nếu danh sách bị rút ngắn âm
        // VI: thầm; thiếu --permission-mode sẽ để agent chạy không bị giới hạn.
        assert_eq!(CLAUDE_REQUIRED_FLAGS.len(), 11);
        assert!(CLAUDE_REQUIRED_FLAGS.contains(&"--permission-mode"));
        assert!(CLAUDE_REQUIRED_FLAGS.contains(&"--restricted"));
        assert_eq!(CODEX_REQUIRED_FLAGS.len(), 5);
        assert!(CODEX_REQUIRED_FLAGS.contains(&"--sandbox"));
        assert!(CODEX_REQUIRED_FLAGS.contains(&"--ephemeral"));
    }

    #[test]
    fn a_missing_tool_is_reported_rather_than_failing() {
        let capability = probe(Provider::Claude, Some("flowie-no-such-agent-cli")).unwrap();
        assert!(matches!(capability, Capability::NotInstalled { .. }));
        assert!(!capability.is_ready());
    }

    #[test]
    fn codex_looks_for_its_flags_on_the_exec_subcommand() {
        assert_eq!(Provider::Codex.help_arguments(), &["exec", "--help"]);
        assert_eq!(Provider::Claude.help_arguments(), &["--help"]);
    }
}
