//! Keeping, and knowing when you have lost, the right to act on a run.
//!
//! The server hands out a five minute lease and expects a heartbeat to renew
//! it. Two things follow from that, and both are safety properties rather
//! than conveniences: the heartbeat interval must stay comfortably under the
//! lease, and the moment ownership becomes uncertain every side effect must
//! stop. An agent that keeps editing a repository after another connection
//! took the run produces work nobody asked for and a result the server will
//! refuse.
//! VI: Giữ, và biết khi nào đã mất, quyền hành động trên một run.
//! VI: Server cấp một lease năm phút và chờ heartbeat gia hạn. Hai điều rút ra
//! VI: từ đó, và cả hai là tính chất an toàn chứ không phải tiện nghi: chu kỳ
//! VI: heartbeat phải nằm dưới thời hạn lease một khoảng an toàn, và ngay khi
//! VI: quyền sở hữu trở nên không chắc chắn thì mọi side effect phải dừng. Một
//! VI: agent tiếp tục sửa repository sau khi connection khác đã lấy run sẽ tạo
//! VI: ra thứ không ai yêu cầu và một kết quả server sẽ từ chối.

use std::time::Duration;

/// The lease the server grants on claim and on every heartbeat.
/// VI: Thời hạn lease server cấp khi claim và ở mỗi heartbeat.
pub const SERVER_LEASE: Duration = Duration::from_secs(5 * 60);

/// How often the runner renews. Matches the Python runner, and leaves four
/// minutes of margin inside the five minute lease, which is what lets a few
/// slow or failed requests pass without losing the run.
/// VI: Tần suất runner gia hạn. Khớp với runner Python, và chừa bốn phút dự
/// VI: phòng trong lease năm phút, đó là thứ cho phép vài request chậm hoặc
/// VI: thất bại trôi qua mà không mất run.
pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(60);

/// The shortest gap between two heartbeats carrying a progress line, so a
/// busy agent cannot flood the server while the task still updates within
/// seconds.
/// VI: Khoảng cách ngắn nhất giữa hai heartbeat có mang dòng tiến độ, để một
/// VI: agent bận không dồn request lên server mà task vẫn cập nhật trong vài
/// VI: giây.
pub const PROGRESS_INTERVAL: Duration = Duration::from_secs(10);

/// Consecutive heartbeat failures tolerated before ownership is treated as
/// lost. One failure is a network blip; two in a row means the next write
/// could be racing another connection.
/// VI: Số lần heartbeat thất bại liên tiếp được bỏ qua trước khi coi như mất
/// VI: quyền sở hữu. Một lần là mạng chập chờn; hai lần liên tiếp nghĩa là
/// VI: lần ghi kế tiếp có thể đang tranh chấp với một connection khác.
pub const FAILURES_BEFORE_STOP: u32 = 2;

/// What the runner should do next about its lease.
/// VI: Điều runner nên làm tiếp với lease của mình.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// Keep working; no heartbeat is due.
    /// VI: Tiếp tục làm việc; chưa tới lúc heartbeat.
    Continue,
    /// Send a heartbeat now.
    /// VI: Gửi heartbeat ngay.
    Heartbeat { with_progress: bool },
    /// Stop before the next side effect: ownership is no longer certain.
    /// VI: Dừng trước side effect kế tiếp: quyền sở hữu không còn chắc chắn.
    StopUncertain,
    /// The run is approaching the server's wall-clock budget and must be
    /// handled deliberately rather than cut off mid-edit.
    /// VI: Run đang tiến gần giới hạn thời gian của server và phải được xử lý
    /// VI: có chủ ý thay vì bị cắt giữa lúc đang sửa.
    BudgetNearlySpent,
}

/// How a run that reaches the server's budget should be handled. The choice
/// is G1 in the desktop plan and has not been made yet, so the mechanism is
/// here and the policy is configuration.
/// VI: Cách xử lý một run chạm giới hạn thời gian của server. Lựa chọn này là
/// VI: G1 trong kế hoạch desktop và chưa được chốt, nên cơ chế nằm ở đây còn
/// VI: chính sách là cấu hình.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BudgetPolicy {
    /// Stop the run and report what was achieved.
    /// VI: Dừng run và báo lại những gì đã đạt được.
    StopAndReport,
    /// Release the run and claim it again, accepting a new run record.
    /// VI: Release run rồi claim lại, chấp nhận một bản ghi run mới.
    ReleaseAndReclaim,
    /// The server was configured without a budget for this connection.
    /// VI: Server được cấu hình không áp budget cho connection này.
    None,
}

/// Tracks the lease across a run. Time is passed in rather than read, so the
/// rules can be tested without waiting for real minutes to pass.
/// VI: Theo dõi lease suốt một run. Thời gian được truyền vào chứ không tự
/// VI: đọc, để kiểm thử các quy tắc mà không phải chờ hết từng phút thật.
#[derive(Debug)]
pub struct LeaseTracker {
    budget: Option<Duration>,
    policy: BudgetPolicy,
    consecutive_failures: u32,
    last_heartbeat: Duration,
    last_progress: Option<Duration>,
}

impl LeaseTracker {
    /// `budget` is the server's wall-clock limit for one run, measured from
    /// the claim.
    /// VI: `budget` là giới hạn thời gian của server cho một run, tính từ lúc
    /// VI: claim.
    pub fn new(budget: Option<Duration>, policy: BudgetPolicy) -> Self {
        Self {
            budget,
            policy,
            consecutive_failures: 0,
            last_heartbeat: Duration::ZERO,
            last_progress: None,
        }
    }

    pub fn policy(&self) -> BudgetPolicy {
        self.policy
    }

    /// Records that a heartbeat succeeded at `elapsed` since the claim.
    /// VI: Ghi nhận một heartbeat thành công tại thời điểm `elapsed` kể từ lúc
    /// VI: claim.
    pub fn heartbeat_succeeded(&mut self, elapsed: Duration, carried_progress: bool) {
        self.consecutive_failures = 0;
        self.last_heartbeat = elapsed;
        if carried_progress {
            self.last_progress = Some(elapsed);
        }
    }

    pub fn heartbeat_failed(&mut self) {
        self.consecutive_failures += 1;
    }

    pub fn ownership_is_uncertain(&self) -> bool {
        self.consecutive_failures >= FAILURES_BEFORE_STOP
    }

    /// Decides what to do at `elapsed` since the claim, given whether a new
    /// progress line is waiting to be sent.
    ///
    /// The budget is checked before the heartbeat: a run that is about to
    /// exceed its budget should be handled on purpose, not discover the
    /// problem through a rejected heartbeat halfway through an edit.
    /// VI: Quyết định phải làm gì tại thời điểm `elapsed` kể từ lúc claim, tuỳ
    /// VI: theo có dòng tiến độ mới đang chờ gửi hay không.
    /// VI: Budget được kiểm trước heartbeat: một run sắp vượt budget cần được
    /// VI: xử lý có chủ đích, chứ không phải phát hiện vấn đề qua một heartbeat
    /// VI: bị từ chối giữa lúc đang sửa file.
    pub fn decide(&self, elapsed: Duration, progress_waiting: bool) -> Decision {
        if self.ownership_is_uncertain() {
            return Decision::StopUncertain;
        }
        if let Some(budget) = self.budget {
            // One heartbeat interval of headroom, so the run is handled
            // before the server would start refusing.
            // VI: Chừa một chu kỳ heartbeat, để run được xử lý trước khi server
            // VI: bắt đầu từ chối.
            if elapsed + HEARTBEAT_INTERVAL >= budget && self.policy != BudgetPolicy::None {
                return Decision::BudgetNearlySpent;
            }
        }
        if elapsed.saturating_sub(self.last_heartbeat) >= HEARTBEAT_INTERVAL {
            return Decision::Heartbeat {
                with_progress: progress_waiting && self.progress_is_due(elapsed),
            };
        }
        // A new progress line is worth an early heartbeat, as long as the
        // throttle allows it: the task shows activity within seconds.
        // VI: Một dòng tiến độ mới đáng để heartbeat sớm, miễn là bộ điều tiết
        // VI: cho phép: task hiện hoạt động trong vài giây.
        if progress_waiting && self.progress_is_due(elapsed) {
            return Decision::Heartbeat {
                with_progress: true,
            };
        }
        Decision::Continue
    }

    fn progress_is_due(&self, elapsed: Duration) -> bool {
        match self.last_progress {
            None => true,
            Some(last) => elapsed.saturating_sub(last) >= PROGRESS_INTERVAL,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tracker() -> LeaseTracker {
        LeaseTracker::new(
            Some(Duration::from_secs(2 * 60 * 60)),
            BudgetPolicy::StopAndReport,
        )
    }

    #[test]
    fn the_heartbeat_interval_leaves_room_inside_the_lease() {
        // Four failed or slow heartbeats in a row still fit inside the lease,
        // which is what keeps a brief outage from losing the run.
        // VI: Bốn lần heartbeat chậm hoặc thất bại liên tiếp vẫn nằm gọn trong
        // VI: lease, đó là thứ giữ cho một lần mất mạng ngắn không làm mất run.
        assert!(HEARTBEAT_INTERVAL * 4 < SERVER_LEASE);
        assert!(PROGRESS_INTERVAL < HEARTBEAT_INTERVAL);
    }

    #[test]
    fn nothing_is_due_before_the_interval_passes() {
        let tracker = tracker();
        assert_eq!(
            tracker.decide(Duration::from_secs(30), false),
            Decision::Continue
        );
    }

    #[test]
    fn a_heartbeat_falls_due_on_the_interval() {
        let tracker = tracker();
        assert_eq!(
            tracker.decide(Duration::from_secs(60), false),
            Decision::Heartbeat {
                with_progress: false
            }
        );
    }

    #[test]
    fn a_new_progress_line_brings_the_heartbeat_forward() {
        let mut tracker = tracker();
        tracker.heartbeat_succeeded(Duration::from_secs(0), true);
        // Too soon after the last progress line.
        // VI: Quá sớm so với dòng tiến độ trước.
        assert_eq!(
            tracker.decide(Duration::from_secs(5), true),
            Decision::Continue
        );
        // Past the throttle, so the task can show activity without waiting a
        // full minute.
        // VI: Đã qua bộ điều tiết, nên task hiện được hoạt động mà không phải
        // VI: chờ trọn một phút.
        assert_eq!(
            tracker.decide(Duration::from_secs(11), true),
            Decision::Heartbeat {
                with_progress: true
            }
        );
    }

    #[test]
    fn one_failure_is_tolerated_and_two_stop_the_run() {
        let mut tracker = tracker();
        tracker.heartbeat_failed();
        assert!(!tracker.ownership_is_uncertain());
        assert_eq!(
            tracker.decide(Duration::from_secs(30), false),
            Decision::Continue
        );

        tracker.heartbeat_failed();
        assert!(tracker.ownership_is_uncertain());
        assert_eq!(
            tracker.decide(Duration::from_secs(30), false),
            Decision::StopUncertain
        );
    }

    #[test]
    fn a_success_clears_the_failure_count() {
        let mut tracker = tracker();
        tracker.heartbeat_failed();
        tracker.heartbeat_succeeded(Duration::from_secs(60), false);
        tracker.heartbeat_failed();
        assert!(!tracker.ownership_is_uncertain());
    }

    #[test]
    fn the_budget_is_handled_before_the_server_would_refuse() {
        let tracker = tracker();
        let budget = Duration::from_secs(2 * 60 * 60);
        // Comfortably inside: ordinary heartbeat behaviour.
        // VI: Còn dư dả: hành vi heartbeat bình thường.
        assert!(matches!(
            tracker.decide(budget - Duration::from_secs(600), false),
            Decision::Heartbeat { .. }
        ));
        // Within one heartbeat of the limit: handled deliberately instead of
        // being cut off by a rejected heartbeat mid-edit.
        // VI: Chỉ còn trong vòng một chu kỳ heartbeat: được xử lý có chủ đích
        // VI: thay vì bị cắt bởi một heartbeat bị từ chối giữa lúc đang sửa.
        assert_eq!(
            tracker.decide(budget - Duration::from_secs(30), false),
            Decision::BudgetNearlySpent
        );
    }

    #[test]
    fn losing_ownership_outranks_the_budget() {
        let mut tracker = tracker();
        tracker.heartbeat_failed();
        tracker.heartbeat_failed();
        let budget = Duration::from_secs(2 * 60 * 60);
        assert_eq!(
            tracker.decide(budget - Duration::from_secs(30), false),
            Decision::StopUncertain
        );
    }

    #[test]
    fn a_connection_without_a_budget_never_reports_one() {
        let tracker = LeaseTracker::new(None, BudgetPolicy::None);
        assert!(matches!(
            tracker.decide(Duration::from_secs(10 * 60 * 60), false),
            Decision::Heartbeat { .. }
        ));
    }
}
