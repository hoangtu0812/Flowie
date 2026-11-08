//! Running an agent for one run, as the orchestrator's `Agent` port.
//!
//! This is where the pieces of this crate are finally put together: the
//! provider probe, the argument vectors, the prompts, the process handling and
//! the checks on what comes back. Nothing new is decided here — the point is
//! that there is exactly one place that knows how a run talks to an agent, so
//! the two providers cannot drift apart in how strictly they are held.
//! VI: Chạy một agent cho một run, dưới dạng cổng `Agent` của orchestrator.
//! VI: Đây là nơi các mảnh của crate này cuối cùng được ghép lại: probe
//! VI: provider, mảng argument, prompt, phần xử lý tiến trình và các bước kiểm
//! VI: thứ nhận về. Không có quyết định mới nào ở đây — điểm chính là chỉ có
//! VI: đúng một nơi biết một run nói chuyện với agent thế nào, để hai provider
//! VI: không lệch nhau về mức độ bị ràng buộc.
//!
//! The agent is given a worktree and nothing else. It runs with the
//! environment reduced to an allowlist, in its own process group so a timeout
//! can end the whole tree rather than only the process that was started, and
//! with the prompt on standard input so a crafted task title can never become
//! part of a command line.
//! VI: Agent chỉ được giao một worktree và không gì khác. Nó chạy với môi
//! VI: trường thu lại còn một danh sách cho phép, trong nhóm tiến trình riêng
//! VI: để timeout kết thúc được cả cây chứ không chỉ tiến trình được khởi động,
//! VI: và prompt đi qua standard input để một tiêu đề task dàn dựng không bao
//! VI: giờ trở thành một phần của dòng lệnh.

use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

use flowie_core::run::{Agent, Review, RunFailure};
use serde_json::{json, Value};
use time::Date;

use crate::error::{Error, Result};
use crate::invoke::{self, Phase};
use crate::prompt;
use crate::provider::{self, Provider};
use crate::stream;

/// How long one agent turn may take before its process tree is ended.
///
/// Fifteen minutes matches the approved-test default. A turn that has not
/// finished by then is stuck rather than slow: the agent has no one to ask, so
/// it is not waiting on an answer that might arrive.
/// VI: Một lượt agent được chạy bao lâu trước khi cả cây tiến trình bị kết
/// VI: thúc.
/// VI: Mười lăm phút khớp với mặc định của bài test được duyệt. Một lượt chưa
/// VI: xong sau chừng đó là đang kẹt chứ không phải chậm: agent không có ai để
/// VI: hỏi, nên nó không chờ một câu trả lời có thể tới.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(900);

/// Everything one run needs to drive an agent.
/// VI: Mọi thứ một run cần để điều khiển một agent.
pub struct Driver {
    pub provider: Provider,
    /// The command to run, when the machine has it somewhere other than the
    /// provider's usual name.
    /// VI: Lệnh cần chạy, khi máy đặt nó ở chỗ khác tên thông thường của
    /// VI: provider.
    pub program: Option<String>,
    /// The task as the server described it, handed to the agent unchanged.
    /// VI: Task đúng như server mô tả, đưa cho agent nguyên vẹn.
    pub context: Value,
    pub issue: String,
    pub timeout: Duration,
    /// The day the estimate counts from, passed in rather than read from a
    /// clock so a run is reproducible.
    /// VI: Ngày mà phần ước lượng đếm từ đó, được truyền vào chứ không đọc từ
    /// VI: đồng hồ, để một run tái lập được.
    pub today: Date,
}

impl Driver {
    /// The program this driver will run.
    /// VI: Chương trình mà driver này sẽ chạy.
    fn program(&self) -> &str {
        self.program
            .as_deref()
            .unwrap_or_else(|| self.provider.default_program())
    }

    /// Runs one turn and returns the structured answer.
    /// VI: Chạy một lượt và trả về câu trả lời có cấu trúc.
    fn turn(
        &self,
        worktree: &Path,
        phase: Phase,
        prompt_text: &str,
        schema: &Value,
    ) -> Result<Value> {
        let program = self.program();
        let path = flowie_platform::executable::resolve(program).ok_or_else(|| Error::Spawn {
            program: program.to_string(),
            message: "it is not on this machine".into(),
        })?;

        match self.provider {
            Provider::Claude => {
                // A fresh session id per turn. Reusing one would let a later
                // turn inherit the earlier turn's history, and the read-only
                // review must not carry over into the pass that writes.
                // VI: Mỗi lượt một session id mới. Dùng lại sẽ khiến lượt sau
                // VI: thừa hưởng lịch sử của lượt trước, và lượt review chỉ đọc
                // VI: không được mang sang lượt có quyền ghi.
                let session = uuid::Uuid::new_v4().to_string();
                let arguments = invoke::claude_arguments(phase, schema, &session, &self.issue);
                let finished = self.execute(worktree, &path, &arguments, prompt_text)?;
                invoke::extract_claude_result(finished.stdout.lines())
            }
            Provider::Codex => {
                // Codex takes its schema from a file and writes its answer to
                // another, so both live in a directory that is removed when
                // this turn ends, whatever the outcome.
                // VI: Codex lấy schema từ một file và ghi câu trả lời ra một
                // VI: file khác, nên cả hai nằm trong một thư mục sẽ bị xoá khi
                // VI: lượt này kết thúc, dù kết cục ra sao.
                let directory = tempfile::Builder::new()
                    .prefix("flowie-codex-")
                    .tempdir()
                    .map_err(|error| Error::Spawn {
                        program: program.to_string(),
                        message: format!("no place for its result: {error}"),
                    })?;
                let schema_path = directory.path().join("schema.json");
                let result_path = directory.path().join("result.json");
                std::fs::write(&schema_path, schema.to_string()).map_err(|error| Error::Spawn {
                    program: program.to_string(),
                    message: format!("its schema could not be written: {error}"),
                })?;

                let arguments =
                    invoke::codex_arguments(phase, &schema_path, &result_path, worktree);
                self.execute(worktree, &path, &arguments, prompt_text)?;
                invoke::read_codex_result(&result_path)
            }
        }
    }

    /// Starts the agent, feeds it the prompt and waits for it.
    /// VI: Khởi động agent, đưa prompt vào và chờ nó.
    fn execute(
        &self,
        worktree: &Path,
        path: &Path,
        arguments: &[String],
        prompt_text: &str,
    ) -> Result<stream::Finished> {
        let program = self.program().to_string();
        let mut command = Command::new(path);
        command
            .args(arguments)
            .current_dir(worktree)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // Both of these are guarantees rather than conveniences: the allowlist
        // is what keeps the parent's secrets out of the agent's environment,
        // and the process group is what makes the deadline reach an agent that
        // started something else.
        // VI: Cả hai điều này là bảo đảm chứ không phải tiện nghi: danh sách cho
        // VI: phép giữ cho bí mật của tiến trình cha không lọt vào môi trường
        // VI: của agent, còn nhóm tiến trình là thứ giúp hạn chót với tới một
        // VI: agent đã khởi động thứ khác.
        flowie_platform::environment::apply(&mut command);
        flowie_platform::process::spawn_in_own_group(&mut command);

        let mut child = command.spawn().map_err(|error| Error::Spawn {
            program: program.clone(),
            message: error.to_string(),
        })?;
        stream::write_prompt(&mut child, prompt_text)?;
        let finished = stream::wait_with_deadline(child, self.timeout)?;

        if finished.status != 0 {
            // The worktree is deliberately left as it is. Whatever the agent
            // managed to do is the most useful thing a person has when asking
            // why it stopped.
            // VI: Worktree cố ý được giữ nguyên. Những gì agent kịp làm là thứ
            // VI: hữu ích nhất một người có được khi đi tìm lý do nó dừng.
            return Err(Error::Output {
                program,
                message: format!(
                    "it exited with {}; the work was left for inspection",
                    finished.status
                ),
            });
        }
        Ok(finished)
    }
}

impl Agent for Driver {
    fn probe(&mut self) -> std::result::Result<(), RunFailure> {
        let capability =
            provider::probe(self.provider, self.program.as_deref()).map_err(precondition)?;
        // Everything a probe can report needs a person: a tool to install, a
        // tool to update, or an account to sign into. None of them is
        // something a run can wait out, and the errand is named rather than
        // described as "the agent is unavailable", which would leave someone
        // guessing which of the three to try.
        // VI: Mọi thứ probe báo về đều cần tới một người: cài công cụ, cập nhật
        // VI: công cụ, hay đăng nhập một tài khoản. Không điều nào là thứ một
        // VI: run chờ qua được, và việc cần làm được nêu tên chứ không mô tả
        // VI: chung chung là "không dùng được agent", thứ sẽ để ai đó phải đoán
        // VI: nên thử cách nào trong ba cách.
        match capability.needs() {
            None => Ok(()),
            Some(errand) => Err(RunFailure::Precondition(errand)),
        }
    }

    fn review(&mut self, worktree: &Path) -> std::result::Result<Review, RunFailure> {
        let text = prompt::review_prompt(&self.context, self.today);
        let answer = self
            .turn(worktree, Phase::Review, &text, &prompt::review_schema())
            .map_err(reportable)?;
        prompt::checked_review(&answer, self.provider, self.today).map_err(reportable)
    }

    fn implement(
        &mut self,
        worktree: &Path,
        plan: &str,
    ) -> std::result::Result<String, RunFailure> {
        // The plan travels inside the context rather than as a separate
        // instruction, so the agent reads it as part of the task it was given
        // instead of as something appended afterwards.
        // VI: Kế hoạch đi bên trong context chứ không phải một chỉ thị riêng,
        // VI: để agent đọc nó như một phần của task được giao thay vì như một
        // VI: thứ nối thêm vào sau.
        let mut context = self.context.clone();
        if let Some(fields) = context.as_object_mut() {
            fields.insert("plan".into(), json!(plan));
        }
        let text = prompt::task_prompt(&context);
        let answer = self
            .turn(worktree, Phase::Implement, &text, &prompt::summary_schema())
            .map_err(reportable)?;
        prompt::checked_summary(&answer, self.provider).map_err(reportable)
    }
}

/// A failure of the machine rather than of the run.
/// VI: Một thất bại của máy chứ không phải của run.
fn precondition(error: Error) -> RunFailure {
    RunFailure::Precondition(error.to_string())
}

/// A failure worth telling the server about. The run was claimed by the time
/// these can happen, so silence would leave a person watching a task that
/// never resolves.
/// VI: Một thất bại đáng báo cho server. Tới lúc những lỗi này xảy ra thì run
/// VI: đã được claim, nên im lặng sẽ để một người ngồi nhìn một task không bao
/// VI: giờ kết thúc.
fn reportable(error: Error) -> RunFailure {
    RunFailure::Reportable(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::Month;

    fn driver(provider: Provider, program: &str) -> Driver {
        Driver {
            provider,
            program: Some(program.to_string()),
            context: json!({ "issue": { "identifier": "DTD-1" } }),
            issue: "DTD-1".into(),
            timeout: Duration::from_secs(5),
            today: Date::from_calendar_date(2026, Month::November, 8).expect("a real date"),
        }
    }

    #[test]
    fn a_tool_that_is_not_on_the_machine_is_a_precondition() {
        // Nothing has been claimed when the probe runs, and no amount of
        // retrying installs a missing tool.
        // VI: Chưa claim gì khi probe chạy, và thử lại bao nhiêu lần cũng không
        // VI: tự cài được một công cụ còn thiếu.
        let mut subject = driver(Provider::Claude, "flowie-no-such-agent-binary");
        let error = subject.probe().expect_err("the tool is absent");
        assert!(matches!(error, RunFailure::Precondition(_)), "{error:?}");
    }

    #[test]
    fn a_turn_against_a_missing_tool_is_reported_rather_than_silent() {
        // By review time the issue is claimed, so this has to be something the
        // server is told about rather than a quiet stop.
        // VI: Tới lúc review thì issue đã bị claim, nên đây phải là thứ được báo
        // VI: cho server chứ không phải một lần dừng lặng lẽ.
        let mut subject = driver(Provider::Codex, "flowie-no-such-agent-binary");
        let error = subject
            .review(&std::env::temp_dir())
            .expect_err("the tool is absent");
        match error {
            RunFailure::Reportable(detail) => {
                assert!(detail.contains("flowie-no-such-agent-binary"), "{detail}")
            }
            other => panic!("expected something reportable, got {other:?}"),
        }
    }

    #[test]
    fn the_plan_travels_inside_the_context_given_to_the_agent() {
        let subject = driver(Provider::Claude, "whatever");
        let mut context = subject.context.clone();
        context
            .as_object_mut()
            .expect("an object")
            .insert("plan".into(), json!("do the thing"));
        let text = prompt::task_prompt(&context);
        assert!(text.contains("do the thing"), "the plan is in the prompt");
        assert!(text.contains("DTD-1"), "and so is the task");
    }

    #[test]
    fn the_program_falls_back_to_the_providers_usual_name() {
        let mut subject = driver(Provider::Claude, "custom-claude");
        assert_eq!(subject.program(), "custom-claude");
        subject.program = None;
        assert_eq!(subject.program(), Provider::Claude.default_program());
    }
}
