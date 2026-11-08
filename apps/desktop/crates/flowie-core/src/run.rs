//! Driving one run from claim to result.
//!
//! The order is in `sequence`, the lease rules are in `lease`, and what
//! already happened is in `journal`. This module is what makes those three
//! act on something, and it does so through ports rather than against the
//! real server, repository and agent. That is not indirection for its own
//! sake: the behaviour worth being sure about is what happens when things go
//! wrong — a test fails, the lease is lost, the network drops between the
//! commit and the report — and none of those are reachable by running the
//! real thing and hoping.
//! VI: Điều phối một run từ lúc claim tới lúc có kết quả.
//! VI: Thứ tự nằm ở `sequence`, quy tắc lease ở `lease`, và những gì đã xảy ra
//! VI: ở `journal`. Module này là thứ khiến ba phần đó tác động lên cái gì đó,
//! VI: và nó làm vậy qua các cổng chứ không trực tiếp với server, repository
//! VI: và agent thật. Đây không phải lớp trung gian cho vui: hành vi đáng phải
//! VI: chắc chắn chính là lúc mọi thứ hỏng — một test fail, mất lease, rớt
//! VI: mạng giữa lúc commit và lúc báo kết quả — và không tình huống nào trong
//! VI: số đó tới được bằng cách chạy thật rồi hy vọng.

use crate::journal::Entry;
use crate::lease::{BudgetPolicy, Decision, LeaseTracker};
use crate::sequence::{Outcome, Step};

/// What the agent produced during the read-only pass.
/// VI: Những gì agent tạo ra trong lượt chỉ đọc.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Review {
    pub plan: String,
    pub target_date: String,
}

/// One executed check, as the result contract needs it.
/// VI: Một lần kiểm tra đã chạy, theo đúng thứ hợp đồng kết quả cần.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TestOutcome {
    pub name: String,
    pub passed: bool,
}

/// Anything that can go wrong during a run, at the granularity the outcome
/// depends on.
/// VI: Mọi thứ có thể hỏng trong một run, ở mức chi tiết mà kết cục phụ thuộc
/// VI: vào đó.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunFailure {
    /// The machine or the connection cannot do this run at all.
    /// VI: Máy hoặc kết nối hoàn toàn không làm được run này.
    Precondition(String),
    /// This agent no longer owns the run.
    /// VI: Agent này không còn sở hữu run.
    LeaseLost,
    /// The operator asked for it to stop.
    /// VI: Người vận hành yêu cầu dừng.
    Cancelled,
    /// Something failed that the server should be told about.
    /// VI: Có thứ hỏng mà server cần được biết.
    Reportable(String),
}

/// What the run needs from the Flowie server.
/// VI: Những gì run cần từ server Flowie.
pub trait Server {
    fn read_context(&mut self, issue: &str) -> Result<(), RunFailure>;
    fn claim(&mut self, issue: &str, key: &str) -> Result<String, RunFailure>;
    fn heartbeat(&mut self, progress: Option<&str>, key: &str) -> Result<(), RunFailure>;
    fn save_feature_docs(&mut self, issue: &str, key: &str) -> Result<(), RunFailure>;
    fn read_issue_version(&mut self, issue: &str) -> Result<i64, RunFailure>;
    fn record_schedule(
        &mut self,
        issue: &str,
        version: i64,
        target_date: &str,
        key: &str,
    ) -> Result<(), RunFailure>;
    fn post_plan(&mut self, issue: &str, plan: &str, key: &str) -> Result<(), RunFailure>;
    fn report(&mut self, outcome: Outcome, summary: &str, key: &str) -> Result<(), RunFailure>;
    fn release(&mut self, key: &str) -> Result<(), RunFailure>;
}

/// What the run needs from the checkout.
/// VI: Những gì run cần từ checkout.
pub trait Workspace {
    fn verify(&mut self) -> Result<(), RunFailure>;
    fn create_worktree(&mut self, run_id: &str) -> Result<(), RunFailure>;
    fn run_approved_tests(&mut self) -> Result<Vec<TestOutcome>, RunFailure>;
    fn commit(&mut self, message: &str) -> Result<Option<String>, RunFailure>;
    fn publish(&mut self) -> Result<Option<String>, RunFailure>;
    /// `keep` is what the caller already knows about how the run ended.
    /// VI: `keep` là điều bên gọi đã biết về cách run kết thúc.
    fn retire_worktree(&mut self, keep: bool) -> Result<(), RunFailure>;
}

/// What the run needs from the agent.
/// VI: Những gì run cần từ agent.
pub trait Agent {
    fn probe(&mut self) -> Result<(), RunFailure>;
    fn review(&mut self) -> Result<Review, RunFailure>;
    fn implement(&mut self, plan: &str) -> Result<String, RunFailure>;
}

/// Asked between steps so a person can stop a run without waiting for it.
/// VI: Được hỏi giữa các bước để người dùng dừng được một run mà không phải
/// VI: chờ nó xong.
pub trait Control {
    fn cancel_requested(&self) -> bool;
    /// Seconds since the claim, which the lease rules need. Supplied rather
    /// than read from a clock so the rules can be exercised without waiting.
    /// VI: Số giây kể từ lúc claim, thứ các quy tắc lease cần. Được cung cấp
    /// VI: thay vì tự đọc đồng hồ để kiểm được quy tắc mà không phải chờ.
    fn elapsed_seconds(&self) -> u64;
}

/// Everything one run needs to be driven.
/// VI: Mọi thứ cần để điều phối một run.
pub struct Run<'a> {
    pub issue: String,
    pub publish: bool,
    pub server: &'a mut dyn Server,
    pub workspace: &'a mut dyn Workspace,
    pub agent: &'a mut dyn Agent,
    pub control: &'a dyn Control,
    pub lease: LeaseTracker,
    pub journal: Entry,
}

/// How a run ended, and the journal as it stands.
/// VI: Run kết thúc ra sao, và journal ở trạng thái hiện tại.
#[derive(Debug)]
pub struct Completed {
    pub outcome: Outcome,
    pub journal: Entry,
    pub detail: Option<String>,
}

impl Run<'_> {
    /// Drives the run.
    ///
    /// Every step records itself in the journal before the next one starts,
    /// so a crash leaves behind what actually happened rather than what was
    /// intended. Cancellation and lost ownership are checked between steps
    /// rather than only at the top, because the expensive steps are the ones
    /// in the middle.
    /// VI: Điều phối run.
    /// VI: Mỗi bước tự ghi vào journal trước khi bước kế tiếp bắt đầu, nên một
    /// VI: lần crash để lại thứ đã thật sự xảy ra chứ không phải thứ định làm.
    /// VI: Hủy và mất quyền sở hữu được kiểm giữa các bước chứ không chỉ ở đầu,
    /// VI: vì các bước tốn kém nằm ở giữa.
    pub fn execute(mut self) -> Completed {
        match self.drive() {
            Ok(summary) => self.finish(Outcome::AwaitingReview, Some(summary)),
            Err(RunFailure::Precondition(detail)) => {
                // Nothing was claimed, so there is nothing to tell the server
                // and no worktree to keep.
                // VI: Chưa claim gì nên không có gì để báo server và không có
                // VI: worktree nào để giữ.
                Completed {
                    outcome: Outcome::Failed,
                    journal: self.journal,
                    detail: Some(detail),
                }
            }
            Err(RunFailure::LeaseLost) => self.finish(Outcome::StoppedUncertain, None),
            Err(RunFailure::Cancelled) => self.finish(Outcome::Released, None),
            Err(RunFailure::Reportable(detail)) => self.finish(Outcome::Failed, Some(detail)),
        }
    }

    fn drive(&mut self) -> Result<String, RunFailure> {
        // Read-only checks first. A run that cannot possibly succeed should
        // not have claimed anything, because claiming is what takes the
        // issue away from every other machine.
        // VI: Các kiểm tra chỉ đọc trước. Một run chắc chắn không thể thành
        // VI: công thì không nên claim gì, vì claim là thứ lấy issue khỏi tay
        // VI: mọi máy khác.
        self.workspace.verify()?;
        self.agent.probe()?;
        self.step(Step::VerifyEnvironment);

        self.server.read_context(&self.issue)?;
        self.step(Step::ReadContext);

        let key = self
            .journal
            .key_for("claim", &format!("{}-claim", self.issue));
        let run_id = self.server.claim(&self.issue, &key)?;
        self.journal.run_id = run_id.clone();
        self.step(Step::Claim);

        self.guard()?;
        self.workspace.create_worktree(&run_id)?;
        self.step(Step::CreateWorktree);

        self.beat(Some("Reviewing the issue (read-only)"))?;
        let review = self.agent.review()?;
        self.step(Step::Review);

        self.guard()?;
        let key = self
            .journal
            .key_for("feature-docs", &format!("{}-docs", self.issue));
        self.server.save_feature_docs(&self.issue, &key)?;
        self.step(Step::SaveFeatureDocs);

        // After the documents, never before: saving them bumps the issue
        // version, so a version read earlier would be stale by now and the
        // update below would fail for the wrong reason.
        // VI: Sau khi lưu tài liệu, không bao giờ trước: việc lưu làm tăng
        // VI: version của issue, nên version đọc sớm hơn sẽ cũ và bước update
        // VI: bên dưới sẽ hỏng vì một lý do sai.
        let version = self.server.read_issue_version(&self.issue)?;
        self.step(Step::ReadIssueVersion);

        let key = self
            .journal
            .key_for("schedule", &format!("{}-schedule", self.issue));
        self.server
            .record_schedule(&self.issue, version, &review.target_date, &key)?;
        self.step(Step::RecordSchedule);

        let key = self
            .journal
            .key_for("plan", &format!("{}-plan", self.issue));
        self.server.post_plan(&self.issue, &review.plan, &key)?;
        self.step(Step::PostPlan);

        self.guard()?;
        self.beat(Some("Implementing the plan"))?;
        let summary = self.agent.implement(&review.plan)?;
        self.step(Step::Implement);

        self.guard()?;
        self.beat(Some("Running approved tests"))?;
        let tests = self.workspace.run_approved_tests()?;
        if let Some(failed) = tests.iter().find(|test| !test.passed) {
            // A failing test ends the run here. Committing and reporting
            // success past this point would present work as review-ready
            // that its own checks reject.
            // VI: Một test hỏng kết thúc run tại đây. Commit và báo thành công
            // VI: sau điểm này là trình bày công việc như đã sẵn sàng review
            // VI: trong khi chính các kiểm tra của nó từ chối.
            return Err(RunFailure::Reportable(format!(
                "the approved test {} failed",
                failed.name
            )));
        }
        self.step(Step::RunApprovedTests);

        self.guard()?;
        let commit = self
            .workspace
            .commit(&format!("flowie run {}", self.issue))?;
        self.step(Step::Commit);

        if self.publish {
            self.workspace.publish()?;
            self.step(Step::Publish);
        }

        match commit {
            Some(_) => Ok(summary),
            // The agent changed nothing. That is a legitimate outcome, but it
            // is not work awaiting review, and reporting it as such would put
            // an empty change in front of a person.
            // VI: Agent không đổi gì. Đó là một kết cục hợp lệ, nhưng không
            // VI: phải công việc chờ review, và báo như vậy sẽ đặt một thay đổi
            // VI: rỗng trước mặt một người.
            None => Err(RunFailure::Reportable(
                "the agent produced no change".into(),
            )),
        }
    }

    /// Reports the outcome if one is owed, then decides the worktree.
    /// VI: Báo kết cục nếu còn nợ, rồi quyết định số phận worktree.
    fn finish(mut self, outcome: Outcome, detail: Option<String>) -> Completed {
        if outcome.reports_to_server() && self.journal.has_completed(Step::Claim) {
            let key = self
                .journal
                .key_for("report", &format!("{}-report", self.issue));
            let reported = match outcome {
                Outcome::Released => self.server.release(&key),
                other => {
                    self.server
                        .report(other, detail.as_deref().unwrap_or("the run ended"), &key)
                }
            };
            if reported.is_ok() {
                self.journal.reported = true;
                self.journal.completed(Step::ReportResult);
            }
        }

        let _ = self.workspace.retire_worktree(outcome.keeps_worktree());
        self.journal.completed(Step::RetireWorktree);

        Completed {
            outcome,
            journal: self.journal,
            detail,
        }
    }

    fn step(&mut self, step: Step) {
        self.journal.completed(step);
    }

    /// Refuses to go on when the operator cancelled or ownership became
    /// uncertain. Checked between steps because the expensive ones are in
    /// the middle, and because every step after this point has a side
    /// effect.
    /// VI: Từ chối đi tiếp khi người vận hành đã hủy hoặc quyền sở hữu không
    /// VI: còn chắc chắn. Kiểm giữa các bước vì những bước tốn kém nằm ở giữa,
    /// VI: và vì mọi bước sau điểm này đều có side effect.
    fn guard(&self) -> Result<(), RunFailure> {
        if self.control.cancel_requested() {
            return Err(RunFailure::Cancelled);
        }
        if self.lease.ownership_is_uncertain() {
            return Err(RunFailure::LeaseLost);
        }
        Ok(())
    }

    /// Renews the lease if one is due, and stops the run if ownership has
    /// become uncertain or the budget is nearly spent.
    /// VI: Gia hạn lease nếu tới hạn, và dừng run nếu quyền sở hữu không còn
    /// VI: chắc chắn hoặc budget sắp hết.
    fn beat(&mut self, progress: Option<&str>) -> Result<(), RunFailure> {
        let elapsed = std::time::Duration::from_secs(self.control.elapsed_seconds());
        match self.lease.decide(elapsed, progress.is_some()) {
            Decision::StopUncertain => return Err(RunFailure::LeaseLost),
            Decision::BudgetNearlySpent => {
                // Which way a budget-bound run is wound up is G1 and has not
                // been decided, so the only behaviour here is to stop rather
                // than to pick one on the maintainer's behalf.
                // VI: Kết thúc một run chạm budget theo cách nào là G1 và chưa
                // VI: được chốt, nên ở đây chỉ dừng chứ không tự chọn thay
                // VI: người phụ trách.
                return Err(RunFailure::Reportable(
                    "the run reached the server's time budget".into(),
                ));
            }
            Decision::Heartbeat { with_progress } => {
                let key = format!("{}-beat-{}", self.issue, elapsed.as_secs());
                let line = if with_progress { progress } else { None };
                match self.server.heartbeat(line, &key) {
                    Ok(()) => self.lease.heartbeat_succeeded(elapsed, with_progress),
                    Err(RunFailure::LeaseLost) => return Err(RunFailure::LeaseLost),
                    Err(_) => self.lease.heartbeat_failed(),
                }
            }
            Decision::Continue => {}
        }
        Ok(())
    }
}

/// A tracker with the policy left unset, for callers that have not been told
/// which way to wind up a run that reaches the budget.
/// VI: Một tracker chưa đặt chính sách, dành cho bên gọi chưa được cho biết
/// VI: phải kết thúc thế nào với run chạm budget.
pub fn tracker_without_budget() -> LeaseTracker {
    LeaseTracker::new(None, BudgetPolicy::None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    #[derive(Default)]
    struct Recorder {
        calls: Vec<String>,
    }

    struct FakeServer {
        log: Rc<RefCell<Recorder>>,
        fail_on: Option<&'static str>,
        lease_lost_on: Option<&'static str>,
    }

    impl FakeServer {
        fn note(&mut self, what: &str) -> Result<(), RunFailure> {
            self.log.borrow_mut().calls.push(what.to_string());
            if self.lease_lost_on == Some(what) {
                return Err(RunFailure::LeaseLost);
            }
            if self.fail_on == Some(what) {
                return Err(RunFailure::Reportable(format!("{what} failed")));
            }
            Ok(())
        }
    }

    impl Server for FakeServer {
        fn read_context(&mut self, _issue: &str) -> Result<(), RunFailure> {
            self.note("read_context")
        }
        fn claim(&mut self, _issue: &str, _key: &str) -> Result<String, RunFailure> {
            self.note("claim")?;
            Ok("crun1".into())
        }
        fn heartbeat(&mut self, _progress: Option<&str>, _key: &str) -> Result<(), RunFailure> {
            self.note("heartbeat")
        }
        fn save_feature_docs(&mut self, _issue: &str, _key: &str) -> Result<(), RunFailure> {
            self.note("save_feature_docs")
        }
        fn read_issue_version(&mut self, _issue: &str) -> Result<i64, RunFailure> {
            self.note("read_issue_version")?;
            Ok(7)
        }
        fn record_schedule(
            &mut self,
            _issue: &str,
            _version: i64,
            _target: &str,
            _key: &str,
        ) -> Result<(), RunFailure> {
            self.note("record_schedule")
        }
        fn post_plan(&mut self, _issue: &str, _plan: &str, _key: &str) -> Result<(), RunFailure> {
            self.note("post_plan")
        }
        fn report(
            &mut self,
            outcome: Outcome,
            _summary: &str,
            _key: &str,
        ) -> Result<(), RunFailure> {
            self.note(match outcome {
                Outcome::AwaitingReview => "report:awaiting_review",
                Outcome::Failed => "report:failed",
                _ => "report:other",
            })
        }
        fn release(&mut self, _key: &str) -> Result<(), RunFailure> {
            self.note("release")
        }
    }

    struct FakeWorkspace {
        log: Rc<RefCell<Recorder>>,
        tests: Vec<TestOutcome>,
        commit: Option<String>,
        kept: Option<bool>,
    }

    impl Workspace for FakeWorkspace {
        fn verify(&mut self) -> Result<(), RunFailure> {
            self.log.borrow_mut().calls.push("verify".into());
            Ok(())
        }
        fn create_worktree(&mut self, _run: &str) -> Result<(), RunFailure> {
            self.log.borrow_mut().calls.push("create_worktree".into());
            Ok(())
        }
        fn run_approved_tests(&mut self) -> Result<Vec<TestOutcome>, RunFailure> {
            self.log
                .borrow_mut()
                .calls
                .push("run_approved_tests".into());
            Ok(self.tests.clone())
        }
        fn commit(&mut self, _message: &str) -> Result<Option<String>, RunFailure> {
            self.log.borrow_mut().calls.push("commit".into());
            Ok(self.commit.clone())
        }
        fn publish(&mut self) -> Result<Option<String>, RunFailure> {
            self.log.borrow_mut().calls.push("publish".into());
            Ok(Some("https://example.com/pr/1".into()))
        }
        fn retire_worktree(&mut self, keep: bool) -> Result<(), RunFailure> {
            self.kept = Some(keep);
            self.log.borrow_mut().calls.push(format!("retire:{keep}"));
            Ok(())
        }
    }

    struct FakeAgent {
        log: Rc<RefCell<Recorder>>,
    }

    impl Agent for FakeAgent {
        fn probe(&mut self) -> Result<(), RunFailure> {
            self.log.borrow_mut().calls.push("probe".into());
            Ok(())
        }
        fn review(&mut self) -> Result<Review, RunFailure> {
            self.log.borrow_mut().calls.push("review".into());
            Ok(Review {
                plan: "do the thing".into(),
                target_date: "2026-12-01".into(),
            })
        }
        fn implement(&mut self, _plan: &str) -> Result<String, RunFailure> {
            self.log.borrow_mut().calls.push("implement".into());
            Ok("did the thing".into())
        }
    }

    struct FakeControl {
        cancel: bool,
        elapsed: u64,
    }

    impl Control for FakeControl {
        fn cancel_requested(&self) -> bool {
            self.cancel
        }
        fn elapsed_seconds(&self) -> u64 {
            self.elapsed
        }
    }

    struct Harness {
        log: Rc<RefCell<Recorder>>,
        server: FakeServer,
        workspace: FakeWorkspace,
        agent: FakeAgent,
        control: FakeControl,
    }

    fn harness() -> Harness {
        let log = Rc::new(RefCell::new(Recorder::default()));
        Harness {
            log: Rc::clone(&log),
            server: FakeServer {
                log: Rc::clone(&log),
                fail_on: None,
                lease_lost_on: None,
            },
            workspace: FakeWorkspace {
                log: Rc::clone(&log),
                tests: vec![TestOutcome {
                    name: "approved-local-test-1".into(),
                    passed: true,
                }],
                commit: Some("0123abc".into()),
                kept: None,
            },
            agent: FakeAgent { log },
            control: FakeControl {
                cancel: false,
                elapsed: 0,
            },
        }
    }

    fn run(harness: &mut Harness, publish: bool) -> Completed {
        Run {
            issue: "DTD-1".into(),
            publish,
            server: &mut harness.server,
            workspace: &mut harness.workspace,
            agent: &mut harness.agent,
            control: &harness.control,
            lease: tracker_without_budget(),
            journal: Entry::new("", "DTD-1", "cconn1", "claude"),
        }
        .execute()
    }

    #[test]
    fn a_clean_run_follows_the_documented_order() {
        let mut harness = harness();
        let completed = run(&mut harness, false);
        assert_eq!(completed.outcome, Outcome::AwaitingReview);

        let calls = harness.log.borrow().calls.clone();
        let ordered: Vec<&str> = calls
            .iter()
            .map(String::as_str)
            .filter(|call| *call != "heartbeat")
            .collect();
        assert_eq!(
            ordered,
            vec![
                "verify",
                "probe",
                "read_context",
                "claim",
                "create_worktree",
                "review",
                "save_feature_docs",
                "read_issue_version",
                "record_schedule",
                "post_plan",
                "implement",
                "run_approved_tests",
                "commit",
                "report:awaiting_review",
                "retire:false",
            ]
        );
    }

    #[test]
    fn the_issue_version_is_read_after_the_documents_are_saved() {
        // Saving a document bumps the version, so reading it earlier would
        // make the schedule update fail for the wrong reason.
        // VI: Lưu tài liệu làm tăng version, nên đọc sớm hơn sẽ khiến bước cập
        // VI: nhật lịch hỏng vì một lý do sai.
        let mut harness = harness();
        run(&mut harness, false);
        let calls = harness.log.borrow().calls.clone();
        let docs = calls.iter().position(|c| c == "save_feature_docs").unwrap();
        let version = calls
            .iter()
            .position(|c| c == "read_issue_version")
            .unwrap();
        let schedule = calls.iter().position(|c| c == "record_schedule").unwrap();
        assert!(docs < version && version < schedule);
    }

    #[test]
    fn nothing_is_claimed_when_the_machine_cannot_do_the_run() {
        struct Refusing;
        impl Workspace for Refusing {
            fn verify(&mut self) -> Result<(), RunFailure> {
                Err(RunFailure::Precondition("wrong checkout".into()))
            }
            fn create_worktree(&mut self, _: &str) -> Result<(), RunFailure> {
                panic!("must not reach the worktree")
            }
            fn run_approved_tests(&mut self) -> Result<Vec<TestOutcome>, RunFailure> {
                panic!("must not run tests")
            }
            fn commit(&mut self, _: &str) -> Result<Option<String>, RunFailure> {
                panic!("must not commit")
            }
            fn publish(&mut self) -> Result<Option<String>, RunFailure> {
                panic!("must not publish")
            }
            fn retire_worktree(&mut self, _: bool) -> Result<(), RunFailure> {
                Ok(())
            }
        }
        let mut harness = harness();
        let mut refusing = Refusing;
        let completed = Run {
            issue: "DTD-1".into(),
            publish: false,
            server: &mut harness.server,
            workspace: &mut refusing,
            agent: &mut harness.agent,
            control: &harness.control,
            lease: tracker_without_budget(),
            journal: Entry::new("", "DTD-1", "cconn1", "claude"),
        }
        .execute();

        assert_eq!(completed.outcome, Outcome::Failed);
        // Claiming is what takes the issue away from every other machine, so
        // a run that cannot succeed must not do it.
        // VI: Claim là thứ lấy issue khỏi tay mọi máy khác, nên một run không
        // VI: thể thành công thì không được làm điều đó.
        assert!(!harness.log.borrow().calls.iter().any(|c| c == "claim"));
    }

    #[test]
    fn a_failing_test_stops_before_the_commit_and_is_reported() {
        let mut harness = harness();
        harness.workspace.tests = vec![TestOutcome {
            name: "approved-local-test-1".into(),
            passed: false,
        }];
        let completed = run(&mut harness, false);

        assert_eq!(completed.outcome, Outcome::Failed);
        let calls = harness.log.borrow().calls.clone();
        assert!(!calls.iter().any(|c| c == "commit"));
        assert!(calls.iter().any(|c| c == "report:failed"));
        // The work stays on disk so a person can see what the agent did.
        // VI: Công việc ở lại trên đĩa để người ta xem được agent đã làm gì.
        assert_eq!(harness.workspace.kept, Some(true));
    }

    #[test]
    fn losing_ownership_reports_nothing_at_all() {
        let mut harness = harness();
        harness.server.lease_lost_on = Some("save_feature_docs");
        let completed = run(&mut harness, false);

        assert_eq!(completed.outcome, Outcome::StoppedUncertain);
        let calls = harness.log.borrow().calls.clone();
        // Writing a result it may no longer own could overwrite what another
        // connection already recorded.
        // VI: Ghi một kết quả có thể không còn thuộc về mình sẽ đè lên thứ một
        // VI: connection khác đã ghi.
        assert!(!calls.iter().any(|c| c.starts_with("report")));
        assert!(!calls.iter().any(|c| c == "release"));
        assert_eq!(harness.workspace.kept, Some(true));
    }

    #[test]
    fn cancelling_releases_rather_than_failing_the_run() {
        let mut harness = harness();
        harness.control.cancel = true;
        let completed = run(&mut harness, false);

        assert_eq!(completed.outcome, Outcome::Released);
        let calls = harness.log.borrow().calls.clone();
        // Nothing went wrong with the run, so it is handed back rather than
        // marked failed.
        // VI: Bản thân run không có gì sai, nên nó được trả lại chứ không bị
        // VI: đánh dấu thất bại.
        assert!(calls.iter().any(|c| c == "release"));
        assert!(!calls.iter().any(|c| c.starts_with("report")));
    }

    #[test]
    fn a_run_that_changed_nothing_is_not_presented_as_review_ready() {
        let mut harness = harness();
        harness.workspace.commit = None;
        let completed = run(&mut harness, false);
        assert_eq!(completed.outcome, Outcome::Failed);
        assert!(harness
            .log
            .borrow()
            .calls
            .iter()
            .any(|c| c == "report:failed"));
    }

    #[test]
    fn publishing_happens_only_when_it_is_allowed() {
        let mut allowed = harness();
        let mut withheld = harness();
        run(&mut withheld, false);
        assert!(!withheld.log.borrow().calls.iter().any(|c| c == "publish"));

        run(&mut allowed, true);
        let calls = allowed.log.borrow().calls.clone();
        let publish = calls.iter().position(|c| c == "publish").unwrap();
        let commit = calls.iter().position(|c| c == "commit").unwrap();
        let report = calls.iter().position(|c| c.starts_with("report")).unwrap();
        assert!(commit < publish && publish < report);
    }

    #[test]
    fn the_journal_records_what_happened_rather_than_what_was_intended() {
        let mut harness = harness();
        harness.workspace.tests = vec![TestOutcome {
            name: "approved-local-test-1".into(),
            passed: false,
        }];
        let completed = run(&mut harness, false);

        assert!(completed.journal.has_completed(Step::Claim));
        assert!(completed.journal.has_completed(Step::Implement));
        // The tests ran but did not pass, so the step is not recorded as done
        // and neither is the commit.
        // VI: Test đã chạy nhưng không đạt, nên bước đó không được ghi là xong,
        // VI: và commit cũng vậy.
        assert!(!completed.journal.has_completed(Step::RunApprovedTests));
        assert!(!completed.journal.has_completed(Step::Commit));
        assert!(completed.journal.reported);
    }

    #[test]
    fn a_retry_after_a_restart_reuses_the_key_it_already_sent() {
        let mut harness = harness();
        let mut journal = Entry::new("", "DTD-1", "cconn1", "claude");
        let first = journal.key_for("claim", "DTD-1-claim");
        let completed = Run {
            issue: "DTD-1".into(),
            publish: false,
            server: &mut harness.server,
            workspace: &mut harness.workspace,
            agent: &mut harness.agent,
            control: &harness.control,
            lease: tracker_without_budget(),
            journal,
        }
        .execute();
        // A fresh key after a lost response is how one claim becomes two.
        // VI: Một key mới sau khi mất response chính là cách một lần claim biến
        // VI: thành hai.
        assert_eq!(completed.journal.keys.get("claim"), Some(&first));
    }
}
