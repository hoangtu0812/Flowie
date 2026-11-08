//! One machine's checkout, driving a run's working copy.
//!
//! The ordering here matters more than any individual step. `verify` runs
//! before the issue is claimed and refuses rather than repairs, because a run
//! against the wrong repository produces work nobody can review and claiming
//! is what takes the task away from every other machine. Everything after the
//! claim is reportable instead: the task is already held, so stopping without
//! a word would leave someone watching it forever.
//! VI: Checkout của một máy, điều khiển bản làm việc của một run.
//! VI: Thứ tự ở đây quan trọng hơn từng bước riêng lẻ. `verify` chạy trước khi
//! VI: issue bị claim và từ chối chứ không tự sửa, vì một run chạy nhầm
//! VI: repository sinh ra thứ không ai review được, còn claim là thứ lấy task
//! VI: khỏi tay mọi máy khác. Mọi thứ sau khi claim thì phải báo được: task đã
//! VI: bị giữ rồi, nên dừng mà không nói gì sẽ để ai đó ngồi nhìn nó mãi.

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

use flowie_core::run::{RunFailure, TestOutcome, Workspace};
use flowie_repository::repository::{Repository, RepositoryConfig, Worktree};
use flowie_repository::tests_runner::{self, Executed};

/// How long a published push or pull request may take before it is given up
/// on. Networks are slow; they are not slow for minutes.
/// VI: Một lần push hay mở pull request được chạy bao lâu trước khi bỏ cuộc.
/// VI: Mạng có thể chậm, nhưng không chậm tới hàng phút.
pub const NETWORK_TIMEOUT: Duration = Duration::from_secs(120);

/// What one run does to a checkout.
/// VI: Những gì một run tác động lên một checkout.
pub struct Checkout {
    config: RepositoryConfig,
    /// The commands a person approved, in the order they were approved.
    /// VI: Các lệnh một người đã duyệt, theo đúng thứ tự được duyệt.
    tests: Vec<Vec<String>>,
    test_timeout: Duration,
    /// Opened by `verify`, which is the step that is allowed to refuse.
    /// VI: Được mở bởi `verify`, bước duy nhất được phép từ chối.
    repository: Option<Repository>,
    worktree: Option<Worktree>,
}

impl Checkout {
    pub fn new(config: RepositoryConfig, tests: Vec<Vec<String>>, test_timeout: Duration) -> Self {
        Self {
            config,
            tests,
            test_timeout,
            repository: None,
            worktree: None,
        }
    }

    /// Where the agent should work, once a worktree exists.
    ///
    /// The agent needs this and the orchestrator's ports do not carry it, so
    /// the shell reads it from here after `create_worktree` and before the
    /// agent's first turn.
    /// VI: Nơi agent cần làm việc, khi đã có worktree.
    /// VI: Agent cần đường dẫn này còn các cổng của orchestrator không mang nó,
    /// VI: nên vỏ ứng dụng đọc từ đây sau `create_worktree` và trước lượt đầu
    /// VI: tiên của agent.
    pub fn worktree_path(&self) -> Option<PathBuf> {
        self.worktree.as_ref().map(|tree| tree.path().to_path_buf())
    }

    /// The branch this run's work sits on, once a worktree exists.
    /// VI: Nhánh mà công việc của run này nằm trên, khi đã có worktree.
    pub fn branch(&self) -> Option<&str> {
        self.worktree.as_ref().map(Worktree::branch)
    }

    fn worktree(&self) -> Result<&Worktree, RunFailure> {
        self.worktree
            .as_ref()
            .ok_or_else(|| RunFailure::Reportable("this run has no working copy yet".into()))
    }
}

impl Workspace for Checkout {
    fn verify(&mut self) -> Result<(), RunFailure> {
        // Both of these refuse a machine that cannot do the work, and both run
        // before anything is claimed. A test command that is not allowed would
        // otherwise be discovered after the agent had already written code.
        // VI: Cả hai bước này từ chối một máy không làm được việc, và cả hai
        // VI: chạy trước khi claim bất cứ thứ gì. Một lệnh test không được phép
        // VI: nếu không sẽ chỉ bị phát hiện sau khi agent đã viết code.
        tests_runner::validate_commands(&self.tests).map_err(precondition)?;
        tests_runner::validate_timeout(self.test_timeout.as_secs()).map_err(precondition)?;
        self.repository = Some(Repository::open(self.config.clone()).map_err(precondition)?);
        Ok(())
    }

    fn create_worktree(&mut self, run_id: &str) -> Result<(), RunFailure> {
        let repository = self
            .repository
            .as_ref()
            .ok_or_else(|| RunFailure::Precondition("the checkout was never verified".into()))?;
        self.worktree = Some(repository.worktree(run_id).map_err(reportable)?);
        Ok(())
    }

    fn run_approved_tests(&mut self) -> Result<Vec<TestOutcome>, RunFailure> {
        let directory = self.worktree()?.path().to_path_buf();
        let mut executed = Vec::with_capacity(self.tests.len());
        for (index, command) in self.tests.iter().enumerate() {
            // Named by position so the evidence lines up with the approved
            // list a person can read, rather than with a program name that may
            // appear more than once.
            // VI: Đặt tên theo vị trí để bằng chứng khớp với danh sách đã duyệt
            // VI: mà người dùng đọc được, thay vì khớp với tên chương trình vốn
            // VI: có thể xuất hiện nhiều lần.
            let name = format!("approved-local-test-{}", index + 1);
            let result = tests_runner::run_approved(&name, command, &directory, self.test_timeout)
                .map_err(reportable)?;
            executed.push(outcome(result));
        }
        Ok(executed)
    }

    fn commit(&mut self, message: &str) -> Result<Option<String>, RunFailure> {
        self.worktree()?.commit(message).map_err(reportable)
    }

    fn publish(&mut self) -> Result<Option<String>, RunFailure> {
        let worktree = self.worktree()?;
        let branch = worktree.branch().to_string();
        let directory = worktree.path().to_path_buf();

        // Only GitHub.com, and said so plainly. The alternative is pushing the
        // branch and then failing to open the pull request, which leaves a
        // remote branch nobody asked for and a run that reports no address.
        // VI: Chỉ GitHub.com, và nói thẳng ra như vậy. Cách còn lại là push
        // VI: nhánh rồi mở pull request không được, để lại một nhánh trên remote
        // VI: không ai yêu cầu và một run không báo được địa chỉ nào.
        if !is_github(&self.config.repository_url) {
            return Err(RunFailure::Reportable(format!(
                "publishing supports github.com repositories; this project is {}",
                self.config.repository_url
            )));
        }

        run_tool(
            "git",
            &[
                "push".into(),
                "--set-upstream".into(),
                "origin".into(),
                branch.clone(),
            ],
            &directory,
        )?;

        let url = run_tool(
            "gh",
            &[
                "pr".into(),
                "create".into(),
                "--repo".into(),
                self.config.repository_url.clone(),
                "--draft".into(),
                "--head".into(),
                branch,
                "--base".into(),
                self.config.base_branch.clone(),
                "--title".into(),
                format!("Resolve Flowie run {}", run_name(&directory)),
                "--body".into(),
                // A draft, and the body says why: the evidence is local, so
                // the diff and independent CI still have to be looked at.
                // VI: Là bản nháp, và phần mô tả nói rõ vì sao: bằng chứng là ở
                // VI: máy cục bộ, nên vẫn phải xem diff và CI độc lập.
                "Local agent changes with locally executed test evidence. Review the diff and independent CI before merging.".into(),
            ],
            &directory,
        )?;

        // gh prints the pull request address on its last line.
        // VI: gh in địa chỉ pull request ở dòng cuối.
        Ok(url
            .lines()
            .rev()
            .find(|line| line.starts_with("https://"))
            .map(str::to_string))
    }

    fn retire_worktree(&mut self, keep: bool) -> Result<(), RunFailure> {
        let Some(worktree) = self.worktree.take() else {
            // Nothing was cut, which is the ordinary state when a run stopped
            // during its read-only checks.
            // VI: Chưa cắt worktree nào, trạng thái bình thường khi một run dừng
            // VI: ở các bước chỉ đọc.
            return Ok(());
        };
        worktree.retire(keep).map_err(reportable)?;
        Ok(())
    }
}

/// Runs a tool that talks to the network, with the environment reduced to the
/// allowlist and a deadline of its own.
/// VI: Chạy một công cụ có giao tiếp mạng, với môi trường thu lại theo danh
/// VI: sách cho phép và hạn chót riêng.
fn run_tool(
    program: &str,
    arguments: &[String],
    directory: &std::path::Path,
) -> Result<String, RunFailure> {
    let path = flowie_platform::executable::resolve(program)
        .ok_or_else(|| RunFailure::Reportable(format!("{program} is not on this machine")))?;
    let mut command = Command::new(path);
    command
        .args(arguments)
        .current_dir(directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    flowie_platform::environment::apply(&mut command);
    flowie_platform::process::spawn_in_own_group(&mut command);

    let child = command
        .spawn()
        .map_err(|error| RunFailure::Reportable(format!("{program} could not start: {error}")))?;
    let finished = wait_for_tool(child)?;
    if finished.0 != 0 {
        return Err(RunFailure::Reportable(format!(
            "{program} exited with {}: {}",
            finished.0,
            finished.2.trim()
        )));
    }
    Ok(finished.1)
}

/// Waits for a tool, ending its whole process tree if it runs past the
/// deadline. `git push` over a hung connection is exactly the case this
/// exists for.
/// VI: Chờ một công cụ, kết thúc cả cây tiến trình của nó nếu quá hạn.
/// VI: `git push` trên một kết nối treo chính là tình huống hàm này sinh ra để
/// VI: xử lý.
fn wait_for_tool(mut child: std::process::Child) -> Result<(i32, String, String), RunFailure> {
    use std::io::Read;

    let deadline = std::time::Instant::now() + NETWORK_TIMEOUT;
    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut out = String::new();
                let mut err = String::new();
                if let Some(stream) = stdout.as_mut() {
                    let _ = stream.read_to_string(&mut out);
                }
                if let Some(stream) = stderr.as_mut() {
                    let _ = stream.read_to_string(&mut err);
                }
                return Ok((status.code().unwrap_or(-1), out, err));
            }
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    let _ = flowie_platform::process::terminate_tree(child.id());
                    return Err(RunFailure::Reportable(format!(
                        "it did not finish within {} seconds",
                        NETWORK_TIMEOUT.as_secs()
                    )));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                return Err(RunFailure::Reportable(format!(
                    "it could not be waited for: {error}"
                )))
            }
        }
    }
}

/// The run id, read back from the worktree directory that was named after it.
/// VI: Run id, đọc lại từ thư mục worktree vốn được đặt tên theo nó.
fn run_name(directory: &std::path::Path) -> String {
    directory
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "unknown".into())
}

fn is_github(url: &str) -> bool {
    let without_scheme = url.split_once("://").map(|(_, rest)| rest).unwrap_or(url);
    let authority = without_scheme.split('/').next().unwrap_or_default();
    let host = authority.rsplit('@').next().unwrap_or_default();
    let host = host.split(':').next().unwrap_or_default();
    host.eq_ignore_ascii_case("github.com")
}

/// The evidence an executed command leaves behind, in the run's vocabulary.
/// VI: Bằng chứng một lệnh đã chạy để lại, theo từ vựng của run.
fn outcome(executed: Executed) -> TestOutcome {
    TestOutcome {
        name: executed.name,
        command: executed.command,
        exit_code: executed.exit_code,
        duration_ms: executed.duration_ms,
        log: executed.log,
    }
}

/// The machine cannot do this run, and nothing has been claimed yet.
/// VI: Máy không làm được run này, và chưa claim gì cả.
fn precondition(error: flowie_repository::Error) -> RunFailure {
    RunFailure::Precondition(error.to_string())
}

/// Something failed with the task already held, so the server has to be told.
/// VI: Có thứ hỏng khi task đã bị giữ, nên server phải được biết.
fn reportable(error: flowie_repository::Error) -> RunFailure {
    RunFailure::Reportable(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(path: PathBuf) -> RepositoryConfig {
        RepositoryConfig {
            repository_url: "https://github.com/hoangtu0812/Flowie.git".into(),
            base_branch: "main".into(),
            path,
            worktree_root: None,
        }
    }

    fn checkout(path: PathBuf, tests: Vec<Vec<String>>) -> Checkout {
        Checkout::new(config(path), tests, Duration::from_secs(60))
    }

    #[test]
    fn a_checkout_that_is_not_a_repository_refuses_before_anything_is_claimed() {
        // Refusing here is the whole point: claiming is what takes the task
        // away from every other machine.
        // VI: Từ chối ở đây mới là điều cốt lõi: claim là thứ lấy task khỏi tay
        // VI: mọi máy khác.
        let directory = tempfile::tempdir().expect("a temporary directory");
        let mut subject = checkout(directory.path().to_path_buf(), vec![]);
        let error = subject.verify().expect_err("not a git checkout");
        assert!(matches!(error, RunFailure::Precondition(_)), "{error:?}");
    }

    #[test]
    fn a_test_command_that_was_never_allowed_refuses_before_the_claim_too() {
        // Discovering this after the agent had written code would waste the
        // whole run, and the task would already be held.
        // VI: Phát hiện điều này sau khi agent đã viết code sẽ phí cả lượt chạy,
        // VI: và task thì đã bị giữ rồi.
        let directory = tempfile::tempdir().expect("a temporary directory");
        let mut subject = checkout(directory.path().to_path_buf(), vec![vec![]]);
        let error = subject.verify().expect_err("an empty command");
        assert!(matches!(error, RunFailure::Precondition(_)), "{error:?}");
    }

    #[test]
    fn work_cannot_be_asked_for_before_a_working_copy_exists() {
        // The task is held by this point, so each of these has to be something
        // the server is told rather than a silent stop.
        // VI: Tới điểm này task đã bị giữ, nên mỗi lỗi ở đây phải là thứ được
        // VI: báo cho server chứ không phải một lần dừng lặng lẽ.
        let directory = tempfile::tempdir().expect("a temporary directory");
        let mut subject = checkout(directory.path().to_path_buf(), vec![]);
        assert!(matches!(
            subject.run_approved_tests(),
            Err(RunFailure::Reportable(_))
        ));
        assert!(matches!(
            subject.commit("nothing"),
            Err(RunFailure::Reportable(_))
        ));
        assert!(matches!(subject.publish(), Err(RunFailure::Reportable(_))));
    }

    #[test]
    fn a_worktree_that_was_never_cut_retires_without_complaint() {
        // A run that stopped during its read-only checks has nothing to tidy,
        // and the orchestrator calls this on every ending.
        // VI: Một run dừng ở các bước chỉ đọc thì không có gì để dọn, và
        // VI: orchestrator gọi hàm này ở mọi kết cục.
        let directory = tempfile::tempdir().expect("a temporary directory");
        let mut subject = checkout(directory.path().to_path_buf(), vec![]);
        assert!(subject.retire_worktree(true).is_ok());
        assert!(subject.retire_worktree(false).is_ok());
    }

    #[test]
    fn creating_a_worktree_before_verifying_is_a_programming_mistake() {
        let directory = tempfile::tempdir().expect("a temporary directory");
        let mut subject = checkout(directory.path().to_path_buf(), vec![]);
        let error = subject
            .create_worktree("crun1")
            .expect_err("verify never ran");
        assert!(matches!(error, RunFailure::Precondition(_)), "{error:?}");
    }

    #[test]
    fn only_github_repositories_can_be_published_to() {
        for (url, github) in [
            ("https://github.com/a/b.git", true),
            ("https://GitHub.com/a/b", true),
            ("git@github.com:a/b.git", true),
            ("https://dev.azure.com/bsr-its/x", false),
            ("https://gitlab.com/a/b.git", false),
            // A host that merely ends with the right name is a different host.
            // VI: Một host chỉ tình cờ kết thúc bằng cái tên đó là host khác.
            ("https://notgithub.com/a/b", false),
            ("https://github.com.evil.example/a/b", false),
        ] {
            assert_eq!(is_github(url), github, "{url}");
        }
    }

    #[test]
    fn the_run_name_comes_from_the_worktree_directory() {
        assert_eq!(
            run_name(std::path::Path::new("/code/b.flowie-worktrees/crun1")),
            "crun1"
        );
    }

    #[test]
    fn evidence_keeps_everything_the_result_contract_needs() {
        let mapped = outcome(Executed {
            name: "approved-local-test-1".into(),
            command: vec!["pnpm".into(), "test".into()],
            exit_code: 1,
            duration_ms: 3_000,
            log: "failed".into(),
        });
        assert_eq!(mapped.name, "approved-local-test-1");
        assert_eq!(mapped.command, vec!["pnpm".to_string(), "test".to_string()]);
        assert_eq!(mapped.exit_code, 1);
        assert_eq!(mapped.duration_ms, 3_000);
        assert_eq!(mapped.log, "failed");
        assert!(!mapped.passed(), "the exit code decides");
    }
}
