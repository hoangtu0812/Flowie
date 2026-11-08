//! Turning what the agent is doing into one line a person can read.
//!
//! An unattended run is otherwise opaque: the tray says "working" for twenty
//! minutes and nobody can tell apart an agent reading files from an agent
//! stuck. The line also rides on the heartbeat, so the same answer is visible
//! in Flowie without anyone walking over to the machine.
//! VI: Biến thứ agent đang làm thành một dòng người đọc được.
//! VI: Một lượt chạy không người canh thì mờ mịt: tray báo "đang làm" suốt hai
//! VI: mươi phút và không ai phân biệt được agent đang đọc file với agent đang
//! VI: kẹt. Dòng này cũng đi kèm heartbeat, nên cùng một câu trả lời hiện ra
//! VI: trong Flowie mà không ai phải đi tới tận máy.
//!
//! Paths are made relative to the worktree before they leave this machine. A
//! run record carrying `C:\Users\someone\code\...` tells everyone who reads
//! the task what that person's folders are called, which is nobody's business
//! and not something they agreed to publish.
//! VI: Đường dẫn được đổi thành tương đối so với worktree trước khi rời máy
//! VI: này. Một bản ghi run mang theo `C:\Users\ai-đó\code\...` sẽ nói cho mọi
//! VI: người đọc task biết thư mục của người đó tên là gì, điều không liên quan
//! VI: tới ai và cũng không phải thứ họ đồng ý công khai.

use std::path::Path;

use serde_json::Value;

/// The longest line the server stores for a run's progress. Matches
/// `flowie_mcp::contract::validate_progress`, so a line built here is never
/// refused there.
/// VI: Dòng dài nhất server lưu cho tiến độ của một run. Khớp với
/// VI: `flowie_mcp::contract::validate_progress`, nên dòng dựng ở đây không bao
/// VI: giờ bị bên đó từ chối.
pub const PROGRESS_LIMIT: usize = 300;

/// Collapses whitespace and cuts to the length the server stores.
///
/// Counted in characters, not bytes: a Vietnamese line would otherwise be cut
/// at roughly half the length the server actually allows, and cutting between
/// the bytes of one character produces text nobody can read.
/// VI: Gộp khoảng trắng và cắt theo độ dài server lưu.
/// VI: Đếm theo ký tự chứ không theo byte: nếu không, một dòng tiếng Việt sẽ bị
/// VI: cắt ở khoảng một nửa độ dài server thật sự cho phép, và cắt vào giữa các
/// VI: byte của một ký tự sẽ tạo ra chữ không ai đọc được.
pub fn one_line(text: &str) -> String {
    let flat: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= PROGRESS_LIMIT {
        return flat;
    }
    let kept: String = flat.chars().take(PROGRESS_LIMIT - 1).collect();
    format!("{kept}…")
}

/// What a tool call is doing, in words rather than a tool name.
/// VI: Một lệnh gọi tool đang làm gì, diễn đạt bằng lời chứ không phải tên tool.
fn verb(tool: &str) -> Option<&'static str> {
    match tool {
        "Read" => Some("Reading"),
        "Edit" => Some("Editing"),
        "Write" => Some("Writing"),
        _ => None,
    }
}

/// Turns one Claude stream-json event into a progress line, or nothing.
///
/// Only the agent's own turns say anything useful. Results, system events and
/// anything unrecognised return `None`, which leaves the line already on
/// display alone rather than blanking it between steps.
/// VI: Biến một sự kiện stream-json của Claude thành một dòng tiến độ, hoặc
/// VI: không gì cả.
/// VI: Chỉ lượt nói của chính agent mới mang thông tin đáng kể. Kết quả, sự kiện
/// VI: hệ thống và những gì không nhận ra đều trả về `None`, giữ nguyên dòng
/// VI: đang hiển thị thay vì làm nó trống giữa hai bước.
pub fn describe_claude_event(event: &Value, worktree: &Path) -> Option<String> {
    if event.get("type").and_then(Value::as_str) != Some("assistant") {
        return None;
    }
    let content = event.get("message")?.get("content")?.as_array()?;

    // The last usable item wins, because one turn can narrate and then act,
    // and what it did is more current than what it said it would do.
    // VI: Mục dùng được cuối cùng thắng, vì một lượt có thể vừa kể vừa làm, và
    // VI: thứ nó đã làm thì mới hơn thứ nó nói sẽ làm.
    let mut line = None;
    for item in content {
        match item.get("type").and_then(Value::as_str) {
            Some("text") => {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    if !text.trim().is_empty() {
                        line = Some(one_line(text));
                    }
                }
            }
            Some("tool_use") => {
                let name = item.get("name").and_then(Value::as_str)?;
                let arguments = item.get("input");
                line = Some(describe_tool(name, arguments, worktree));
            }
            _ => {}
        }
    }
    line
}

fn describe_tool(name: &str, arguments: Option<&Value>, worktree: &Path) -> String {
    let argument = |key: &str| {
        arguments
            .and_then(|value| value.get(key))
            .and_then(Value::as_str)
    };

    if let (Some(verb), Some(path)) = (verb(name), argument("file_path")) {
        return one_line(&format!("{verb} {}", relative(path, worktree)));
    }
    match name {
        "Grep" => one_line(&format!(
            "Searching for {}",
            argument("pattern").unwrap_or("")
        )),
        "Glob" => one_line(&format!(
            "Finding files {}",
            argument("pattern").unwrap_or("")
        )),
        other => one_line(&format!("Using {other}")),
    }
}

/// A path as it looks from inside the worktree.
///
/// Falls back to the file name alone when the path is somewhere else
/// entirely, because the alternative is sending an absolute path off the
/// machine, and a bare name still tells a reader which file without telling
/// them where the person keeps their work.
/// VI: Một đường dẫn nhìn từ bên trong worktree.
/// VI: Khi đường dẫn nằm hẳn ở chỗ khác thì chỉ lấy tên file, vì cách còn lại là
/// VI: gửi một đường dẫn tuyệt đối ra khỏi máy, và riêng cái tên vẫn cho người
/// VI: đọc biết là file nào mà không nói cho họ biết người ta để việc ở đâu.
fn relative(path: &str, worktree: &Path) -> String {
    let candidate = Path::new(path);
    if let Ok(rest) = candidate.strip_prefix(worktree) {
        return slashes(rest);
    }
    // The agent may report a path of the same shape that is not canonicalised,
    // so the resolved forms are compared too. Both can fail when the file has
    // already been removed, which is ordinary and falls through.
    // VI: Agent có thể báo một đường dẫn cùng hình dạng nhưng chưa chuẩn hoá,
    // VI: nên dạng đã phân giải cũng được so sánh. Cả hai có thể thất bại khi
    // VI: file đã bị xoá, điều bình thường và sẽ rơi xuống nhánh dưới.
    if let (Ok(resolved), Ok(root)) = (candidate.canonicalize(), worktree.canonicalize()) {
        if let Ok(rest) = resolved.strip_prefix(root) {
            return slashes(rest);
        }
    }
    candidate
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

/// One separator whichever machine wrote the path, so a line read on a Mac
/// does not look different from the same line read on Windows.
/// VI: Một loại dấu phân cách dù máy nào ghi ra đường dẫn, để một dòng đọc trên
/// VI: Mac không khác dòng đó đọc trên Windows.
fn slashes(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn worktree() -> &'static Path {
        Path::new(if cfg!(windows) {
            "C:\\code\\repo.flowie-worktrees\\crun1"
        } else {
            "/code/repo.flowie-worktrees/crun1"
        })
    }

    fn assistant(content: Value) -> Value {
        json!({ "type": "assistant", "message": { "content": content } })
    }

    #[test]
    fn a_file_a_person_can_place_is_named_relative_to_the_worktree() {
        // An absolute path tells everyone reading the task what the person's
        // folders are called, which is nobody's business.
        // VI: Một đường dẫn tuyệt đối nói cho mọi người đọc task biết thư mục
        // VI: của người đó tên là gì, điều không liên quan tới ai.
        let path = if cfg!(windows) {
            "C:\\code\\repo.flowie-worktrees\\crun1\\apps\\web\\page.tsx"
        } else {
            "/code/repo.flowie-worktrees/crun1/apps/web/page.tsx"
        };
        let event = assistant(json!([
            { "type": "tool_use", "name": "Edit", "input": { "file_path": path } }
        ]));
        assert_eq!(
            describe_claude_event(&event, worktree()),
            Some("Editing apps/web/page.tsx".into())
        );
    }

    #[test]
    fn a_path_outside_the_worktree_is_reduced_to_its_name() {
        let event = assistant(json!([
            { "type": "tool_use", "name": "Read", "input": { "file_path": "/etc/hosts" } }
        ]));
        let line = describe_claude_event(&event, worktree()).expect("a line");
        assert_eq!(line, "Reading hosts");
        assert!(!line.contains("/etc"), "the directory stays on the machine");
    }

    #[test]
    fn searching_and_finding_say_what_was_looked_for() {
        for (name, key, expected) in [
            ("Grep", "pattern", "Searching for claim_issue"),
            ("Glob", "pattern", "Finding files **/*.rs"),
        ] {
            let value = if name == "Grep" {
                "claim_issue"
            } else {
                "**/*.rs"
            };
            let event = assistant(json!([
                { "type": "tool_use", "name": name, "input": { key: value } }
            ]));
            assert_eq!(
                describe_claude_event(&event, worktree()),
                Some(expected.into())
            );
        }
    }

    #[test]
    fn an_unknown_tool_is_named_rather_than_hidden() {
        // A tool nobody anticipated is still worth showing: "Using Bash" tells
        // a person more than a line that stopped updating.
        // VI: Một tool không ai lường trước vẫn đáng hiển thị: "Using Bash" nói
        // VI: với người dùng nhiều hơn là một dòng ngừng cập nhật.
        let event = assistant(json!([
            { "type": "tool_use", "name": "Bash", "input": { "command": "ls" } }
        ]));
        assert_eq!(
            describe_claude_event(&event, worktree()),
            Some("Using Bash".into())
        );
    }

    #[test]
    fn the_agents_own_words_come_through() {
        let event = assistant(json!([
            { "type": "text", "text": "  Looking at   how claiming works.  " }
        ]));
        assert_eq!(
            describe_claude_event(&event, worktree()),
            Some("Looking at how claiming works.".into())
        );
    }

    #[test]
    fn what_it_did_wins_over_what_it_said_it_would_do() {
        // One turn can narrate and then act. The action is the more current
        // answer to "what is happening right now".
        // VI: Một lượt có thể vừa kể vừa làm. Hành động mới là câu trả lời cập
        // VI: nhật hơn cho câu hỏi "đang diễn ra chuyện gì".
        let event = assistant(json!([
            { "type": "text", "text": "I will read the file." },
            { "type": "tool_use", "name": "Read", "input": { "file_path": "notes.md" } }
        ]));
        assert_eq!(
            describe_claude_event(&event, worktree()),
            Some("Reading notes.md".into())
        );
    }

    #[test]
    fn events_that_say_nothing_leave_the_line_alone() {
        // Returning a blank line between steps would make the tray flicker
        // between a task name and nothing.
        // VI: Trả về một dòng trống giữa các bước sẽ khiến tray nhấp nháy giữa
        // VI: tên task và khoảng không.
        for event in [
            json!({ "type": "result", "subtype": "success" }),
            json!({ "type": "system", "subtype": "init" }),
            assistant(json!([{ "type": "text", "text": "   " }])),
            json!({ "type": "assistant" }),
            json!("not an object at all"),
        ] {
            assert_eq!(describe_claude_event(&event, worktree()), None, "{event}");
        }
    }

    #[test]
    fn a_long_line_is_cut_to_what_the_server_stores() {
        let long = "x".repeat(500);
        let cut = one_line(&long);
        assert_eq!(cut.chars().count(), PROGRESS_LIMIT);
        assert!(cut.ends_with('…'));
    }

    #[test]
    fn cutting_counts_characters_not_bytes() {
        // A Vietnamese line would otherwise be cut at roughly half the length
        // the server allows, and cutting inside a character produces text
        // nobody can read.
        // VI: Nếu không, một dòng tiếng Việt sẽ bị cắt ở khoảng một nửa độ dài
        // VI: server cho phép, và cắt vào giữa một ký tự sẽ tạo ra chữ không ai
        // VI: đọc được.
        let vietnamese = "Đang đọc tài liệu của tính năng. ".repeat(20);
        let cut = one_line(&vietnamese);
        assert_eq!(cut.chars().count(), PROGRESS_LIMIT);
        assert!(cut.len() > PROGRESS_LIMIT, "it really was multi-byte");
        // The result is still valid text, which a byte-wise cut would not be.
        // VI: Kết quả vẫn là chữ hợp lệ, điều mà cắt theo byte sẽ không bảo đảm.
        assert!(cut.chars().all(|c| c != '\u{fffd}'));
    }

    #[test]
    fn a_short_line_is_left_as_it_is() {
        assert_eq!(one_line("Reading notes.md"), "Reading notes.md");
        assert_eq!(one_line("a\n\tb   c"), "a b c");
    }
}
