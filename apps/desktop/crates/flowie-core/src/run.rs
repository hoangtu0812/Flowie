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

use std::path::{Path, PathBuf};

use crate::journal::Entry;
use crate::lease::{BudgetPolicy, Decision, LeaseTracker};
use crate::sequence::{Outcome, Step};

/// Which of a feature's two documents a draft is.
/// VI: Bản nháp thuộc tài liệu nào trong hai tài liệu của một tính năng.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocType {
    /// Behaviour, rules, acceptance criteria.
    /// VI: Hành vi, quy tắc, tiêu chí chấp nhận.
    Fds,
    /// Design, data, API, tests.
    /// VI: Thiết kế, dữ liệu, API, kiểm thử.
    Tds,
}

impl DocType {
    /// The name the server's document tree uses.
    /// VI: Tên mà cây tài liệu của server dùng.
    pub fn as_str(self) -> &'static str {
        match self {
            DocType::Fds => "FDS",
            DocType::Tds => "TDS",
        }
    }
}

/// Smallest and largest each field of a draft may be, mirroring what the
/// server accepts.
///
/// Checked here so a draft the server would reject stops the run before it is
/// sent: the alternative is discovering it mid-run, after the issue has been
/// claimed and the agent has already done the reading.
/// VI: Giới hạn nhỏ nhất và lớn nhất cho từng trường của một bản nháp, theo
/// VI: đúng những gì server chấp nhận.
/// VI: Kiểm ở đây để một bản nháp server sẽ từ chối bị dừng trước khi gửi:
/// VI: cách còn lại là phát hiện giữa chừng, sau khi issue đã bị claim và agent
/// VI: đã đọc xong.
pub const DOC_NAME_LIMITS: (usize, usize) = (2, 120);
pub const DOC_CONTENT_LIMITS: (usize, usize) = (1, 95_000);
pub const DOC_SUMMARY_LIMITS: (usize, usize) = (3, 500);

/// One feature document as the reviewing pass drafted it.
/// VI: Một tài liệu tính năng đúng như lượt review đã soạn.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeatureDoc {
    pub module: String,
    pub feature: String,
    pub doc_type: DocType,
    pub content: String,
    pub change_summary: String,
}

impl FeatureDoc {
    /// Rejects a draft the server would reject, naming the field at fault.
    ///
    /// Lengths are counted in characters rather than bytes, because the
    /// documents are written in Vietnamese as often as in English and a byte
    /// count would refuse a document well inside the real limit.
    /// VI: Từ chối một bản nháp mà server sẽ từ chối, nêu rõ trường nào sai.
    /// VI: Độ dài đếm theo ký tự chứ không theo byte, vì tài liệu được viết
    /// VI: bằng tiếng Việt không kém gì tiếng Anh, và đếm theo byte sẽ từ chối
    /// VI: một tài liệu còn nằm trong giới hạn thật.
    pub fn validate(&self) -> Result<(), String> {
        let fields = [
            ("module", &self.module, DOC_NAME_LIMITS),
            ("feature", &self.feature, DOC_NAME_LIMITS),
            ("content", &self.content, DOC_CONTENT_LIMITS),
            ("changeSummary", &self.change_summary, DOC_SUMMARY_LIMITS),
        ];
        for (name, value, (least, most)) in fields {
            let length = value.chars().count();
            if !(least..=most).contains(&length) {
                return Err(format!(
                    "{name} must be {least} to {most} characters, got {length}"
                ));
            }
        }
        Ok(())
    }
}

/// What the agent produced during the read-only pass.
/// VI: Những gì agent tạo ra trong lượt chỉ đọc.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Review {
    pub plan: String,
    pub target_date: String,
    /// The FDS and TDS of every feature this change touches, as full updated
    /// Markdown. Empty is legitimate and means the change alters no documented
    /// behaviour or design, which the plan is expected to say.
    /// VI: FDS và TDS của mọi tính năng mà thay đổi này chạm tới, dưới dạng
    /// VI: Markdown đầy đủ đã cập nhật. Rỗng là hợp lệ và nghĩa là thay đổi
    /// VI: không làm đổi hành vi hay thiết kế nào đã tài liệu hoá, điều mà kế
    /// VI: hoạch phải nói rõ.
    pub feature_docs: Vec<FeatureDoc>,
}

/// One executed check, carrying everything the result contract requires of
/// it.
///
/// A name and a verdict alone cannot be audited, and the server rejects
/// evidence that arrives without the command, the exit code, the duration and
/// a log tail. Those travel through the port instead of being left behind,
/// because an adapter cannot invent evidence it never received, and a run that
/// cannot report its checks cannot be recorded as review-ready at all.
/// VI: Một lần kiểm tra đã chạy, mang theo mọi thứ hợp đồng kết quả đòi hỏi.
/// VI: Chỉ có tên và kết luận thì không kiểm toán được, và server từ chối bằng
/// VI: chứng thiếu lệnh, exit code, thời lượng và phần đuôi log. Những thứ đó
/// VI: đi qua cổng chứ không bị bỏ lại, vì một adapter không thể bịa ra bằng
/// VI: chứng nó chưa từng nhận, và một run không báo được các bài kiểm tra của
/// VI: nó thì không được ghi là sẵn sàng review.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TestOutcome {
    pub name: String,
    pub command: Vec<String>,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub log: String,
}

impl TestOutcome {
    /// Passing is the exit code being zero, never a flag stored beside it: a
    /// flag can contradict the code it is meant to summarise, and a result
    /// claiming success over a non-zero exit is exactly the contradiction the
    /// server refuses.
    /// VI: Đạt nghĩa là exit code bằng không, không bao giờ là một cờ lưu riêng
    /// VI: bên cạnh: một cờ có thể mâu thuẫn với exit code mà nó định tóm tắt,
    /// VI: và một kết quả khẳng định thành công trên một exit code khác không
    /// VI: chính là mâu thuẫn server từ chối.
    pub fn passed(&self) -> bool {
        self.exit_code == 0
    }
}

/// What a run has to show for itself, gathered as it goes.
///
/// The server refuses to record work as review-ready without a commit and at
/// least one passing check behind it, so this travels with the run to the
/// report rather than being reconstructed at the end from information that is
/// no longer in scope. It is filled in as each step succeeds, which also means
/// a run that ends early still reports the evidence it did manage to produce.
/// VI: Những gì một run có để trình ra, được thu lại dần trong lúc chạy.
/// VI: Server từ chối ghi công việc là sẵn sàng review khi phía sau không có
/// VI: commit và ít nhất một bài kiểm tra đạt, nên dữ liệu này đi cùng run tới
/// VI: lúc báo kết quả chứ không bị dựng lại ở phút cuối từ những thông tin đã
/// VI: ra khỏi tầm. Nó được điền dần mỗi khi một bước thành công, nhờ vậy một
/// VI: run kết thúc sớm vẫn báo được phần bằng chứng nó đã kịp tạo ra.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Achievement {
    pub commit: Option<String>,
    pub pull_request_url: Option<String>,
    pub tests: Vec<TestOutcome>,
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
    /// Saves the drafts the reviewing pass produced. An empty slice is a
    /// legitimate call: it says the change altered no documented behaviour.
    /// VI: Lưu các bản nháp mà lượt review tạo ra. Một slice rỗng là lời gọi
    /// VI: hợp lệ: nó nói rằng thay đổi không làm đổi hành vi nào đã tài liệu
    /// VI: hoá.
    fn save_feature_docs(
        &mut self,
        issue: &str,
        docs: &[FeatureDoc],
        key: &str,
    ) -> Result<(), RunFailure>;
    fn read_issue_version(&mut self, issue: &str) -> Result<i64, RunFailure>;
    fn record_schedule(
        &mut self,
        issue: &str,
        version: i64,
        target_date: &str,
        key: &str,
    ) -> Result<(), RunFailure>;
    fn post_plan(&mut self, issue: &str, plan: &str, key: &str) -> Result<(), RunFailure>;
    /// Reports the ending. `achieved` is what the run produced, which the
    /// server requires for a review-ready result and will not accept without.
    /// VI: Báo kết cục. `achieved` là những gì run tạo ra, thứ server đòi hỏi
    /// VI: cho một kết quả sẵn sàng review và không nhận nếu thiếu.
    fn report(
        &mut self,
        outcome: Outcome,
        summary: &str,
        achieved: &Achievement,
        key: &str,
    ) -> Result<(), RunFailure>;
    fn release(&mut self, key: &str) -> Result<(), RunFailure>;
}

/// What the run needs from the checkout.
/// VI: Những gì run cần từ checkout.
pub trait Workspace {
    fn verify(&mut self) -> Result<(), RunFailure>;
    /// Cuts the working copy for this run and says where it is. The agent
    /// has to be told where to work, and nothing else in the run knows.
    /// VI: Cắt bản làm việc cho run này và cho biết nó ở đâu. Agent phải
    /// VI: được cho biết làm việc ở đâu, và không phần nào khác của run biết điều đó.
    fn create_worktree(&mut self, run_id: &str) -> Result<PathBuf, RunFailure>;
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
    fn review(&mut self, worktree: &Path) -> Result<Review, RunFailure>;
    fn implement(&mut self, worktree: &Path, plan: &str) -> Result<String, RunFailure>;
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
        // Held here rather than on `Run` so the caller is not made to supply
        // an empty one, and so every ending has the same view of what the run
        // actually produced.
        // VI: Giữ ở đây chứ không đặt trên `Run` để bên gọi không phải truyền
        // VI: vào một giá trị rỗng, và để mọi kết cục cùng thấy một bức tranh
        // VI: về những gì run thật sự tạo ra.
        let mut achieved = Achievement::default();
        match self.drive(&mut achieved) {
            Ok(summary) => self.finish(Outcome::AwaitingReview, Some(summary), achieved),
            Err(RunFailure::LeaseLost) => self.finish(Outcome::StoppedUncertain, None, achieved),
            Err(RunFailure::Cancelled) => self.finish(Outcome::Released, None, achieved),
            // A precondition is not proof that nothing was claimed. Most of
            // them do arrive during the read-only checks, but a credential
            // revoked or a scope withdrawn part way through reads as one too,
            // and so does a step needing a lease the connection no longer
            // holds. Deciding from the failure alone would end a claimed run
            // without reporting it and without retiring its worktree, leaving
            // the work on disk and the task held until the lease expired.
            // `finish` reads the journal, which knows whether the claim
            // actually happened.
            // VI: Một precondition không chứng minh được là chưa claim gì. Phần
            // VI: lớn chúng xuất hiện ở các bước chỉ đọc, nhưng một credential
            // VI: bị thu hồi hay một scope bị rút giữa chừng cũng đọc ra như
            // VI: vậy, và một bước cần lease mà kết nối không còn giữ cũng thế.
            // VI: Quyết định chỉ dựa theo loại thất bại sẽ kết thúc một run đã
            // VI: claim mà không báo kết quả và không dọn worktree, để công việc
            // VI: nằm lại trên đĩa và task bị giữ tới khi lease hết hạn.
            // VI: `finish` đọc journal, thứ biết rõ claim đã xảy ra hay chưa.
            Err(RunFailure::Precondition(detail)) | Err(RunFailure::Reportable(detail)) => {
                self.finish(Outcome::Failed, Some(detail), achieved)
            }
        }
    }

    fn drive(&mut self, achieved: &mut Achievement) -> Result<String, RunFailure> {
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
        let worktree = self.workspace.create_worktree(&run_id)?;
        self.step(Step::CreateWorktree);

        self.beat(Some("Reviewing the issue (read-only)"))?;
        let review = self.agent.review(&worktree)?;
        self.step(Step::Review);

        self.guard()?;
        // Validated before anything is sent, so a draft the server would
        // refuse stops the run here with the field named, rather than part way
        // through saving a set of documents.
        // VI: Kiểm trước khi gửi bất cứ thứ gì, để một bản nháp server sẽ từ
        // VI: chối làm run dừng ngay tại đây kèm tên trường sai, thay vì dừng
        // VI: khi đang lưu dở một bộ tài liệu.
        for draft in &review.feature_docs {
            if let Err(detail) = draft.validate() {
                return Err(RunFailure::Reportable(format!(
                    "the {} draft for {}/{} is not valid: {detail}",
                    draft.doc_type.as_str(),
                    draft.module,
                    draft.feature
                )));
            }
        }
        let key = self
            .journal
            .key_for("feature-docs", &format!("{}-docs", self.issue));
        self.server
            .save_feature_docs(&self.issue, &review.feature_docs, &key)?;
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
        let summary = self.agent.implement(&worktree, &review.plan)?;
        self.step(Step::Implement);

        self.guard()?;
        self.beat(Some("Running approved tests"))?;
        let tests = self.workspace.run_approved_tests()?;
        // Recorded before the verdict is examined, so a run that stops on a
        // failing check still reports what it ran: the evidence is the most
        // useful thing a person gets out of that ending.
        // VI: Ghi lại trước khi xét kết luận, để một run dừng vì kiểm tra hỏng
        // VI: vẫn báo được nó đã chạy gì: bằng chứng chính là thứ hữu ích nhất
        // VI: một người nhận được từ kết cục đó.
        achieved.tests = tests.clone();
        if let Some(failed) = tests.iter().find(|test| !test.passed()) {
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
        achieved.commit = commit.clone();
        self.step(Step::Commit);

        if self.publish {
            // The address of what was published belongs in the result: it is
            // how a person reaches the work without being told to go looking
            // for it.
            // VI: Địa chỉ của thứ đã publish thuộc về kết quả: đó là cách một
            // VI: người tới được công việc mà không phải tự đi tìm.
            achieved.pull_request_url = self.workspace.publish()?;
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
    fn finish(
        mut self,
        outcome: Outcome,
        detail: Option<String>,
        achieved: Achievement,
    ) -> Completed {
        if outcome.reports_to_server() && self.journal.has_completed(Step::Claim) {
            let key = self
                .journal
                .key_for("report", &format!("{}-report", self.issue));
            let reported = match outcome {
                Outcome::Released => self.server.release(&key),
                other => self.server.report(
                    other,
                    detail.as_deref().unwrap_or("the run ended"),
                    &achieved,
                    &key,
                ),
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
        precondition_on: Option<&'static str>,
        /// What `report` was handed, so a test can assert the evidence
        /// survived the journey rather than only that a call happened.
        /// VI: Những gì `report` nhận được, để test khẳng định bằng chứng đã đi
        /// VI: tới đích chứ không chỉ khẳng định có một lời gọi.
        reported: Option<Achievement>,
        /// What `save_feature_docs` was handed, for the same reason.
        /// VI: Những gì `save_feature_docs` nhận được, cũng vì lý do đó.
        saved: Option<Vec<FeatureDoc>>,
    }

    impl FakeServer {
        fn note(&mut self, what: &str) -> Result<(), RunFailure> {
            self.log.borrow_mut().calls.push(what.to_string());
            if self.lease_lost_on == Some(what) {
                return Err(RunFailure::LeaseLost);
            }
            if self.precondition_on == Some(what) {
                // What a revoked credential or a withdrawn scope looks like
                // once translated, which can happen after the claim.
                // VI: Hình dạng của một credential bị thu hồi hay một scope bị
                // VI: rút sau khi đã dịch, điều có thể xảy ra sau khi claim.
                return Err(RunFailure::Precondition(format!("{what} refused")));
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
        fn save_feature_docs(
            &mut self,
            _issue: &str,
            docs: &[FeatureDoc],
            _key: &str,
        ) -> Result<(), RunFailure> {
            self.saved = Some(docs.to_vec());
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
            achieved: &Achievement,
            _key: &str,
        ) -> Result<(), RunFailure> {
            self.reported = Some(achieved.clone());
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
        fn create_worktree(&mut self, run: &str) -> Result<PathBuf, RunFailure> {
            self.log.borrow_mut().calls.push("create_worktree".into());
            Ok(PathBuf::from("worktrees").join(run))
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
        feature_docs: Vec<FeatureDoc>,
        /// Where the agent was told to work, so a test can check it was
        /// the worktree and not somewhere else.
        /// VI: Nơi agent được bảo làm việc, để test kiểm được đó là worktree chứ
        /// VI: không phải chỗ nào khác.
        worked_in: Option<PathBuf>,
    }

    impl Agent for FakeAgent {
        fn probe(&mut self) -> Result<(), RunFailure> {
            self.log.borrow_mut().calls.push("probe".into());
            Ok(())
        }
        fn review(&mut self, worktree: &Path) -> Result<Review, RunFailure> {
            // The agent is told where to work, and the path is the one the
            // workspace just cut rather than anything this double invented.
            // VI: Agent được cho biết làm việc ở đâu, và đường dẫn đó là thứ workspace
            // VI: vừa cắt ra chứ không phải thứ bản giả này tự bịa.
            self.worked_in = Some(worktree.to_path_buf());
            self.log.borrow_mut().calls.push("review".into());
            Ok(Review {
                plan: "do the thing".into(),
                target_date: "2026-12-01".into(),
                feature_docs: self.feature_docs.clone(),
            })
        }
        fn implement(&mut self, worktree: &Path, _plan: &str) -> Result<String, RunFailure> {
            self.worked_in = Some(worktree.to_path_buf());
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

    /// One executed check with the given exit code, so a test says only what
    /// it cares about.
    /// VI: Một bài kiểm tra đã chạy với exit code cho trước, để mỗi test chỉ
    /// VI: nói đúng điều nó quan tâm.
    /// A draft that passes every limit, which a test then spoils one field of.
    /// VI: Một bản nháp đạt mọi giới hạn, để test làm sai đúng một trường.
    fn draft() -> FeatureDoc {
        FeatureDoc {
            module: "Desktop".into(),
            feature: "Companion".into(),
            doc_type: DocType::Fds,
            content: "# Companion\n\nBehaviour.".into(),
            change_summary: "Describes the companion run.".into(),
        }
    }

    fn executed(exit_code: i32) -> TestOutcome {
        TestOutcome {
            name: "approved-local-test-1".into(),
            command: vec!["pnpm".into(), "test".into()],
            exit_code,
            duration_ms: 1_200,
            log: "ok".into(),
        }
    }

    fn harness() -> Harness {
        let log = Rc::new(RefCell::new(Recorder::default()));
        Harness {
            log: Rc::clone(&log),
            server: FakeServer {
                log: Rc::clone(&log),
                fail_on: None,
                lease_lost_on: None,
                precondition_on: None,
                reported: None,
                saved: None,
            },
            workspace: FakeWorkspace {
                log: Rc::clone(&log),
                tests: vec![executed(0)],
                commit: Some("0123abc".into()),
                kept: None,
            },
            agent: FakeAgent {
                log,
                feature_docs: vec![draft()],
                worked_in: None,
            },
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
            fn create_worktree(&mut self, _: &str) -> Result<PathBuf, RunFailure> {
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
        harness.workspace.tests = vec![executed(1)];
        let completed = run(&mut harness, false);

        assert_eq!(completed.outcome, Outcome::Failed);
        let calls = harness.log.borrow().calls.clone();
        assert!(!calls.iter().any(|c| c == "commit"));
        assert!(calls.iter().any(|c| c == "report:failed"));
        // The check that stopped the run is the most useful thing to hand
        // over, so it is reported rather than dropped.
        // VI: Bài kiểm tra đã làm run dừng là thứ hữu ích nhất để trao lại, nên
        // VI: nó được báo đi chứ không bị bỏ.
        let reported = harness.server.reported.clone().expect("a report was owed");
        assert_eq!(reported.tests, vec![executed(1)]);
        assert!(reported.commit.is_none(), "nothing was committed");
        // The work stays on disk so a person can see what the agent did.
        // VI: Công việc ở lại trên đĩa để người ta xem được agent đã làm gì.
        assert_eq!(harness.workspace.kept, Some(true));
    }

    #[test]
    fn a_credential_withdrawn_after_the_claim_is_still_reported_and_cleaned_up() {
        // A revoked credential or a withdrawn scope reads as a precondition,
        // and so does a step needing a lease the connection no longer holds.
        // Treating every precondition as "nothing was claimed" would end a
        // claimed run silently and leave its worktree behind.
        // VI: Một credential bị thu hồi hay một scope bị rút đọc ra như một
        // VI: precondition, và một bước cần lease mà kết nối không còn giữ cũng
        // VI: vậy. Coi mọi precondition là "chưa claim gì" sẽ kết thúc một run
        // VI: đã claim trong im lặng và bỏ lại worktree của nó.
        let mut harness = harness();
        harness.server.precondition_on = Some("post_plan");
        let completed = run(&mut harness, false);

        assert_eq!(completed.outcome, Outcome::Failed);
        let calls = harness.log.borrow().calls.clone();
        assert!(calls.iter().any(|c| c == "claim"), "the run did claim");
        assert!(
            calls.iter().any(|c| c == "report:failed"),
            "a claimed run owes the server a result: {calls:?}"
        );
        // The work stays on disk, but the worktree is accounted for rather
        // than abandoned without a decision.
        // VI: Công việc ở lại trên đĩa, nhưng worktree được xử lý đàng hoàng chứ
        // VI: không bị bỏ mặc mà không có quyết định nào.
        assert_eq!(harness.workspace.kept, Some(true));
        assert!(completed.journal.reported);
    }

    #[test]
    fn a_precondition_before_the_claim_still_tells_the_server_nothing() {
        // The other half of the same rule: nothing was claimed, so there is no
        // result the server is owed.
        // VI: Nửa còn lại của cùng quy tắc: chưa claim gì nên server không được
        // VI: nợ kết quả nào.
        let mut harness = harness();
        harness.server.precondition_on = Some("read_context");
        let completed = run(&mut harness, false);

        assert_eq!(completed.outcome, Outcome::Failed);
        let calls = harness.log.borrow().calls.clone();
        assert!(!calls.iter().any(|c| c == "claim"));
        assert!(!calls.iter().any(|c| c.starts_with("report")));
        assert!(!completed.journal.reported);
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
    fn a_review_ready_report_carries_what_the_server_requires_of_it() {
        // The server refuses a review-ready result without a commit and at
        // least one passing check. Reporting the outcome alone would mean
        // every clean run was rejected at the last step and then recorded as
        // failed, which is the worst possible reading of a run that worked.
        // VI: Server từ chối một kết quả sẵn sàng review nếu thiếu commit và ít
        // VI: nhất một bài kiểm tra đạt. Chỉ báo kết cục thôi thì mọi run sạch
        // VI: sẽ đều bị từ chối ở bước cuối rồi bị ghi là thất bại, cách hiểu
        // VI: tệ nhất có thể về một run đã chạy đúng.
        let mut harness = harness();
        let completed = run(&mut harness, true);
        assert_eq!(completed.outcome, Outcome::AwaitingReview);

        let reported = harness.server.reported.clone().expect("a report was owed");
        assert_eq!(reported.commit.as_deref(), Some("0123abc"));
        assert_eq!(
            reported.pull_request_url.as_deref(),
            Some("https://example.com/pr/1")
        );
        assert_eq!(reported.tests.len(), 1);
        assert!(reported.tests.iter().all(TestOutcome::passed));
    }

    #[test]
    fn a_run_that_was_not_published_reports_no_address_for_it() {
        // Inventing a pull request address for work that was never published
        // would send a person to something that does not exist.
        // VI: Bịa ra một địa chỉ pull request cho công việc chưa publish sẽ đẩy
        // VI: người dùng tới một thứ không tồn tại.
        let mut harness = harness();
        run(&mut harness, false);
        let reported = harness.server.reported.clone().expect("a report was owed");
        assert!(reported.pull_request_url.is_none());
        assert_eq!(reported.commit.as_deref(), Some("0123abc"));
    }

    #[test]
    fn the_agent_is_told_where_the_workspace_cut_the_working_copy() {
        // The agent has to work somewhere, and the only place that is correct
        // is the worktree this run was given. Before this the path travelled
        // outside the ports, which meant the two adapters had to agree about
        // it without the run ever saying so.
        // VI: Agent phải làm việc ở đâu đó, và nơi duy nhất đúng là worktree mà
        // VI: run này được cấp. Trước đây đường dẫn đi vòng ngoài các cổng,
        // VI: nghĩa là hai adapter phải tự thống nhất với nhau mà run không hề
        // VI: nói ra điều đó.
        let mut harness = harness();
        let completed = run(&mut harness, false);
        assert_eq!(completed.outcome, Outcome::AwaitingReview);
        assert_eq!(
            harness.agent.worked_in,
            Some(PathBuf::from("worktrees").join("crun1")),
            "the agent worked in the worktree the workspace cut"
        );
    }

    #[test]
    fn the_drafts_the_review_produced_are_the_ones_saved() {
        // The port used to receive no drafts at all, which left nothing to
        // save and made the step a call that could only ever do nothing.
        // VI: Cổng này trước đây không nhận bản nháp nào, nên không có gì để
        // VI: lưu và bước đó chỉ là một lời gọi mãi mãi không làm gì.
        let mut harness = harness();
        let completed = run(&mut harness, false);
        assert_eq!(completed.outcome, Outcome::AwaitingReview);
        assert_eq!(harness.server.saved, Some(vec![draft()]));
    }

    #[test]
    fn a_change_that_documents_nothing_still_saves_an_empty_set() {
        // An empty list is a legitimate answer, not a missing one: it says the
        // change altered no documented behaviour. The step still runs so the
        // journal records it, and so the server sees the decision.
        // VI: Danh sách rỗng là một câu trả lời hợp lệ chứ không phải câu trả
        // VI: lời thiếu: nó nói rằng thay đổi không làm đổi hành vi nào đã tài
        // VI: liệu hoá. Bước này vẫn chạy để journal ghi lại, và để server thấy
        // VI: được quyết định đó.
        let mut harness = harness();
        harness.agent.feature_docs = vec![];
        let completed = run(&mut harness, false);
        assert_eq!(completed.outcome, Outcome::AwaitingReview);
        assert_eq!(harness.server.saved, Some(vec![]));
        assert!(completed.journal.has_completed(Step::SaveFeatureDocs));
    }

    #[test]
    fn a_draft_the_server_would_refuse_stops_the_run_before_it_is_sent() {
        // Sending it would fail part way through a set of documents, leaving
        // some saved and some not, and the complaint would arrive from the
        // server rather than naming the field here.
        // VI: Gửi đi sẽ hỏng khi đang lưu dở một bộ tài liệu, để một phần được
        // VI: lưu và một phần không, và lời phàn nàn sẽ tới từ server chứ không
        // VI: nêu tên trường sai ngay ở đây.
        let mut harness = harness();
        let mut spoiled = draft();
        spoiled.change_summary = "no".into(); // below the 3-character minimum
        harness.agent.feature_docs = vec![spoiled];

        let completed = run(&mut harness, false);
        assert_eq!(completed.outcome, Outcome::Failed);
        assert!(harness.server.saved.is_none(), "nothing may be sent");
        let detail = completed.detail.unwrap_or_default();
        assert!(detail.contains("changeSummary"), "got {detail}");
        assert!(detail.contains("FDS"), "the document is named: {detail}");
    }

    #[test]
    fn every_draft_field_has_its_limits_enforced() {
        /// Spoils one field of an otherwise valid draft.
        /// VI: Làm sai một trường của bản nháp vốn hợp lệ.
        type Spoil = fn(&mut FeatureDoc);

        let long = "x".repeat(200);
        let cases: [(&str, Spoil, &str); 6] = [
            ("module too short", |d| d.module = "a".into(), "module"),
            ("module too long", |d| d.module = "x".repeat(121), "module"),
            (
                "feature too short",
                |d| d.feature = String::new(),
                "feature",
            ),
            ("content empty", |d| d.content = String::new(), "content"),
            (
                "summary too short",
                |d| d.change_summary = "ab".into(),
                "changeSummary",
            ),
            (
                "summary too long",
                |d| d.change_summary = "y".repeat(501),
                "changeSummary",
            ),
        ];
        for (what, spoil, field) in cases {
            let mut doc = draft();
            spoil(&mut doc);
            let error = doc.validate().unwrap_err();
            assert!(error.contains(field), "{what}: got {error}");
        }
        // A valid draft at the edges is accepted rather than refused.
        // VI: Một bản nháp hợp lệ ở sát giới hạn được chấp nhận chứ không bị từ
        // VI: chối.
        let mut edge = draft();
        edge.module = "ab".into();
        edge.change_summary = "abc".into();
        edge.content = long;
        assert!(edge.validate().is_ok());
    }

    #[test]
    fn draft_limits_are_counted_in_characters_not_bytes() {
        // Vietnamese text costs up to three bytes a character, so a byte count
        // would refuse a document well inside the real limit.
        // VI: Chữ tiếng Việt tốn tới ba byte một ký tự, nên đếm theo byte sẽ từ
        // VI: chối một tài liệu còn nằm trong giới hạn thật.
        let mut doc = draft();
        doc.change_summary = "Mô tả thay đổi tài liệu. ".repeat(16);
        let (_, most) = DOC_SUMMARY_LIMITS;
        assert!(
            doc.change_summary.chars().count() <= most,
            "inside the limit in characters"
        );
        assert!(
            doc.change_summary.len() > most,
            "but over it in bytes, which is the point"
        );
        assert!(doc.validate().is_ok(), "a byte count would refuse this");
    }

    #[test]
    fn passing_is_decided_by_the_exit_code_alone() {
        // A verdict stored beside the exit code can contradict it, and the
        // server rejects a success reported over a non-zero exit.
        // VI: Một kết luận lưu cạnh exit code có thể mâu thuẫn với nó, và server
        // VI: từ chối một thành công báo trên exit code khác không.
        assert!(executed(0).passed());
        assert!(!executed(1).passed());
        assert!(!executed(-1).passed());
    }

    #[test]
    fn the_journal_records_what_happened_rather_than_what_was_intended() {
        let mut harness = harness();
        harness.workspace.tests = vec![executed(1)];
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
