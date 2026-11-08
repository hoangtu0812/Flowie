//! How often the companion asks for work, and how it backs off when the
//! server cannot answer.
//!
//! There is no push channel, so every companion asks on a timer. That makes
//! the timing a server-side concern as much as a client one: a fleet of
//! machines that all poll on the same interval, and all fail together during
//! an outage, will come back in lockstep and arrive as one burst at the
//! moment the server is least able to take it. Jitter is what breaks that
//! convoy, and it matters more the more machines there are.
//! VI: Companion hỏi việc bao lâu một lần, và lùi lại thế nào khi server không
//! VI: trả lời được.
//! VI: Không có kênh push nên mọi companion đều hỏi theo đồng hồ. Điều đó khiến
//! VI: nhịp hỏi là chuyện của server chứ không chỉ của client: một đàn máy cùng
//! VI: poll theo một chu kỳ, cùng hỏng trong một lần sự cố, sẽ quay lại đồng
//! VI: loạt và ập tới thành một đợt đúng lúc server yếu nhất. Jitter là thứ phá
//! VI: vỡ đoàn đó, và càng nhiều máy thì nó càng quan trọng.

use std::time::Duration;

/// Longest the companion will wait between attempts, however many times it
/// has failed. Past this, a machine that has been offline for hours would
/// take hours to notice the server returned.
/// VI: Thời gian chờ dài nhất giữa hai lần thử, dù đã hỏng bao nhiêu lần.
/// VI: Vượt quá mức này thì một máy mất mạng vài giờ sẽ mất thêm vài giờ nữa
/// VI: mới nhận ra server đã trở lại.
pub const MAX_BACKOFF: Duration = Duration::from_secs(300);

/// How far a delay may be moved from its nominal value, as a percentage.
/// Enough to spread a fleet, small enough that the idle interval still means
/// what the person configured.
/// VI: Mức một khoảng chờ được phép lệch khỏi giá trị danh nghĩa, tính theo
/// VI: phần trăm. Đủ để rải một đàn máy, đủ nhỏ để chu kỳ lúc rảnh vẫn đúng
/// VI: nghĩa với thứ người dùng đã cấu hình.
pub const JITTER_PERCENT: u64 = 25;

/// Tracks how long to wait before asking again.
/// VI: Theo dõi phải chờ bao lâu trước khi hỏi lại.
#[derive(Debug, Clone)]
pub struct Schedule {
    base: Duration,
    failures: u32,
}

impl Schedule {
    /// `base` is the configured idle interval.
    /// VI: `base` là chu kỳ lúc rảnh đã cấu hình.
    pub fn new(base: Duration) -> Self {
        Self { base, failures: 0 }
    }

    /// The configured idle interval this schedule was built around, so a
    /// caller can notice the configuration changed without keeping its own
    /// copy and letting the two drift apart.
    /// VI: Chu kỳ lúc rảnh đã cấu hình mà lịch này được dựng quanh nó, để bên
    /// VI: gọi nhận ra cấu hình đã đổi mà không phải giữ bản sao riêng rồi để
    /// VI: hai bên lệch nhau.
    pub fn base(&self) -> Duration {
        self.base
    }

    pub fn failures(&self) -> u32 {
        self.failures
    }

    /// A successful exchange, whether or not it carried work. Resetting here
    /// rather than only when work arrives is deliberate: an idle queue is the
    /// server answering correctly, and treating it as a failure would back a
    /// quiet machine off to five minutes and make it slow to pick up the
    /// first run of the day.
    /// VI: Một lần trao đổi thành công, dù có mang về việc hay không. Reset ở
    /// VI: đây chứ không chỉ khi có việc là cố ý: hàng đợi rỗng nghĩa là server
    /// VI: đã trả lời đúng, và coi đó là thất bại sẽ đẩy một máy đang rảnh lùi
    /// VI: tới năm phút và khiến nó chậm nhận run đầu tiên trong ngày.
    pub fn succeeded(&mut self) {
        self.failures = 0;
    }

    pub fn failed(&mut self) {
        self.failures = self.failures.saturating_add(1);
    }

    /// The nominal wait before the next attempt, doubling per consecutive
    /// failure and capped.
    /// VI: Thời gian chờ danh nghĩa trước lần thử kế tiếp, nhân đôi theo mỗi
    /// VI: lần hỏng liên tiếp và có trần.
    pub fn nominal(&self) -> Duration {
        if self.failures == 0 {
            return self.base.min(MAX_BACKOFF);
        }
        let factor = 1_u64.checked_shl(self.failures.min(16)).unwrap_or(u64::MAX);
        let seconds = self.base.as_secs().saturating_mul(factor);
        Duration::from_secs(seconds).min(MAX_BACKOFF)
    }

    /// The wait to actually use, spread around the nominal value.
    ///
    /// `seed` should differ per machine and per attempt; the caller passes
    /// something cheap like the system clock. Taking it as an argument keeps
    /// this function pure, so the bounds can be asserted rather than hoped
    /// for.
    /// VI: Khoảng chờ thật sự dùng, rải quanh giá trị danh nghĩa.
    /// VI: `seed` nên khác nhau theo từng máy và từng lần thử; bên gọi truyền
    /// VI: vào thứ rẻ tiền như đồng hồ hệ thống. Nhận nó qua tham số giúp hàm
    /// VI: này thuần tuý, nên có thể khẳng định được giới hạn chứ không phải
    /// VI: hy vọng.
    pub fn next_delay(&self, seed: u64) -> Duration {
        jitter(self.nominal(), seed)
    }
}

/// Spreads a duration by up to `JITTER_PERCENT` either way.
/// VI: Rải một khoảng thời gian lệch tối đa `JITTER_PERCENT` về hai phía.
pub fn jitter(nominal: Duration, seed: u64) -> Duration {
    let millis = nominal.as_millis() as u64;
    if millis == 0 {
        return nominal;
    }
    let spread = millis.saturating_mul(JITTER_PERCENT) / 100;
    if spread == 0 {
        return nominal;
    }
    // A small integer mix, not cryptography: the only requirement is that
    // nearby seeds land in different places, so machines that failed at the
    // same instant do not return at the same instant.
    // VI: Một phép trộn số nguyên nhỏ, không phải mật mã: yêu cầu duy nhất là
    // VI: các seed gần nhau rơi vào những chỗ khác nhau, để các máy cùng hỏng
    // VI: một thời điểm không quay lại cùng một thời điểm.
    let mixed = seed
        .wrapping_mul(0x9E37_79B9_7F4A_7C15)
        .rotate_left(31)
        .wrapping_mul(0xBF58_476D_1CE4_E5B9);
    let offset = mixed % (spread * 2 + 1);
    Duration::from_millis(millis + offset - spread)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_idle_companion_waits_its_configured_interval() {
        let schedule = Schedule::new(Duration::from_secs(10));
        assert_eq!(schedule.nominal(), Duration::from_secs(10));
    }

    #[test]
    fn consecutive_failures_double_the_wait() {
        let mut schedule = Schedule::new(Duration::from_secs(10));
        schedule.failed();
        assert_eq!(schedule.nominal(), Duration::from_secs(20));
        schedule.failed();
        assert_eq!(schedule.nominal(), Duration::from_secs(40));
        schedule.failed();
        assert_eq!(schedule.nominal(), Duration::from_secs(80));
    }

    #[test]
    fn the_wait_is_capped_so_a_recovered_server_is_noticed() {
        let mut schedule = Schedule::new(Duration::from_secs(10));
        for _ in 0..40 {
            schedule.failed();
        }
        assert_eq!(schedule.nominal(), MAX_BACKOFF);
    }

    #[test]
    fn an_empty_queue_is_a_success_not_a_failure() {
        // The server answered; there was simply nothing to do. Backing off
        // here would make a quiet machine slow to pick up the first run.
        // VI: Server đã trả lời; chỉ là không có việc. Lùi lại ở đây sẽ khiến
        // VI: một máy đang rảnh chậm nhận run đầu tiên.
        let mut schedule = Schedule::new(Duration::from_secs(10));
        schedule.failed();
        schedule.failed();
        schedule.succeeded();
        assert_eq!(schedule.failures(), 0);
        assert_eq!(schedule.nominal(), Duration::from_secs(10));
    }

    #[test]
    fn jitter_stays_within_a_quarter_either_way() {
        let nominal = Duration::from_secs(10);
        for seed in 0..5_000_u64 {
            let delay = jitter(nominal, seed);
            assert!(
                delay >= Duration::from_millis(7_500) && delay <= Duration::from_millis(12_500),
                "seed {seed} produced {delay:?}"
            );
        }
    }

    #[test]
    fn machines_that_failed_together_do_not_return_together() {
        // The convoy this exists to break: consecutive seeds, as a fleet
        // reconnecting at the same instant would produce, must spread out.
        // VI: Đoàn xe mà cơ chế này sinh ra để phá: các seed liên tiếp, giống
        // VI: như một đàn máy cùng kết nối lại một thời điểm, phải bị rải ra.
        let nominal = Duration::from_secs(60);
        let delays: Vec<u128> = (0..200_u64)
            .map(|seed| jitter(nominal, seed).as_millis())
            .collect();
        let unique: std::collections::BTreeSet<u128> = delays.iter().copied().collect();
        assert!(
            unique.len() > 150,
            "only {} distinct delays out of 200",
            unique.len()
        );
        let lowest = *delays.iter().min().unwrap();
        let highest = *delays.iter().max().unwrap();
        assert!(
            highest - lowest > 20_000,
            "the spread was only {}ms",
            highest - lowest
        );
    }

    #[test]
    fn the_same_seed_always_gives_the_same_delay() {
        // Determinism is what lets the bounds above be asserted at all.
        // VI: Tính tất định là thứ cho phép khẳng định các giới hạn ở trên.
        let nominal = Duration::from_secs(30);
        assert_eq!(jitter(nominal, 12_345), jitter(nominal, 12_345));
    }

    #[test]
    fn a_zero_interval_is_left_alone_rather_than_underflowing() {
        assert_eq!(jitter(Duration::ZERO, 7), Duration::ZERO);
        assert_eq!(
            jitter(Duration::from_millis(1), 7),
            Duration::from_millis(1)
        );
    }

    #[test]
    fn a_jittered_delay_never_exceeds_the_cap_by_much() {
        let mut schedule = Schedule::new(Duration::from_secs(10));
        for _ in 0..40 {
            schedule.failed();
        }
        for seed in 0..1_000_u64 {
            let delay = schedule.next_delay(seed);
            assert!(delay <= MAX_BACKOFF + MAX_BACKOFF / 4);
        }
    }
}
