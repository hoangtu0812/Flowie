//! Running an agent for one phase of a run.
//!
//! Both providers are invoked the same way the Python runner invokes them,
//! flag for flag. That is not deference to the old code: each of those flags
//! removes a capability the agent would otherwise have, and a Rust runner
//! that quietly dropped one would hand the agent more power than the Python
//! one while looking equivalent.
//! VI: Chạy agent cho một giai đoạn của run.
//! VI: Cả hai provider được gọi đúng như runner Python gọi chúng, từng flag
//! VI: một. Đó không phải sự nể nang mã cũ: mỗi flag đó gỡ đi một khả năng mà
//! VI: agent vốn sẽ có, và một runner Rust âm thầm bỏ sót một flag sẽ trao cho
//! VI: agent nhiều quyền hơn bản Python trong khi trông có vẻ tương đương.
//!
//! The prompt always travels on stdin. It carries task text from the server,
//! and a command line is the one place where quoting rules differ by
//! platform and a crafted title could change what runs.
//! VI: Prompt luôn đi qua stdin. Nó mang nội dung task từ server, và dòng lệnh
//! VI: chính là nơi quy tắc trích dẫn khác nhau theo nền tảng và một tiêu đề
//! VI: được dàn dựng có thể đổi thứ được chạy.

use std::path::Path;

use serde_json::Value;

use crate::error::{Error, Result};

/// Which part of a run the agent is being asked to do.
///
/// The phases differ in exactly one way that matters: review may not write.
/// It produces the plan and the target date that are recorded before any
/// edit, so if it could edit, the plan would describe work already done.
/// VI: Agent đang được yêu cầu làm phần nào của một run.
/// VI: Hai giai đoạn khác nhau đúng ở một điểm quan trọng: review không được
/// VI: ghi. Nó sinh ra kế hoạch và ngày kết thúc vốn được ghi nhận trước mọi
/// VI: lần sửa, nên nếu nó sửa được thì kế hoạch sẽ mô tả việc đã làm xong.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Review,
    Implement,
}

impl Phase {
    /// Claude's file tools for this phase. The parent runner owns shell,
    /// test, git and network effects, so none of those appear here for
    /// either phase.
    /// VI: Các công cụ file của Claude cho giai đoạn này. Runner cha sở hữu
    /// VI: shell, test, git và tác động mạng, nên không giai đoạn nào có chúng.
    pub fn claude_tools(self) -> &'static str {
        match self {
            Phase::Review => "Read,Glob,Grep",
            Phase::Implement => "Read,Edit,Write,Glob,Grep",
        }
    }

    pub fn claude_permission_mode(self) -> &'static str {
        match self {
            Phase::Review => "default",
            Phase::Implement => "acceptEdits",
        }
    }

    pub fn codex_sandbox(self) -> &'static str {
        match self {
            Phase::Review => "read-only",
            Phase::Implement => "workspace-write",
        }
    }
}

/// Builds Claude's argument vector.
///
/// `--restricted` ignores user and project settings and confines the file
/// tools to the checkout; `--permission-prompts none` denies anything
/// `acceptEdits` would otherwise stop to ask about, so an unattended run
/// cannot hang on a prompt nobody will answer.
/// VI: Dựng mảng argument cho Claude.
/// VI: `--restricted` bỏ qua thiết lập của người dùng và của project, đồng thời
/// VI: giới hạn công cụ file trong checkout; `--permission-prompts none` từ
/// VI: chối mọi thứ mà `acceptEdits` vốn sẽ dừng lại để hỏi, nên một lượt chạy
/// VI: không người trông không thể treo ở một câu hỏi không ai trả lời.
pub fn claude_arguments(
    phase: Phase,
    schema: &Value,
    session: &str,
    issue_identifier: &str,
) -> Vec<String> {
    let name = format!("Flowie {}", truncate(issue_identifier, 50));
    vec![
        "--print".into(),
        "--output-format".into(),
        "stream-json".into(),
        "--verbose".into(),
        "--json-schema".into(),
        schema.to_string(),
        "--permission-mode".into(),
        phase.claude_permission_mode().into(),
        "--permission-prompts".into(),
        "none".into(),
        "--tools".into(),
        phase.claude_tools().into(),
        "--restricted".into(),
        "--strict-mcp-config".into(),
        "--session-id".into(),
        session.into(),
        "--name".into(),
        name,
    ]
}

/// Builds Codex's argument vector.
///
/// `--ephemeral` keeps the turn out of the user's session history and
/// `--ignore-user-config` stops a developer's own settings from changing how
/// an unattended run behaves. The trailing `-` is what makes Codex read the
/// prompt from stdin.
/// VI: Dựng mảng argument cho Codex.
/// VI: `--ephemeral` giữ lượt này khỏi lịch sử phiên của người dùng và
/// VI: `--ignore-user-config` ngăn thiết lập riêng của lập trình viên làm đổi
/// VI: cách một lượt chạy không người trông hành xử. Dấu `-` ở cuối là thứ
/// VI: khiến Codex đọc prompt từ stdin.
pub fn codex_arguments(
    phase: Phase,
    schema_path: &Path,
    output_path: &Path,
    worktree: &Path,
) -> Vec<String> {
    vec![
        "exec".into(),
        "--sandbox".into(),
        phase.codex_sandbox().into(),
        "--ignore-user-config".into(),
        "--ephemeral".into(),
        "--output-schema".into(),
        schema_path.to_string_lossy().into_owned(),
        "--output-last-message".into(),
        output_path.to_string_lossy().into_owned(),
        "--cd".into(),
        worktree.to_string_lossy().into_owned(),
        "-".into(),
    ]
}

/// The largest result Codex may hand back. A result is a short structured
/// summary; anything larger means the agent is returning content rather than
/// a conclusion, and it would end up in a run record.
/// VI: Kết quả lớn nhất Codex được phép trả về. Kết quả là một bản tóm tắt có
/// VI: cấu trúc và ngắn; lớn hơn nghĩa là agent đang trả về nội dung thay vì
/// VI: một kết luận, và nó sẽ chui vào bản ghi của run.
pub const CODEX_RESULT_MAX: u64 = 20_000;

/// Pulls the final result out of Claude's stream-json output.
///
/// Every line is an event; only the last `result` event carries the answer,
/// and the rest are progress. A run that produced no result event, or one
/// that reports an error, did not finish — treating a missing result as an
/// empty success would report work that never happened.
/// VI: Lấy kết quả cuối từ output stream-json của Claude.
/// VI: Mỗi dòng là một sự kiện; chỉ sự kiện `result` cuối cùng mang câu trả
/// VI: lời, phần còn lại là tiến độ. Một lượt chạy không sinh ra sự kiện result
/// VI: nào, hoặc sinh ra một sự kiện báo lỗi, là chưa hoàn thành — coi việc
/// VI: thiếu result là thành công rỗng sẽ báo cáo một công việc chưa từng xảy ra.
pub fn extract_claude_result<'a>(lines: impl IntoIterator<Item = &'a str>) -> Result<Value> {
    let mut final_event: Option<Value> = None;
    for line in lines {
        let Ok(event) = serde_json::from_str::<Value>(line) else {
            // Not every line is JSON; a non-JSON line is noise, not failure.
            // VI: Không phải dòng nào cũng là JSON; dòng không phải JSON là
            // VI: nhiễu chứ không phải thất bại.
            continue;
        };
        if event.get("type").and_then(Value::as_str) == Some("result") {
            final_event = Some(event);
        }
    }

    let event = final_event.ok_or_else(|| Error::Output {
        program: "claude".into(),
        message: "the run produced no result event".into(),
    })?;
    if event.get("is_error").and_then(Value::as_bool) == Some(true)
        || event.get("subtype").and_then(Value::as_str) != Some("success")
    {
        return Err(Error::Output {
            program: "claude".into(),
            message: "the agent did not finish the task".into(),
        });
    }
    event
        .get("structured_output")
        .cloned()
        .ok_or_else(|| Error::Output {
            program: "claude".into(),
            message: "the result carried no structured output".into(),
        })
}

/// Checks a Codex result file before reading it, so an agent that wrote
/// something enormous cannot pull it into memory.
/// VI: Kiểm file kết quả của Codex trước khi đọc, để một agent ghi ra thứ
/// VI: khổng lồ không thể kéo nó vào bộ nhớ.
pub fn read_codex_result(path: &Path) -> Result<Value> {
    let metadata = std::fs::metadata(path).map_err(|_| Error::Output {
        program: "codex".into(),
        message: "the run produced no result file".into(),
    })?;
    if metadata.len() > CODEX_RESULT_MAX {
        return Err(Error::Output {
            program: "codex".into(),
            message: format!(
                "the result was {} bytes, over the {CODEX_RESULT_MAX} byte limit",
                metadata.len()
            ),
        });
    }
    let text = std::fs::read_to_string(path).map_err(|error| Error::Output {
        program: "codex".into(),
        message: error.to_string(),
    })?;
    serde_json::from_str(&text).map_err(|error| Error::Output {
        program: "codex".into(),
        message: format!("the result was not JSON: {error}"),
    })
}

/// Cuts on a character boundary so a Vietnamese identifier does not become
/// invalid text.
/// VI: Cắt theo ranh giới ký tự để một định danh tiếng Việt không biến thành
/// VI: văn bản không hợp lệ.
fn truncate(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn schema() -> Value {
        json!({ "type": "object", "properties": { "plan": { "type": "string" } } })
    }

    #[test]
    fn review_cannot_write_and_implementing_can() {
        assert_eq!(Phase::Review.claude_tools(), "Read,Glob,Grep");
        assert!(!Phase::Review.claude_tools().contains("Write"));
        assert!(!Phase::Review.claude_tools().contains("Edit"));
        assert!(Phase::Implement.claude_tools().contains("Edit"));
        assert_eq!(Phase::Review.codex_sandbox(), "read-only");
        assert_eq!(Phase::Implement.codex_sandbox(), "workspace-write");
    }

    #[test]
    fn neither_phase_gives_the_agent_shell_or_network() {
        // The parent runner owns those effects. A tool list that grew one
        // would let the agent run tests or push without the runner knowing.
        // VI: Runner cha sở hữu các tác động đó. Danh sách tool mà mọc thêm
        // VI: một mục sẽ cho agent chạy test hay push mà runner không biết.
        for phase in [Phase::Review, Phase::Implement] {
            let tools = phase.claude_tools();
            for forbidden in ["Bash", "Shell", "WebFetch", "WebSearch", "Task"] {
                assert!(
                    !tools.contains(forbidden),
                    "{phase:?} must not get {forbidden}"
                );
            }
        }
    }

    #[test]
    fn the_claude_arguments_keep_every_flag_that_removes_a_capability() {
        let arguments = claude_arguments(Phase::Implement, &schema(), "sess-1", "DTD-1");
        for flag in [
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
        ] {
            assert!(
                arguments.iter().any(|argument| argument == flag),
                "{flag} is missing; dropping it gives the agent more power than the Python runner"
            );
        }
        // Denying prompts is what keeps an unattended run from hanging on a
        // question nobody will answer.
        // VI: Từ chối mọi câu hỏi là thứ giữ cho một lượt chạy không người
        // VI: trông khỏi treo ở câu hỏi không ai trả lời.
        let prompts = arguments
            .iter()
            .position(|argument| argument == "--permission-prompts")
            .unwrap();
        assert_eq!(arguments[prompts + 1], "none");
    }

    #[test]
    fn the_codex_arguments_keep_the_sandbox_and_ignore_local_settings() {
        let arguments = codex_arguments(
            Phase::Review,
            Path::new("/tmp/schema.json"),
            Path::new("/tmp/result.json"),
            Path::new("/tmp/worktree"),
        );
        for flag in [
            "--sandbox",
            "--ignore-user-config",
            "--ephemeral",
            "--output-schema",
            "--output-last-message",
            "--cd",
        ] {
            assert!(
                arguments.iter().any(|argument| argument == flag),
                "{flag} is missing"
            );
        }
        // The trailing dash is what makes Codex read the prompt from stdin
        // rather than expecting it on the command line.
        // VI: Dấu gạch ngang cuối là thứ khiến Codex đọc prompt từ stdin thay
        // VI: vì chờ nó trên dòng lệnh.
        assert_eq!(arguments.last().unwrap(), "-");
    }

    #[test]
    fn the_prompt_is_never_an_argument() {
        // Task text comes from the server. On a command line, quoting rules
        // differ by platform and a crafted title could change what runs.
        // VI: Nội dung task đến từ server. Trên dòng lệnh, quy tắc trích dẫn
        // VI: khác nhau theo nền tảng và một tiêu đề dàn dựng có thể đổi thứ
        // VI: được chạy.
        let hostile = "DTD-1\"; rm -rf / #";
        let arguments = claude_arguments(Phase::Review, &schema(), "sess", hostile);
        assert!(!arguments
            .iter()
            .any(|argument| argument.contains("rm -rf /") && !argument.starts_with("Flowie ")));
        // It may appear only inside the --name value, which is one argument.
        // VI: Nó chỉ được phép xuất hiện bên trong giá trị --name, vốn là một
        // VI: argument duy nhất.
        let name = arguments.last().unwrap();
        assert!(name.starts_with("Flowie "));
    }

    #[test]
    fn a_long_identifier_is_cut_on_a_character_boundary() {
        let vietnamese = "ộ".repeat(200);
        let arguments = claude_arguments(Phase::Review, &schema(), "sess", &vietnamese);
        let name = arguments.last().unwrap();
        assert_eq!(name.chars().count(), "Flowie ".len() + 50);
    }

    #[test]
    fn the_last_result_event_is_the_answer() {
        let lines = [
            r#"{"type":"assistant","text":"working"}"#,
            r#"{"type":"result","subtype":"success","structured_output":{"plan":"first"}}"#,
            r#"{"type":"result","subtype":"success","structured_output":{"plan":"second"}}"#,
        ];
        let value = extract_claude_result(lines).unwrap();
        assert_eq!(value["plan"], "second");
    }

    #[test]
    fn noise_between_events_is_ignored() {
        let lines = [
            "not json at all",
            "",
            r#"{"type":"result","subtype":"success","structured_output":{"plan":"ok"}}"#,
        ];
        assert_eq!(extract_claude_result(lines).unwrap()["plan"], "ok");
    }

    #[test]
    fn no_result_event_is_a_failure_not_an_empty_success() {
        // Reporting an empty success here would claim work that never
        // happened.
        // VI: Báo thành công rỗng ở đây là khẳng định một công việc chưa từng
        // VI: xảy ra.
        let lines = [r#"{"type":"assistant","text":"thinking"}"#];
        assert!(matches!(
            extract_claude_result(lines),
            Err(Error::Output { .. })
        ));
    }

    #[test]
    fn an_errored_or_unfinished_result_is_refused() {
        let errored = [r#"{"type":"result","subtype":"success","is_error":true}"#];
        assert!(matches!(
            extract_claude_result(errored),
            Err(Error::Output { .. })
        ));

        let unfinished = [r#"{"type":"result","subtype":"error_max_turns"}"#];
        assert!(matches!(
            extract_claude_result(unfinished),
            Err(Error::Output { .. })
        ));
    }

    #[test]
    fn a_result_without_structured_output_is_refused() {
        let lines = [r#"{"type":"result","subtype":"success"}"#];
        assert!(matches!(
            extract_claude_result(lines),
            Err(Error::Output { .. })
        ));
    }

    #[test]
    fn a_missing_codex_result_file_is_reported() {
        let directory = tempfile::tempdir().unwrap();
        let missing = directory.path().join("result.json");
        assert!(matches!(
            read_codex_result(&missing),
            Err(Error::Output { .. })
        ));
    }

    #[test]
    fn an_oversized_codex_result_is_refused_before_being_read() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("result.json");
        std::fs::write(&path, "x".repeat(CODEX_RESULT_MAX as usize + 1)).unwrap();
        match read_codex_result(&path) {
            Err(Error::Output { message, .. }) => assert!(message.contains("limit")),
            other => panic!("expected a size complaint, got {other:?}"),
        }
    }

    #[test]
    fn a_bounded_codex_result_is_parsed() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("result.json");
        std::fs::write(&path, r#"{"summary":"đã xong"}"#).unwrap();
        assert_eq!(read_codex_result(&path).unwrap()["summary"], "đã xong");
    }
}
