//! Running the test commands a person approved for a repository.
//!
//! Only commands from the server's repository configuration run here, as
//! argument vectors. The exit code decides the verdict, a hard timeout stops
//! a command that hangs, and only the tail of the output is kept so a chatty
//! suite cannot push megabytes into a run record.
//! VI: Chạy các lệnh test mà một người đã duyệt cho repository.
//! VI: Chỉ các lệnh trong cấu hình repository của server được chạy ở đây, dưới
//! VI: dạng mảng argument. Exit code quyết định kết luận, một timeout cứng
//! VI: dừng lệnh bị treo, và chỉ phần đuôi output được giữ để một bộ test ồn
//! VI: ào không đẩy hàng megabyte vào bản ghi của run.

use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::error::{Error, Result};

/// Matches the exit code GNU timeout uses, which is what the Python runner
/// already reports for the same condition.
/// VI: Khớp exit code mà GNU timeout dùng, cũng là mã runner Python đang báo
/// VI: cho cùng tình huống.
pub const TIMEOUT_EXIT_CODE: i32 = 124;

/// Bounds what a chatty test can push into a run record; failures normally
/// explain themselves at the end of their output.
/// VI: Giới hạn thứ một test ồn ào có thể đẩy vào bản ghi run; lỗi thường tự
/// VI: giải thích ở cuối output của nó.
pub const LOG_TAIL: usize = 2_000;

pub const DEFAULT_TIMEOUT_SECONDS: u64 = 900;

/// One executed check, in the shape the server's result contract expects.
/// VI: Một lần kiểm tra đã chạy, theo đúng hình dạng hợp đồng kết quả của server.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Executed {
    pub name: String,
    pub command: Vec<String>,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub log: String,
}

impl Executed {
    pub fn passed(&self) -> bool {
        self.exit_code == 0
    }
}

/// Keeps the end of the output, which is where a failing command explains
/// itself. Cutting on a character boundary keeps Vietnamese output readable
/// instead of ending in a broken byte sequence.
/// VI: Giữ phần cuối output, nơi một lệnh thất bại tự giải thích. Cắt theo
/// VI: ranh giới ký tự giúp output tiếng Việt vẫn đọc được thay vì kết thúc
/// VI: bằng một chuỗi byte hỏng.
pub fn log_tail(output: &str) -> String {
    let characters = output.chars().count();
    if characters <= LOG_TAIL {
        return output.to_string();
    }
    output.chars().skip(characters - LOG_TAIL).collect()
}

/// Validates the approved command list the way the runner configuration does.
/// VI: Kiểm tra danh sách lệnh đã duyệt giống như cấu hình của runner.
pub fn validate_commands(commands: &[Vec<String>]) -> Result<()> {
    if commands.is_empty() || commands.len() > 20 {
        return Err(Error::Configuration(
            "approve 1 to 20 local test commands".into(),
        ));
    }
    for command in commands {
        if command.is_empty() || command.len() > 50 {
            return Err(Error::Configuration(
                "each test command must be 1 to 50 arguments".into(),
            ));
        }
        if command
            .iter()
            .any(|argument| argument.is_empty() || argument.len() > 2_000)
        {
            return Err(Error::Configuration(
                "test command arguments must be bounded non-empty strings".into(),
            ));
        }
    }
    Ok(())
}

pub fn validate_timeout(seconds: u64) -> Result<()> {
    if !(1..=3_600).contains(&seconds) {
        return Err(Error::Configuration(
            "the command timeout must be between 1 and 3600 seconds".into(),
        ));
    }
    Ok(())
}

/// Runs one approved command to completion or to its deadline.
///
/// The child is polled rather than waited on, so the deadline is enforced by
/// this process: a test that hangs would otherwise hold the run until the
/// server's lease expired, which looks to everyone like a crashed companion.
/// VI: Chạy một lệnh đã duyệt tới khi xong hoặc tới hạn.
/// VI: Tiến trình con được kiểm tra theo chu kỳ thay vì chờ vô hạn, nên hạn
/// VI: chót do chính tiến trình này áp đặt: một test bị treo nếu không sẽ giữ
/// VI: run tới khi lease của server hết hạn, và với mọi người thì điều đó
/// VI: trông như companion đã chết.
pub fn run_approved(
    name: &str,
    command: &[String],
    directory: &Path,
    timeout: Duration,
) -> Result<Executed> {
    let (program, arguments) = command
        .split_first()
        .ok_or_else(|| Error::Configuration("a test command has no program".into()))?;

    let started = Instant::now();
    let mut builder = Command::new(program);
    builder
        .args(arguments)
        .current_dir(directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        // An approved test reports its diagnostics on stderr, so both streams
        // are kept together in the evidence.
        // VI: Một test đã duyệt báo chẩn đoán qua stderr, nên cả hai luồng
        // VI: được giữ chung trong bằng chứng.
        .stderr(Stdio::piped());
    // The command must be killable as a tree: `pnpm test` runs the real work
    // in a grandchild that holds these pipes open, and killing only the child
    // would leave the read below blocking until that grandchild finished.
    // VI: Lệnh phải giết được theo cả cây: `pnpm test` chạy phần việc thật ở
    // VI: một tiến trình cháu đang giữ các pipe này, và chỉ giết tiến trình
    // VI: con sẽ khiến phần đọc bên dưới bị chặn tới khi cháu đó kết thúc.
    flowie_platform::spawn_in_own_group(&mut builder);
    let mut child = builder.spawn().map_err(|error| Error::TestCommand {
        name: name.to_string(),
        message: format!("could not start {program}: {error}"),
    })?;

    let timed_out = loop {
        match child.try_wait() {
            Ok(Some(_)) => break false,
            Ok(None) => {
                if started.elapsed() >= timeout {
                    // The whole tree goes, not just the child, or the output
                    // read below waits for a grandchild that is still running.
                    // VI: Cả cây bị kết thúc chứ không chỉ tiến trình con, nếu
                    // VI: không phần đọc output bên dưới sẽ chờ một tiến trình
                    // VI: cháu vẫn đang chạy.
                    let _ = flowie_platform::terminate_tree(child.id());
                    let _ = child.kill();
                    let _ = child.wait();
                    break true;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                return Err(Error::TestCommand {
                    name: name.to_string(),
                    message: format!("could not wait for {program}: {error}"),
                })
            }
        }
    };

    let output = child
        .wait_with_output()
        .map_err(|error| Error::TestCommand {
            name: name.to_string(),
            message: format!("could not read the output of {program}: {error}"),
        })?;

    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push_str(&String::from_utf8_lossy(&output.stderr));

    Ok(Executed {
        name: name.to_string(),
        command: command.to_vec(),
        exit_code: if timed_out {
            TIMEOUT_EXIT_CODE
        } else {
            output.status.code().unwrap_or(-1)
        },
        duration_ms: started.elapsed().as_millis() as u64,
        log: log_tail(&combined),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shell(script: &str) -> Vec<String> {
        if cfg!(windows) {
            vec![
                "cmd".into(),
                "/C".into(),
                script.replace("exit ", "exit /b "),
            ]
        } else {
            vec!["sh".into(), "-c".into(), script.into()]
        }
    }

    #[test]
    fn a_passing_command_reports_exit_zero() {
        let executed = run_approved(
            "approved-local-test-1",
            &shell("exit 0"),
            Path::new("."),
            Duration::from_secs(30),
        )
        .unwrap();
        assert!(executed.passed());
        assert_eq!(executed.exit_code, 0);
    }

    #[test]
    fn a_failing_command_keeps_its_exit_code() {
        let executed = run_approved(
            "approved-local-test-1",
            &shell("exit 3"),
            Path::new("."),
            Duration::from_secs(30),
        )
        .unwrap();
        assert!(!executed.passed());
        assert_eq!(executed.exit_code, 3);
    }

    #[test]
    fn a_hanging_command_is_stopped_and_reported_as_124() {
        let script = if cfg!(windows) {
            "ping -n 30 127.0.0.1 > NUL"
        } else {
            "sleep 30"
        };
        let executed = run_approved(
            "approved-local-test-1",
            &shell(script),
            Path::new("."),
            Duration::from_millis(600),
        )
        .unwrap();
        assert_eq!(executed.exit_code, TIMEOUT_EXIT_CODE);
        // The deadline is enforced here, so the call returns in roughly the
        // timeout rather than in the command's own 30 seconds.
        // VI: Hạn chót do chính nơi này áp đặt, nên lời gọi trả về trong
        // VI: khoảng thời gian timeout chứ không phải 30 giây của lệnh.
        assert!(executed.duration_ms < 10_000, "{}", executed.duration_ms);
    }

    #[test]
    fn a_missing_program_is_a_test_command_error() {
        let error = run_approved(
            "approved-local-test-1",
            &["flowie-no-such-program".to_string()],
            Path::new("."),
            Duration::from_secs(5),
        )
        .unwrap_err();
        assert!(matches!(error, Error::TestCommand { .. }));
    }

    #[test]
    fn the_log_keeps_the_end_and_cuts_on_characters() {
        let short = "a".repeat(100);
        assert_eq!(log_tail(&short), short);

        let long: String = (0..LOG_TAIL + 500).map(|_| 'x').collect();
        let tail = log_tail(&long);
        assert_eq!(tail.chars().count(), LOG_TAIL);

        // Vietnamese output must stay valid text after the cut.
        // VI: Output tiếng Việt phải còn là văn bản hợp lệ sau khi cắt.
        let vietnamese: String = (0..LOG_TAIL + 100).map(|_| 'ộ').collect();
        let tail = log_tail(&vietnamese);
        assert_eq!(tail.chars().count(), LOG_TAIL);
        assert!(tail.chars().all(|c| c == 'ộ'));
    }

    #[test]
    fn the_approved_list_follows_the_runner_rules() {
        assert!(validate_commands(&[vec!["pnpm".into(), "test".into()]]).is_ok());
        assert!(matches!(
            validate_commands(&[]),
            Err(Error::Configuration(_))
        ));
        assert!(matches!(
            validate_commands(&[vec![]]),
            Err(Error::Configuration(_))
        ));
        assert!(matches!(
            validate_commands(&[vec!["pnpm".into(), String::new()]]),
            Err(Error::Configuration(_))
        ));
        let too_many = vec![vec!["true".to_string()]; 21];
        assert!(matches!(
            validate_commands(&too_many),
            Err(Error::Configuration(_))
        ));
    }

    #[test]
    fn the_timeout_range_matches_the_runner() {
        assert!(validate_timeout(DEFAULT_TIMEOUT_SECONDS).is_ok());
        assert!(validate_timeout(1).is_ok());
        assert!(validate_timeout(3_600).is_ok());
        assert!(matches!(validate_timeout(0), Err(Error::Configuration(_))));
        assert!(matches!(
            validate_timeout(3_601),
            Err(Error::Configuration(_))
        ));
    }
}
