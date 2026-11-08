//! The thread that asks for work and does it.
//!
//! Everything the companion actually does happens here, on one thread of its
//! own. That is not an implementation detail: `Connection` drives an async
//! client with `block_on`, which panics inside an existing runtime, and the
//! orchestrator is a long sequence of blocking steps. Tauri's own thread must
//! stay free to draw a menu, so the work gets its own thread and the two share
//! nothing but a small piece of state.
//! VI: Thread đi hỏi việc và làm việc.
//! VI: Mọi thứ companion thật sự làm đều diễn ra ở đây, trên một thread riêng.
//! VI: Đó không phải chi tiết kỹ thuật vụn vặt: `Connection` điều khiển một
//! VI: client async bằng `block_on`, thứ sẽ panic nếu đã nằm trong một runtime,
//! VI: còn orchestrator là một chuỗi dài các bước blocking. Thread của Tauri
//! VI: phải rảnh để vẽ menu, nên phần việc có thread riêng và hai bên chỉ chia
//! VI: sẻ đúng một mẩu trạng thái nhỏ.
//!
//! One run at a time, deliberately. The server does not limit how many runs a
//! connection may hold, so that limit is this companion's to keep.
//! VI: Mỗi lần một run, và đó là cố ý. Server không giới hạn số run một kết nối
//! VI: được giữ, nên giới hạn đó là việc của chính companion này.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use flowie_agent::driver::{Driver, DEFAULT_TIMEOUT};
use flowie_connection::{Assigned, Connection, Refusal};
use flowie_core::config::RepositoryMapping;
use flowie_core::run::{Control, Run, RunFailure};
use flowie_core::{readiness, CompanionConfig, Entry, Readiness, Schedule};
use flowie_mcp::{Endpoint, Token};
use flowie_platform::credential::CredentialStore;
use flowie_repository::repository::RepositoryConfig;
use flowie_workspace::Checkout;

/// How long the loop sleeps between checks of whether it was told to stop, so
/// quitting does not wait out a five-minute backoff.
/// VI: Vòng lặp ngủ từng khoảng bao lâu giữa hai lần kiểm xem có bị yêu cầu
/// VI: dừng chưa, để lúc thoát không phải chờ hết một lần lùi năm phút.
const TICK: Duration = Duration::from_millis(250);

/// What the tray can see and change while the worker runs.
/// VI: Những gì tray nhìn thấy và thay đổi được trong lúc worker chạy.
#[derive(Debug)]
pub struct Shared {
    readiness: Mutex<Readiness>,
    task: Mutex<Option<String>>,
    agent: Mutex<Option<&'static str>>,
    activity: Mutex<Option<String>>,
    site: Mutex<Option<String>>,
    cancel: AtomicBool,
    stop: AtomicBool,
    retry: AtomicBool,
}

impl Shared {
    pub fn new(readiness: Readiness) -> Self {
        Self {
            readiness: Mutex::new(readiness),
            task: Mutex::new(None),
            agent: Mutex::new(None),
            activity: Mutex::new(None),
            site: Mutex::new(None),
            cancel: AtomicBool::new(false),
            stop: AtomicBool::new(false),
            retry: AtomicBool::new(false),
        }
    }

    pub fn readiness(&self) -> Readiness {
        self.readiness
            .lock()
            .map(|held| held.clone())
            .unwrap_or(Readiness::NotConfigured)
    }

    pub fn set_readiness(&self, state: Readiness) {
        if let Ok(mut held) = self.readiness.lock() {
            *held = state;
        }
    }

    /// The task being worked on, for the tray line. `None` means idle.
    /// VI: Task đang được làm, dùng cho dòng trên tray. `None` nghĩa là đang rảnh.
    pub fn task(&self) -> Option<String> {
        self.task.lock().ok().and_then(|held| held.clone())
    }

    /// Which agent is working right now, or `None` when none is.
    ///
    /// Held separately from the configured provider because the configuration
    /// says what would run, not what is running: a machine configured for
    /// Codex and sitting idle must not read as "Codex is working on
    /// something". It is set when a run starts and cleared when it ends, so
    /// the two questions a person actually asks — is anything running, and
    /// which agent — are answered by one value.
    /// VI: Agent nào đang làm việc ngay lúc này, hoặc `None` khi không có.
    /// VI: Giữ tách khỏi provider trong cấu hình vì cấu hình nói thứ sẽ chạy chứ
    /// VI: không phải thứ đang chạy: một máy cấu hình Codex và đang rảnh không
    /// VI: được đọc ra thành "Codex đang làm gì đó". Nó được đặt khi một run bắt
    /// VI: đầu và xoá khi run kết thúc, nên hai câu hỏi người dùng thật sự hỏi —
    /// VI: có gì đang chạy không, và agent nào — được trả lời bằng một giá trị.
    pub fn agent(&self) -> Option<&'static str> {
        self.agent.lock().ok().and_then(|held| *held)
    }

    /// What the agent said it is doing, the last time it said anything.
    ///
    /// Separate from the task because they answer different questions and
    /// change at different rates: the task holds for a whole run, the line
    /// changes every few seconds.
    /// VI: Agent nói nó đang làm gì, tính từ lần cuối nó nói.
    /// VI: Tách khỏi task vì hai thứ trả lời hai câu hỏi khác nhau và đổi với nhịp khác
    /// VI: nhau: task giữ nguyên suốt một lượt chạy, còn dòng kia đổi vài giây một lần.
    pub fn activity(&self) -> Option<String> {
        self.activity.lock().ok().and_then(|held| held.clone())
    }

    /// Where this Flowie lives in a browser, once the server has said which
    /// workspace the connection belongs to. `None` until then, and the menu
    /// entries that open a page stay disabled.
    /// VI: Flowie này nằm ở đâu trong trình duyệt, sau khi server cho biết kết nối
    /// VI: thuộc workspace nào. Trước đó là `None`, và các mục menu mở trang vẫn bị vô
    /// VI: hiệu hoá.
    pub fn site(&self) -> Option<String> {
        self.site.lock().ok().and_then(|held| held.clone())
    }

    /// The address of the task in hand, when there is one and the workspace is
    /// known.
    /// VI: Địa chỉ của task đang làm, khi có task và đã biết workspace.
    pub fn task_url(&self) -> Option<String> {
        Some(format!("{}/issue/{}", self.site()?, self.task()?))
    }

    fn set_site(&self, value: Option<String>) {
        if let Ok(mut held) = self.site.lock() {
            *held = value;
        }
    }

    fn set_agent(&self, name: Option<&'static str>) {
        if let Ok(mut held) = self.agent.lock() {
            *held = name;
        }
    }

    fn set_task(&self, line: Option<String>) {
        if let Ok(mut held) = self.task.lock() {
            *held = line;
        }
    }

    fn set_activity(&self, line: Option<String>) {
        if let Ok(mut held) = self.activity.lock() {
            *held = line;
        }
    }

    /// Asks the run in progress to stop at its next step. It is not forced:
    /// the orchestrator hands the task back rather than marking it failed,
    /// which is only correct if it stops somewhere it can report from.
    /// VI: Yêu cầu run đang chạy dừng ở bước kế tiếp. Không ép buộc:
    /// VI: orchestrator trả task lại chứ không đánh dấu thất bại, và điều đó chỉ
    /// VI: đúng nếu nó dừng ở chỗ còn báo cáo được.
    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn request_stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }

    /// Asks for the next attempt to happen now rather than at the end of the
    /// current wait.
    ///
    /// After a run of failures the wait reaches five minutes, which is the
    /// right answer to a server that is down and the wrong one to a person who
    /// has just pasted a new token: they save it, watch the same complaint sit
    /// there, and cannot tell a token that is still wrong from a turn that has
    /// not come round yet.
    /// VI: Yêu cầu lượt thử kế tiếp diễn ra ngay thay vì đợi hết lần chờ hiện
    /// VI: tại.
    /// VI: Sau một chuỗi thất bại, thời gian chờ chạm năm phút — câu trả lời
    /// VI: đúng cho một server đang hỏng và sai cho một người vừa dán token mới:
    /// VI: họ lưu xong, nhìn đúng lời phàn nàn cũ nằm im, và không phân biệt
    /// VI: được token vẫn sai với lượt thử chưa tới.
    pub fn request_retry(&self) {
        self.retry.store(true, Ordering::SeqCst);
    }

    /// Takes the request, so one ask produces one attempt.
    /// VI: Nhận lấy yêu cầu, để một lần yêu cầu sinh ra đúng một lượt thử.
    fn take_retry(&self) -> bool {
        self.retry.swap(false, Ordering::SeqCst)
    }

    fn stopping(&self) -> bool {
        self.stop.load(Ordering::SeqCst)
    }
}

/// Starts the worker. The handle is kept so quitting can wait for a run to
/// reach a step it can stop at.
/// VI: Khởi động worker. Handle được giữ lại để lúc thoát có thể chờ một run
/// VI: tới được bước mà nó dừng lại được.
pub fn start(directory: PathBuf, shared: Arc<Shared>) -> std::thread::JoinHandle<()> {
    std::thread::Builder::new()
        .name("flowie-worker".into())
        .spawn(move || serve(&directory, &shared))
        .expect("the worker thread starts")
}

fn serve(directory: &Path, shared: &Arc<Shared>) {
    let mut schedule = Schedule::new(Duration::from_secs(10));
    while !shared.stopping() {
        let configured = attempt(directory, shared, &mut schedule);
        // The configured interval is only known once the file has been read,
        // so the schedule is rebuilt when it changes rather than fixed at
        // startup, which would ignore an edit until the app restarted.
        // VI: Chu kỳ đã cấu hình chỉ biết được sau khi đọc file, nên lịch được
        // VI: dựng lại khi nó đổi chứ không cố định lúc khởi động, vì như vậy sẽ
        // VI: bỏ qua một lần sửa cho tới khi khởi động lại ứng dụng.
        if let Some(base) = configured {
            if base != schedule.base() {
                let failures = schedule.failures();
                schedule = Schedule::new(base);
                for _ in 0..failures {
                    schedule.failed();
                }
            }
        }
        rest(schedule.next_delay(seed()), shared);
        // A person asking to try again is evidence that what failed before may
        // have been fixed, so the backoff earned by those failures no longer
        // describes anything. Keeping it would make the first attempt after a
        // correction wait as long as the attempt after the mistake.
        // VI: Một người yêu cầu thử lại là bằng chứng rằng thứ hỏng trước đó có
        // VI: thể đã được sửa, nên khoảng lùi tích lại từ những lần hỏng đó
        // VI: không còn mô tả điều gì nữa. Giữ nó sẽ khiến lượt thử đầu tiên sau
        // VI: một lần sửa phải chờ lâu bằng lượt thử sau lần sai.
        if shared.take_retry() {
            schedule = Schedule::new(schedule.base());
        }
    }
}

/// One pass: work out what this machine can do, and do one run if there is
/// one. Returns the configured idle interval when it could be read.
/// VI: Một lượt: xác định máy này làm được gì, và làm một run nếu có. Trả về chu
/// VI: kỳ lúc rảnh đã cấu hình nếu đọc được.
fn attempt(directory: &Path, shared: &Arc<Shared>, schedule: &mut Schedule) -> Option<Duration> {
    let startup = crate::startup::assess_local(directory);
    let Some(config) = startup.config else {
        shared.set_readiness(startup.readiness);
        return None;
    };
    let interval = Duration::from_secs(config.poll_seconds);

    // A local problem is the companion's own state, not a failed exchange with
    // the server, so it does not back the schedule off.
    // VI: Một trục trặc tại máy là trạng thái của chính companion chứ không phải
    // VI: một lần trao đổi hỏng với server, nên nó không làm lịch lùi lại.
    if startup.readiness.needs_person() {
        shared.set_readiness(startup.readiness);
        return Some(interval);
    }

    let mut connection = match connect(&config) {
        Ok(connection) => connection,
        Err(refusal) => {
            schedule.failed();
            shared.set_readiness(refused(refusal));
            return Some(interval);
        }
    };

    let access = match connection.access() {
        Ok(access) => access,
        Err(refusal) => {
            schedule.failed();
            shared.set_readiness(refused(refusal));
            return Some(interval);
        }
    };
    schedule.succeeded();

    // Asked once and kept: the workspace a connection belongs to does not
    // change under it, and asking every pass would spend a call a minute on
    // an answer nobody waits for.
    // VI: Hỏi một lần rồi giữ: workspace mà một kết nối thuộc về không tự đổi,
    // VI: và hỏi lại mỗi lượt sẽ tốn một lời gọi mỗi phút cho một câu trả lời
    // VI: không ai phải chờ.
    if shared.site().is_none() {
        if let Ok(site) = connection.workspace_site() {
            shared.set_site(site);
        }
    }

    let state = readiness::assess(&config, &access.scopes, access.writes_enabled);
    shared.set_readiness(state.clone());
    if !state.may_claim() {
        return Some(interval);
    }

    // Asked per configured repository, because the answer has to come back
    // with the checkout it belongs to; a run whose project is not mapped on
    // this machine cannot be worked on here.
    // VI: Hỏi theo từng repository đã cấu hình, vì câu trả lời phải về kèm
    // VI: checkout tương ứng; một run có project chưa được ánh xạ trên máy này
    // VI: thì không làm ở đây được.
    for mapping in &config.repositories {
        if shared.stopping() {
            return Some(interval);
        }
        let waiting = match connection.assigned_runs(Some(&mapping.project_id)) {
            Ok(waiting) => waiting,
            Err(failure) => {
                schedule.failed();
                shared.set_readiness(disconnected(&failure));
                return Some(interval);
            }
        };
        if let Some(assigned) = waiting.into_iter().next() {
            work(
                &mut connection,
                &config,
                mapping,
                assigned,
                shared,
                &access.connection_id,
            );
            return Some(interval);
        }
    }
    Some(interval)
}

/// Drives one run from claim to result.
/// VI: Điều phối một run từ lúc claim tới lúc có kết quả.
fn work(
    connection: &mut Connection,
    config: &CompanionConfig,
    mapping: &RepositoryMapping,
    assigned: Assigned,
    shared: &Arc<Shared>,
    connection_id: &str,
) {
    let label = assigned
        .identifier
        .clone()
        .unwrap_or_else(|| assigned.issue_id.clone());
    shared.set_task(Some(label.clone()));
    shared.set_activity(None);
    shared.set_agent(Some(config.provider.label()));
    // A cancel asked for while idle must not end the run that starts next.
    // VI: Một lệnh hủy yêu cầu lúc đang rảnh không được kết thúc run bắt đầu
    // VI: ngay sau đó.
    shared.cancel.store(false, Ordering::SeqCst);

    let mut checkout = Checkout::new(
        RepositoryConfig {
            repository_url: mapping.repository_url.clone(),
            base_branch: mapping.base_branch.clone(),
            path: mapping.path.clone(),
            worktree_root: None,
        },
        mapping.approved_tests.clone(),
        DEFAULT_TIMEOUT,
    );
    // Cloned into the sink because the agent reports from its own reading
    // thread, which outlives neither this function nor the borrow checker's
    // patience with a reference.
    // VI: Được clone vào sink vì agent báo về từ thread đọc của riêng nó, thứ không
    // VI: sống lâu hơn hàm này và cũng không được borrow checker chấp nhận qua tham
    // VI: chiếu.
    let reporting = Arc::clone(shared);
    let mut driver = Driver {
        provider: config.provider.into(),
        program: None,
        issue: label.clone(),
        timeout: DEFAULT_TIMEOUT,
        today: today(),
        progress: Some(Arc::new(move |line: String| {
            reporting.set_activity(Some(line));
        })),
    };
    let operator = Operator {
        shared: shared.as_ref(),
        started: Instant::now(),
    };

    let completed = Run {
        issue: assigned.issue_id.clone(),
        publish: mapping.may_publish,
        server: connection,
        workspace: &mut checkout,
        agent: &mut driver,
        control: &operator,
        lease: flowie_core::run::tracker_without_budget(),
        journal: Entry::new(
            assigned.run_id,
            assigned.issue_id,
            connection_id,
            config.provider.program(),
        ),
    }
    .execute();

    shared.set_task(None);
    shared.set_activity(None);
    shared.set_agent(None);
    shared.cancel.store(false, Ordering::SeqCst);
    // The outcome is not written over the readiness the server reported: how a
    // run ended says nothing about whether the machine can take the next one,
    // and the next pass asks anyway.
    // VI: Kết cục không được ghi đè lên trạng thái sẵn sàng mà server đã báo:
    // VI: một run kết thúc ra sao không nói gì về việc máy này có nhận được việc
    // VI: kế tiếp hay không, và lượt sau vẫn hỏi lại.
    let _ = completed;
}

/// Answers the orchestrator between steps.
/// VI: Trả lời orchestrator giữa các bước.
struct Operator<'a> {
    shared: &'a Shared,
    started: Instant,
}

impl Control for Operator<'_> {
    fn activity(&self) -> Option<String> {
        self.shared.activity()
    }

    fn cancel_requested(&self) -> bool {
        // Quitting counts as cancelling: a run handed back is one another
        // machine can pick up, while one abandoned mid-step holds the task
        // until its lease expires.
        // VI: Thoát ứng dụng cũng tính là hủy: một run được trả lại là run máy
        // VI: khác nhặt được, còn một run bị bỏ dở giữa bước sẽ giữ task cho tới
        // VI: khi lease hết hạn.
        self.shared.cancel.load(Ordering::SeqCst) || self.shared.stopping()
    }

    fn elapsed_seconds(&self) -> u64 {
        self.started.elapsed().as_secs()
    }
}

fn connect(config: &CompanionConfig) -> Result<Connection, Refusal> {
    let local =
        |error: &dyn std::fmt::Display| Refusal::Other(RunFailure::Precondition(error.to_string()));
    let endpoint = Endpoint::parse(&config.endpoint).map_err(|error| local(&error))?;
    let store = CredentialStore::new(&config.credential_account).map_err(|error| local(&error))?;
    let secret = store.read().map_err(|error| local(&error))?;
    // A token the local store will not give back, or one this client will not
    // send, is the person's to fix in the same place as one the server
    // refuses: the token field. Reporting it as a lost connection would send
    // them to the network instead.
    // VI: Một token mà kho credential không trả lại được, hay một token client
    // VI: này không chịu gửi đi, đều là thứ người dùng sửa ở đúng một chỗ như
    // VI: token bị server từ chối: ô nhập token. Báo nó thành mất kết nối sẽ
    // VI: đẩy họ đi kiểm tra mạng.
    let token = Token::new(secret).map_err(|error| Refusal::Credential(error.to_string()))?;
    Connection::open(endpoint, token)
}

/// A failure before any work could be asked for. Everything here is something
/// to wait out rather than something to ask a person about: a revoked token
/// shows up as a refused call, which the next pass reports through the
/// server's own answer.
/// VI: Một thất bại trước khi kịp hỏi việc. Mọi thứ ở đây là thứ cần chờ qua chứ
/// VI: không phải thứ cần hỏi người dùng: một token bị thu hồi sẽ hiện ra dưới
/// VI: dạng một lời gọi bị từ chối, và lượt sau báo lại qua chính câu trả lời
/// VI: của server.
/// What a refused connection means for the machine.
///
/// A credential the server will not take is the one failure here that a person
/// has to act on, and it has to say so: `needs_person` drives whether the tray
/// asks for attention, so a rejected token reported as a lost connection sits
/// there silently retrying a token that will never work.
/// VI: Một kết nối bị từ chối có nghĩa gì với máy này.
/// VI: Credential mà server không nhận là thất bại duy nhất ở đây cần người xử
/// VI: lý, và nó phải nói ra điều đó: `needs_person` quyết định tray có đòi chú
/// VI: ý hay không, nên một token bị khước từ mà báo thành mất kết nối sẽ ngồi
/// VI: im thử lại mãi một token không bao giờ chạy được.
fn refused(refusal: Refusal) -> Readiness {
    match refusal {
        Refusal::Credential(reason) => Readiness::NeedsSignIn { reason },
        Refusal::Other(failure) => disconnected(&failure),
    }
}

fn disconnected(failure: &RunFailure) -> Readiness {
    let detail = match failure {
        RunFailure::Precondition(detail) | RunFailure::Reportable(detail) => detail.clone(),
        RunFailure::LeaseLost => "the run is no longer owned by this companion".into(),
        RunFailure::Cancelled => "the attempt was cancelled".into(),
    };
    Readiness::Disconnected { detail }
}

/// Sleeps in short steps so a quit does not wait out a long backoff.
/// VI: Ngủ theo từng bước ngắn để lúc thoát không phải chờ hết một lần lùi dài.
fn rest(total: Duration, shared: &Shared) {
    let mut slept = Duration::ZERO;
    while slept < total {
        // Quitting and a retry both end the wait early, and neither is
        // consumed here: the caller reads the retry flag so the wait and the
        // schedule reset cannot disagree about whether one was asked for.
        // VI: Thoát và yêu cầu thử lại đều kết thúc sớm lần chờ, và không cờ nào
        // VI: bị tiêu thụ ở đây: bên gọi mới đọc cờ thử lại, để lần chờ và việc
        // VI: đặt lại lịch không thể bất đồng về chuyện có ai yêu cầu hay không.
        if shared.stopping() || shared.retry.load(Ordering::SeqCst) {
            return;
        }
        let step = TICK.min(total - slept);
        std::thread::sleep(step);
        slept += step;
    }
}

/// Something cheap that differs per machine and per attempt, for the jitter.
/// VI: Một giá trị rẻ tiền khác nhau theo máy và theo lượt, dùng cho jitter.
fn seed() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_nanos() as u64)
        .unwrap_or(0)
        ^ u64::from(std::process::id())
}

/// Today where the person is, falling back to UTC.
///
/// The agent counts a target end date from this, and a person reading the task
/// sees their own calendar. In Vietnam a UTC date is the previous day until
/// mid-morning, which would have the agent counting from yesterday.
/// VI: Hôm nay theo nơi người dùng đang ở, dự phòng bằng UTC.
/// VI: Agent đếm ngày kết thúc dự kiến từ giá trị này, và người đọc task thì
/// VI: nhìn theo lịch của chính họ. Ở Việt Nam, ngày theo UTC vẫn là hôm qua cho
/// VI: tới giữa buổi sáng, nghĩa là agent sẽ đếm từ hôm qua.
fn today() -> time::Date {
    time::OffsetDateTime::now_local()
        .unwrap_or_else(|_| time::OffsetDateTime::now_utc())
        .date()
}

#[cfg(test)]
mod tests {

    #[test]
    fn asking_to_retry_ends_the_wait_and_clears_what_the_failures_earned() {
        // Saving a token is a person saying "try this now". Leaving the
        // backoff in place makes the attempt after a correction wait exactly
        // as long as the attempt after the mistake, so nobody can tell whether
        // the new token was refused or simply has not been tried.
        // VI: Lưu token là người dùng nói "thử cái này ngay". Để nguyên khoảng
        // VI: lùi sẽ khiến lượt thử sau khi sửa phải chờ đúng bằng lượt thử sau
        // VI: khi sai, nên không ai biết token mới bị từ chối hay đơn giản là
        // VI: chưa được thử.
        let shared = Arc::new(Shared::new(Readiness::NotConfigured));
        let started = Instant::now();
        shared.request_retry();
        rest(Duration::from_secs(30), &shared);
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "the wait should end as soon as a retry is asked for"
        );

        // Read once: a single ask must not reset the schedule on every pass
        // that follows it.
        // VI: Chỉ đọc một lần: một yêu cầu không được đặt lại lịch ở mọi lượt
        // VI: tiếp theo sau đó.
        assert!(shared.take_retry());
        assert!(!shared.take_retry());
    }

    #[test]
    fn a_rejected_token_asks_the_person_rather_than_waiting_for_the_network() {
        // `needs_person` is what makes the tray ask for attention. A rejected
        // token reported as a lost connection sits there retrying a token that
        // is never going to work, and says nothing while it does.
        // VI: `needs_person` là thứ khiến tray đòi được chú ý. Một token bị
        // VI: khước từ mà báo thành mất kết nối sẽ ngồi thử lại mãi một token
        // VI: không bao giờ chạy được, và không nói gì trong suốt thời gian đó.
        let asked = refused(Refusal::Credential("the token is revoked".into()));
        assert!(asked.needs_person(), "{asked:?}");
        assert_eq!(asked.reason(), Some("the token is revoked"));

        let waited = refused(Refusal::Other(RunFailure::Precondition(
            "the host did not answer".into(),
        )));
        assert!(!waited.needs_person(), "{waited:?}");
        assert_eq!(waited.reason(), Some("the host did not answer"));
    }

    use super::*;

    #[test]
    fn quitting_reads_as_a_cancellation_to_the_run_in_progress() {
        // A run handed back can be picked up by another machine; one abandoned
        // mid-step holds the task until its lease expires.
        // VI: Một run được trả lại thì máy khác nhặt được; một run bị bỏ dở giữa
        // VI: bước sẽ giữ task tới khi lease hết hạn.
        let shared = Shared::new(Readiness::Ready);
        let operator = Operator {
            shared: &shared,
            started: Instant::now(),
        };
        assert!(!operator.cancel_requested());
        shared.request_stop();
        assert!(operator.cancel_requested());
    }

    #[test]
    fn cancelling_is_asked_for_rather_than_forced() {
        let shared = Shared::new(Readiness::Ready);
        let operator = Operator {
            shared: &shared,
            started: Instant::now(),
        };
        shared.request_cancel();
        assert!(operator.cancel_requested());
    }

    #[test]
    fn a_long_wait_ends_as_soon_as_the_app_is_quitting() {
        // Without this a quit would sit through a backoff of up to five
        // minutes, which to the person looks like the app refusing to close.
        // VI: Thiếu điều này thì một lần thoát sẽ phải ngồi chờ hết một lần lùi
        // VI: tới năm phút, và với người dùng thì trông như ứng dụng không chịu
        // VI: đóng.
        let shared = Arc::new(Shared::new(Readiness::Ready));
        let signal = Arc::clone(&shared);
        let started = Instant::now();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            signal.request_stop();
        });
        rest(Duration::from_secs(30), &shared);
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "waited {:?}",
            started.elapsed()
        );
    }

    #[test]
    fn a_task_address_needs_both_the_workspace_and_the_task() {
        // Half an address opens nothing. The menu entry is disabled on
        // exactly this condition, so getting it wrong means a dead click.
        // VI: Nửa địa chỉ thì không mở được gì. Mục menu bị vô hiệu hoá đúng
        // VI: theo điều kiện này, nên sai ở đây nghĩa là một cú bấm vô tác dụng.
        let shared = Shared::new(Readiness::Ready);
        assert!(shared.task_url().is_none(), "nothing known yet");

        shared.set_task(Some("DTD-204".into()));
        assert!(
            shared.task_url().is_none(),
            "the workspace is still unknown"
        );

        shared.set_site(Some(
            "https://flowie.example.com/phong-chuyen-doi-so".into(),
        ));
        assert_eq!(
            shared.task_url().as_deref(),
            Some("https://flowie.example.com/phong-chuyen-doi-so/issue/DTD-204")
        );

        // Idle again: the workspace stays, the task does not.
        // VI: Rảnh trở lại: workspace ở lại, task thì không.
        shared.set_task(None);
        assert!(shared.task_url().is_none());
        assert!(shared.site().is_some());
    }

    #[test]
    fn the_tray_line_is_empty_until_there_is_work() {
        let shared = Shared::new(Readiness::Ready);
        assert!(shared.task().is_none());
        assert!(shared.activity().is_none());
        shared.set_task(Some("DTD-1".into()));
        shared.set_activity(Some("Reading notes.md".into()));
        assert_eq!(shared.task().as_deref(), Some("DTD-1"));
        assert_eq!(shared.activity().as_deref(), Some("Reading notes.md"));
        shared.set_task(None);
        shared.set_activity(None);
        assert!(shared.task().is_none());
        assert!(shared.activity().is_none());
    }

    #[test]
    fn every_failure_before_work_reads_as_disconnected_with_a_reason() {
        for failure in [
            RunFailure::Precondition("no token".into()),
            RunFailure::Reportable("server said no".into()),
            RunFailure::LeaseLost,
            RunFailure::Cancelled,
        ] {
            match disconnected(&failure) {
                Readiness::Disconnected { detail } => assert!(!detail.is_empty()),
                other => panic!("expected disconnected, got {other:?}"),
            }
        }
    }

    #[test]
    fn being_disconnected_is_not_something_to_ask_a_person_about() {
        // Waiting is the right response to a network that is down, and the
        // tray should not send anyone looking for a problem they cannot fix.
        // VI: Chờ là phản ứng đúng với một mạng đang hỏng, và tray không nên đẩy
        // VI: ai đó đi tìm một vấn đề họ không sửa được.
        let state = disconnected(&RunFailure::Reportable("timed out".into()));
        assert!(!state.needs_person());
        assert!(!state.may_claim());
    }

    #[test]
    fn the_seed_moves_between_attempts() {
        // A fixed seed would have every machine wake at the same moment after
        // an outage, which is the thing the jitter exists to prevent.
        // VI: Một seed cố định sẽ khiến mọi máy thức dậy cùng lúc sau một lần sự
        // VI: cố, đúng thứ mà jitter sinh ra để tránh.
        let first = seed();
        std::thread::sleep(Duration::from_millis(2));
        assert_ne!(first, seed());
    }
}
