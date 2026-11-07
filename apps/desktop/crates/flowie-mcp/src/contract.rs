//! Typed arguments for the run-lifecycle tools, validated before anything is
//! sent. The server validates all of this too; checking here as well turns a
//! round trip and a rejected run into a local error, and keeps a malformed
//! result from ever being presented as finished work.
//! VI: Tham số có kiểu cho các tool vòng đời run, kiểm tra trước khi gửi bất
//! VI: cứ thứ gì. Server cũng kiểm tra tất cả những điều này; kiểm tra thêm ở
//! VI: đây biến một vòng gọi mạng và một run bị từ chối thành một lỗi cục bộ,
//! VI: và ngăn một kết quả sai định dạng được trình bày như việc đã hoàn thành.
//!
//! Every limit mirrors `apps/api-python/app/modules/agent_runs/contracts.py`.
//! VI: Mọi giới hạn ở đây lấy theo `contracts.py` của server.

use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};

const LEASE_TOKEN_MIN: usize = 16;
const LEASE_TOKEN_MAX: usize = 100;
const PROGRESS_MAX: usize = 300;
const SUMMARY_MIN: usize = 3;
const SUMMARY_MAX: usize = 10_000;
const TESTS_MAX: usize = 50;
const LOG_MAX: usize = 4_000;
const COMMAND_ARGS_MAX: usize = 50;
const COMMAND_ARG_LEN_MAX: usize = 2_000;

/// The ownership proof returned by `claim_issue`, required by every later
/// call on that run. Holding these three together makes it impossible to send
/// a heartbeat with a lease token from one run and a fencing token from
/// another.
/// VI: Bằng chứng sở hữu do `claim_issue` trả về, bắt buộc cho mọi lời gọi sau
/// VI: đó trên run này. Giữ ba giá trị đi liền nhau khiến không thể gửi
/// VI: heartbeat với lease token của run này và fencing token của run khác.
#[derive(Clone, Serialize, Deserialize)]
pub struct Lease {
    #[serde(rename = "runId")]
    pub run_id: String,
    #[serde(rename = "leaseToken")]
    pub lease_token: String,
    #[serde(rename = "fencingToken")]
    pub fencing_token: i64,
}

// The lease token is a bearer secret for the run: anything holding it can
// report that run's result. It is redacted here so a debug log of a run's
// state can never leak it.
// VI: Lease token là bí mật dạng bearer của run: ai giữ nó cũng báo được kết
// VI: quả của run đó. Nó được che ở đây để log debug trạng thái run không bao
// VI: giờ làm lộ.
impl std::fmt::Debug for Lease {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Lease")
            .field("run_id", &self.run_id)
            .field("lease_token", &"<redacted>")
            .field("fencing_token", &self.fencing_token)
            .finish()
    }
}

impl Lease {
    pub fn validate(&self) -> Result<()> {
        if self.run_id.is_empty() {
            return Err(Error::Contract("runId must not be empty".into()));
        }
        let length = self.lease_token.len();
        if !(LEASE_TOKEN_MIN..=LEASE_TOKEN_MAX).contains(&length) {
            return Err(Error::Contract(format!(
                "leaseToken must be {LEASE_TOKEN_MIN} to {LEASE_TOKEN_MAX} characters, got {length}"
            )));
        }
        if !self
            .lease_token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        {
            return Err(Error::Contract(
                "leaseToken must match ^[A-Za-z0-9_-]+$".into(),
            ));
        }
        if self.fencing_token < 1 {
            return Err(Error::Contract("fencingToken must be at least 1".into()));
        }
        Ok(())
    }
}

/// One line of current activity, shown live on the task.
/// VI: Một dòng hoạt động hiện tại, hiển thị trực tiếp trên task.
pub fn validate_progress(progress: &str) -> Result<()> {
    if progress.is_empty() {
        return Err(Error::Contract("progress must not be empty".into()));
    }
    // The limit is in characters, not bytes: Vietnamese text would otherwise
    // be cut off at roughly half the length the server actually allows.
    // VI: Giới hạn tính theo ký tự chứ không theo byte: nếu tính theo byte thì
    // VI: tiếng Việt bị cắt ở khoảng một nửa độ dài server thật sự cho phép.
    let characters = progress.chars().count();
    if characters > PROGRESS_MAX {
        return Err(Error::Contract(format!(
            "progress must be at most {PROGRESS_MAX} characters, got {characters}"
        )));
    }
    Ok(())
}

/// One executed check. A name and a verdict alone cannot be audited, so the
/// command, exit code, duration and a bounded log tail are all required.
/// VI: Một lần kiểm tra đã chạy. Chỉ có tên và kết luận thì không kiểm toán
/// VI: được, nên lệnh, exit code, thời lượng và phần đuôi log có giới hạn đều
/// VI: là bắt buộc.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TestEvidence {
    pub name: String,
    pub command: Vec<String>,
    #[serde(rename = "exitCode")]
    pub exit_code: i32,
    pub result: TestResult,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    #[serde(default)]
    pub log: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TestResult {
    Passed,
    Failed,
}

impl TestEvidence {
    pub fn validate(&self) -> Result<()> {
        if self.name.is_empty() || self.name.len() > 200 {
            return Err(Error::Contract(
                "test name must be 1 to 200 characters".into(),
            ));
        }
        if self.command.is_empty() || self.command.len() > COMMAND_ARGS_MAX {
            return Err(Error::Contract(format!(
                "test command must be 1 to {COMMAND_ARGS_MAX} arguments"
            )));
        }
        if self
            .command
            .iter()
            .any(|argument| argument.is_empty() || argument.len() > COMMAND_ARG_LEN_MAX)
        {
            return Err(Error::Contract(
                "test command arguments must be bounded non-empty strings".into(),
            ));
        }
        if self.duration_ms > 86_400_000 {
            return Err(Error::Contract(
                "durationMs must be at most 86400000".into(),
            ));
        }
        if self.log.len() > LOG_MAX {
            return Err(Error::Contract(format!(
                "test log must be at most {LOG_MAX} characters"
            )));
        }
        // A verdict that contradicts its own exit code is not evidence.
        // VI: Một kết luận mâu thuẫn với chính exit code của nó thì không phải
        // VI: bằng chứng.
        let passed = self.exit_code == 0;
        if passed != (self.result == TestResult::Passed) {
            return Err(Error::Contract(
                "test result must match its exit code".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Outcome {
    #[serde(rename = "AWAITING_REVIEW")]
    AwaitingReview,
    #[serde(rename = "FAILED")]
    Failed,
}

/// The result of a run. Nothing here marks an issue done; a successful run
/// waits for a person to review it.
/// VI: Kết quả của một run. Không gì ở đây đánh dấu issue là xong; một run
/// VI: thành công vẫn chờ người review.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RunResult {
    pub outcome: Outcome,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
    #[serde(rename = "pullRequestUrl", skip_serializing_if = "Option::is_none")]
    pub pull_request_url: Option<String>,
    #[serde(default)]
    pub tests: Vec<TestEvidence>,
}

impl RunResult {
    pub fn validate(&self) -> Result<()> {
        let summary = self.summary.chars().count();
        if !(SUMMARY_MIN..=SUMMARY_MAX).contains(&summary) {
            return Err(Error::Contract(format!(
                "summary must be {SUMMARY_MIN} to {SUMMARY_MAX} characters, got {summary}"
            )));
        }
        if self.tests.len() > TESTS_MAX {
            return Err(Error::Contract(format!(
                "at most {TESTS_MAX} tests may be reported"
            )));
        }
        for test in &self.tests {
            test.validate()?;
        }
        if let Some(commit) = &self.commit {
            let valid =
                (7..=64).contains(&commit.len()) && commit.bytes().all(|b| b.is_ascii_hexdigit());
            if !valid {
                return Err(Error::Contract(
                    "commit must be 7 to 64 hexadecimal characters".into(),
                ));
            }
        }
        if let Some(url) = &self.pull_request_url {
            if url.len() > 2048 {
                return Err(Error::Contract("pullRequestUrl is too long".into()));
            }
            let authority = url
                .strip_prefix("https://")
                .ok_or_else(|| Error::Contract("pullRequestUrl must use HTTPS".into()))?;
            let host = authority.split('/').next().unwrap_or_default();
            if host.is_empty() {
                return Err(Error::Contract("pullRequestUrl has no host".into()));
            }
            if host.contains('@') {
                return Err(Error::Contract(
                    "pullRequestUrl must not carry credentials".into(),
                ));
            }
        }
        // Work cannot be presented as review-ready without executed checks
        // behind it, and a recorded failure contradicts that claim.
        // VI: Không thể trình bày công việc là sẵn sàng review khi chưa có
        // VI: kiểm tra nào chạy phía sau, và một test ghi nhận thất bại thì
        // VI: mâu thuẫn với lời khẳng định đó.
        if self.outcome == Outcome::AwaitingReview {
            if self.commit.is_none() {
                return Err(Error::Contract(
                    "a code result awaiting review requires a commit".into(),
                ));
            }
            if self.tests.is_empty() {
                return Err(Error::Contract(
                    "a code result awaiting review must report the tests it executed".into(),
                ));
            }
            if self.tests.iter().any(|t| t.result != TestResult::Passed) {
                return Err(Error::Contract(
                    "a code result awaiting review cannot report a failed test".into(),
                ));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lease() -> Lease {
        Lease {
            run_id: "crun0000000000000000000001".into(),
            lease_token: "0123456789abcdef0123456789abcdef".into(),
            fencing_token: 1,
        }
    }

    fn passing_test() -> TestEvidence {
        TestEvidence {
            name: "approved-local-test-1".into(),
            command: vec!["pnpm".into(), "test".into()],
            exit_code: 0,
            result: TestResult::Passed,
            duration_ms: 1200,
            log: String::new(),
        }
    }

    #[test]
    fn a_valid_lease_passes() {
        assert!(lease().validate().is_ok());
    }

    #[test]
    fn lease_token_length_matches_the_server_rule() {
        let mut short = lease();
        short.lease_token = "short".into();
        assert!(matches!(short.validate(), Err(Error::Contract(_))));

        let mut long = lease();
        long.lease_token = "a".repeat(101);
        assert!(matches!(long.validate(), Err(Error::Contract(_))));

        let mut boundary = lease();
        boundary.lease_token = "a".repeat(16);
        assert!(boundary.validate().is_ok());
    }

    #[test]
    fn lease_token_rejects_characters_outside_the_pattern() {
        let mut lease = lease();
        lease.lease_token = "0123456789abcdef!".into();
        assert!(matches!(lease.validate(), Err(Error::Contract(_))));
    }

    #[test]
    fn fencing_token_starts_at_one() {
        let mut lease = lease();
        lease.fencing_token = 0;
        assert!(matches!(lease.validate(), Err(Error::Contract(_))));
    }

    #[test]
    fn lease_debug_never_prints_the_token() {
        let rendered = format!("{:?}", lease());
        assert!(!rendered.contains("0123456789abcdef"));
        assert!(rendered.contains("<redacted>"));
    }

    #[test]
    fn progress_is_measured_in_characters_not_bytes() {
        // 300 Vietnamese characters are well over 300 bytes; the server limit
        // is on characters, so this must be accepted.
        // VI: 300 ký tự tiếng Việt vượt xa 300 byte; giới hạn của server tính
        // VI: theo ký tự nên trường hợp này phải được chấp nhận.
        let vietnamese = "ạ".repeat(300);
        assert!(vietnamese.len() > 300);
        assert!(validate_progress(&vietnamese).is_ok());
        assert!(matches!(
            validate_progress(&"ạ".repeat(301)),
            Err(Error::Contract(_))
        ));
        assert!(matches!(validate_progress(""), Err(Error::Contract(_))));
    }

    #[test]
    fn a_test_verdict_must_match_its_exit_code() {
        let mut evidence = passing_test();
        evidence.exit_code = 1;
        assert!(matches!(evidence.validate(), Err(Error::Contract(_))));

        let mut failing = passing_test();
        failing.exit_code = 1;
        failing.result = TestResult::Failed;
        assert!(failing.validate().is_ok());
    }

    #[test]
    fn awaiting_review_requires_commit_and_passing_tests() {
        let base = RunResult {
            outcome: Outcome::AwaitingReview,
            summary: "did the work".into(),
            commit: Some("0123abc".into()),
            pull_request_url: None,
            tests: vec![passing_test()],
        };
        assert!(base.validate().is_ok());

        let mut no_commit = base.clone();
        no_commit.commit = None;
        assert!(matches!(no_commit.validate(), Err(Error::Contract(_))));

        let mut no_tests = base.clone();
        no_tests.tests.clear();
        assert!(matches!(no_tests.validate(), Err(Error::Contract(_))));

        let mut failed_test = base.clone();
        failed_test.tests[0].exit_code = 1;
        failed_test.tests[0].result = TestResult::Failed;
        assert!(matches!(failed_test.validate(), Err(Error::Contract(_))));
    }

    #[test]
    fn a_failed_outcome_needs_neither_commit_nor_tests() {
        let failed = RunResult {
            outcome: Outcome::Failed,
            summary: "an approved local test failed".into(),
            commit: None,
            pull_request_url: None,
            tests: vec![],
        };
        assert!(failed.validate().is_ok());
    }

    #[test]
    fn pull_request_url_must_be_credential_free_https() {
        let mut result = RunResult {
            outcome: Outcome::Failed,
            summary: "reporting".into(),
            commit: None,
            pull_request_url: Some("http://github.com/a/b/pull/1".into()),
            tests: vec![],
        };
        assert!(matches!(result.validate(), Err(Error::Contract(_))));

        result.pull_request_url = Some("https://user:pw@github.com/a/b/pull/1".into());
        assert!(matches!(result.validate(), Err(Error::Contract(_))));

        result.pull_request_url = Some("https://github.com/a/b/pull/1".into());
        assert!(result.validate().is_ok());
    }

    #[test]
    fn commit_must_look_like_a_commit() {
        let mut result = RunResult {
            outcome: Outcome::Failed,
            summary: "reporting".into(),
            commit: Some("nothex!".into()),
            pull_request_url: None,
            tests: vec![],
        };
        assert!(matches!(result.validate(), Err(Error::Contract(_))));

        result.commit = Some("abc".into());
        assert!(matches!(result.validate(), Err(Error::Contract(_))));

        result.commit = Some("0123abc".into());
        assert!(result.validate().is_ok());
    }
}
