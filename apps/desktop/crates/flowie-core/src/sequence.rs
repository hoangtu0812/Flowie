//! The order a run happens in.
//!
//! The order is not arbitrary and it is not a style choice; each position
//! prevents a specific failure, and the Python runner arrived at it by
//! hitting those failures. Writing it down as data rather than as control
//! flow means a test can assert the order, and a reader can see why a step
//! sits where it does.
//! VI: Thứ tự diễn ra của một run.
//! VI: Thứ tự này không tuỳ tiện và không phải lựa chọn hình thức; mỗi vị trí
//! VI: ngăn một thất bại cụ thể, và runner Python đi tới thứ tự này bằng cách
//! VI: đã gặp những thất bại đó. Viết nó thành dữ liệu thay vì thành luồng
//! VI: điều khiển cho phép một test khẳng định thứ tự, và người đọc thấy được
//! VI: vì sao một bước nằm ở chỗ của nó.

/// One step of a run, in the order it happens.
/// VI: Một bước của run, theo đúng thứ tự diễn ra.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// Verify the checkout and probe the provider. Everything else can write
    /// somewhere, so the checks that can only read come first: a run that
    /// cannot possibly succeed should not have claimed anything.
    /// VI: Đối chiếu checkout và probe provider. Mọi bước khác đều có thể ghi
    /// VI: ở đâu đó, nên các kiểm tra chỉ đọc đi trước: một run chắc chắn
    /// VI: không thể thành công thì không nên claim bất cứ thứ gì.
    VerifyEnvironment,
    /// Read the issue and its feature documents.
    /// VI: Đọc issue và tài liệu tính năng của nó.
    ReadContext,
    /// Claim the run and start the heartbeat alongside the work.
    /// VI: Claim run và chạy heartbeat song song với công việc.
    Claim,
    /// Cut the worktree this run will edit.
    /// VI: Cắt worktree mà run này sẽ sửa.
    CreateWorktree,
    /// A read-only pass that produces the plan and the target end date. It
    /// runs before any edit so the plan describes what will be done rather
    /// than what already was.
    /// VI: Một lượt chỉ đọc sinh ra kế hoạch và ngày kết thúc dự kiến. Nó chạy
    /// VI: trước mọi lần sửa để kế hoạch mô tả việc sắp làm chứ không phải việc
    /// VI: đã làm xong.
    Review,
    /// Save FDS/TDS before the plan comment, so the comment can name their
    /// versions, and before the code, so the code follows the documents.
    /// VI: Lưu FDS/TDS trước comment kế hoạch, để comment ghi được version của
    /// VI: chúng, và trước khi code, để code đi theo tài liệu.
    SaveFeatureDocs,
    /// Read the issue version. It is read here rather than earlier because
    /// saving the documents bumps it; reading it before would guarantee a
    /// stale version on the update below.
    /// VI: Đọc version của issue. Đọc ở đây chứ không sớm hơn vì việc lưu tài
    /// VI: liệu làm tăng version; đọc trước sẽ cầm chắc một version cũ khi
    /// VI: update bên dưới.
    ReadIssueVersion,
    /// Record the schedule with that version. A concurrent edit makes this
    /// fail, which stops the run before any code is touched.
    /// VI: Ghi lịch với version đó. Một chỉnh sửa đồng thời sẽ làm bước này
    /// VI: thất bại, và run dừng trước khi đụng tới code.
    RecordSchedule,
    /// Post the plan for a person to read.
    /// VI: Đăng kế hoạch để người đọc.
    PostPlan,
    /// Let the agent edit the worktree.
    /// VI: Để agent sửa worktree.
    Implement,
    /// Run the approved tests in order. A failure stops the run here.
    /// VI: Chạy các test đã duyệt theo thứ tự. Một test hỏng thì run dừng tại
    /// VI: đây.
    RunApprovedTests,
    /// Commit what the agent produced.
    /// VI: Commit thứ agent đã tạo ra.
    Commit,
    /// Push and open a pull request, only when publishing is enabled.
    /// VI: Push và mở pull request, chỉ khi quyền publish được bật.
    Publish,
    /// Report the result, which leaves the issue awaiting review.
    /// VI: Báo kết quả, để issue ở trạng thái chờ review.
    ReportResult,
    /// Remove or keep the worktree according to the policy.
    /// VI: Dọn hoặc giữ worktree theo chính sách.
    RetireWorktree,
}

impl Step {
    /// True when the step changes something outside this process: a server
    /// record, the repository, or the remote. After ownership of the run
    /// becomes uncertain, none of these may run.
    /// VI: Đúng khi bước này thay đổi thứ gì đó bên ngoài tiến trình: một bản
    /// VI: ghi trên server, repository, hay remote. Sau khi quyền sở hữu run
    /// VI: không còn chắc chắn, không bước nào trong số này được chạy.
    pub fn has_side_effect(self) -> bool {
        !matches!(
            self,
            Step::VerifyEnvironment | Step::ReadContext | Step::Review | Step::ReadIssueVersion
        )
    }
}

/// The full order, which is the order `orchestrator.execute` performs.
/// VI: Toàn bộ thứ tự, đúng bằng thứ tự `orchestrator.execute` thực hiện.
pub const ORDER: &[Step] = &[
    Step::VerifyEnvironment,
    Step::ReadContext,
    Step::Claim,
    Step::CreateWorktree,
    Step::Review,
    Step::SaveFeatureDocs,
    Step::ReadIssueVersion,
    Step::RecordSchedule,
    Step::PostPlan,
    Step::Implement,
    Step::RunApprovedTests,
    Step::Commit,
    Step::Publish,
    Step::ReportResult,
    Step::RetireWorktree,
];

/// The steps for one run, with `Publish` left out when publishing is off.
/// VI: Các bước cho một run, bỏ `Publish` khi quyền publish đang tắt.
pub fn plan(publish: bool) -> Vec<Step> {
    ORDER
        .iter()
        .copied()
        .filter(|step| publish || *step != Step::Publish)
        .collect()
}

/// Where a run stops when something goes wrong, which decides what is
/// reported.
/// VI: Nơi một run dừng lại khi có sự cố, điều này quyết định những gì được
/// VI: báo cáo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// Work was produced and checked; it waits for a person.
    /// VI: Công việc đã được tạo ra và kiểm tra; nó chờ một người.
    AwaitingReview,
    /// The run failed and the reason is reported to the server.
    /// VI: Run thất bại và lý do được báo về server.
    Failed,
    /// The operator cancelled; the run is released rather than marked failed,
    /// because nothing went wrong with it.
    /// VI: Người vận hành đã hủy; run được release chứ không đánh dấu thất
    /// VI: bại, vì bản thân nó không có gì sai.
    Released,
    /// Ownership became uncertain, so the runner stopped without reporting:
    /// writing a result it may no longer own could overwrite what another
    /// connection has already recorded.
    /// VI: Quyền sở hữu không còn chắc chắn nên runner dừng mà không báo kết
    /// VI: quả: ghi một kết quả có thể không còn thuộc về mình sẽ đè lên thứ
    /// VI: một connection khác đã ghi.
    StoppedUncertain,
}

impl Outcome {
    /// Whether the worktree keeps its contents. Only a clean success lets it
    /// go; every other ending leaves the work where a person can look at it.
    /// VI: Worktree có giữ lại nội dung không. Chỉ một lần thành công sạch sẽ
    /// VI: mới cho phép xoá; mọi kết cục khác đều để công việc ở nơi người ta
    /// VI: xem lại được.
    pub fn keeps_worktree(self) -> bool {
        self != Outcome::AwaitingReview
    }

    /// Whether the server is told a result. A runner that is no longer sure
    /// it owns the run stays silent.
    /// VI: Có báo kết quả cho server hay không. Một runner không còn chắc mình
    /// VI: sở hữu run thì giữ im lặng.
    pub fn reports_to_server(self) -> bool {
        self != Outcome::StoppedUncertain
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The order from `scripts/flowie_runner/orchestrator.py:118-265`,
    /// written out independently so a reordering of `ORDER` has to disagree
    /// with something rather than silently redefine what is correct.
    /// VI: Thứ tự lấy từ `orchestrator.py:118-265`, viết ra độc lập để một
    /// VI: lần đổi thứ tự trong `ORDER` buộc phải mâu thuẫn với cái gì đó,
    /// VI: thay vì âm thầm định nghĩa lại thế nào là đúng.
    const PYTHON_RUNNER_ORDER: &[&str] = &[
        "verify environment",
        "read context",
        "claim",
        "create worktree",
        "review",
        "save feature docs",
        "read issue version",
        "record schedule",
        "post plan",
        "implement",
        "run approved tests",
        "commit",
        "publish",
        "report result",
        "retire worktree",
    ];

    fn label(step: Step) -> &'static str {
        match step {
            Step::VerifyEnvironment => "verify environment",
            Step::ReadContext => "read context",
            Step::Claim => "claim",
            Step::CreateWorktree => "create worktree",
            Step::Review => "review",
            Step::SaveFeatureDocs => "save feature docs",
            Step::ReadIssueVersion => "read issue version",
            Step::RecordSchedule => "record schedule",
            Step::PostPlan => "post plan",
            Step::Implement => "implement",
            Step::RunApprovedTests => "run approved tests",
            Step::Commit => "commit",
            Step::Publish => "publish",
            Step::ReportResult => "report result",
            Step::RetireWorktree => "retire worktree",
        }
    }

    #[test]
    fn the_order_matches_the_python_runner() {
        let ours: Vec<&str> = ORDER.iter().map(|step| label(*step)).collect();
        assert_eq!(ours, PYTHON_RUNNER_ORDER);
    }

    #[test]
    fn documents_are_saved_before_the_plan_comment() {
        let order = plan(false);
        let docs = order
            .iter()
            .position(|s| *s == Step::SaveFeatureDocs)
            .unwrap();
        let comment = order.iter().position(|s| *s == Step::PostPlan).unwrap();
        assert!(docs < comment, "the comment must be able to name versions");
    }

    #[test]
    fn the_issue_version_is_read_after_the_documents_are_saved() {
        // Saving a document bumps the issue version, so reading it earlier
        // would guarantee a stale value on the update that follows.
        // VI: Lưu tài liệu làm tăng version của issue, nên đọc sớm hơn sẽ cầm
        // VI: chắc một giá trị cũ cho bước update ngay sau đó.
        let order = plan(false);
        let docs = order
            .iter()
            .position(|s| *s == Step::SaveFeatureDocs)
            .unwrap();
        let version = order
            .iter()
            .position(|s| *s == Step::ReadIssueVersion)
            .unwrap();
        let update = order
            .iter()
            .position(|s| *s == Step::RecordSchedule)
            .unwrap();
        assert!(docs < version && version < update);
    }

    #[test]
    fn review_happens_before_any_edit() {
        let order = plan(false);
        let review = order.iter().position(|s| *s == Step::Review).unwrap();
        let implement = order.iter().position(|s| *s == Step::Implement).unwrap();
        assert!(review < implement);
    }

    #[test]
    fn tests_run_before_the_commit_and_the_commit_before_the_report() {
        let order = plan(true);
        let tests = order
            .iter()
            .position(|s| *s == Step::RunApprovedTests)
            .unwrap();
        let commit = order.iter().position(|s| *s == Step::Commit).unwrap();
        let publish = order.iter().position(|s| *s == Step::Publish).unwrap();
        let report = order.iter().position(|s| *s == Step::ReportResult).unwrap();
        assert!(tests < commit && commit < publish && publish < report);
    }

    #[test]
    fn publishing_is_absent_unless_it_is_enabled() {
        assert!(!plan(false).contains(&Step::Publish));
        assert!(plan(true).contains(&Step::Publish));
    }

    #[test]
    fn the_read_only_steps_are_the_ones_with_no_side_effect() {
        let readonly: Vec<Step> = ORDER
            .iter()
            .copied()
            .filter(|step| !step.has_side_effect())
            .collect();
        assert_eq!(
            readonly,
            vec![
                Step::VerifyEnvironment,
                Step::ReadContext,
                Step::Review,
                Step::ReadIssueVersion
            ]
        );
    }

    #[test]
    fn only_a_clean_success_releases_the_worktree() {
        assert!(!Outcome::AwaitingReview.keeps_worktree());
        assert!(Outcome::Failed.keeps_worktree());
        assert!(Outcome::Released.keeps_worktree());
        assert!(Outcome::StoppedUncertain.keeps_worktree());
    }

    #[test]
    fn an_uncertain_stop_reports_nothing() {
        assert!(Outcome::AwaitingReview.reports_to_server());
        assert!(Outcome::Failed.reports_to_server());
        assert!(Outcome::Released.reports_to_server());
        assert!(!Outcome::StoppedUncertain.reports_to_server());
    }
}
