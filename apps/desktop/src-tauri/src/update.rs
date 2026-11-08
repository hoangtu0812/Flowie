//! Whether a newer Flowie Desktop has been published.
//!
//! The companion is installed by hand from a release asset, so nothing tells
//! the person at the machine that their copy is old. They find out by going to
//! look, which in practice means they do not find out at all.
//! VI: Đã có bản Flowie Desktop nào mới hơn chưa.
//! VI: Companion được cài tay từ một asset của bản phát hành, nên không có gì
//! VI: báo cho người ngồi ở máy biết bản của họ đã cũ. Họ chỉ biết nếu tự đi
//! VI: xem, mà trên thực tế nghĩa là không biết.
//!
//! This reports and offers to open the release page. It does not download or
//! install: doing that safely needs a signing key and a hosted update
//! manifest, and the installer is not signed yet, so a companion that replaced
//! itself from the network would be a companion that runs whatever answered.
//! VI: Phần này báo và mời mở trang phát hành. Nó không tải và không cài: làm
//! VI: việc đó một cách an toàn cần khoá ký số và một update manifest được host,
//! VI: mà bộ cài hiện chưa ký, nên một companion tự thay chính nó từ mạng sẽ là
//! VI: một companion chạy bất cứ thứ gì trả lời nó.

use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Asked at startup and then rarely. A release appears a few times a week at
/// most, and a companion that polls a public API every minute is a companion
/// that gets rate-limited into never getting an answer at all.
/// VI: Hỏi lúc khởi động rồi thưa dần. Một bản phát hành nhiều lắm cũng chỉ ra
/// VI: vài lần một tuần, còn một companion hỏi một API công khai mỗi phút là
/// VI: companion bị chặn tần suất tới mức không bao giờ nhận được câu trả lời.
const EVERY: Duration = Duration::from_secs(6 * 60 * 60);

const LATEST: &str = "https://api.github.com/repos/hoangtu0812/Flowie/releases/latest";

/// GitHub refuses a request without one. The product name is used rather than
/// a library's default so a rate-limit complaint names something a person here
/// can recognise.
/// VI: GitHub từ chối request thiếu header này. Dùng tên sản phẩm thay vì mặc
/// VI: định của một thư viện, để khi bị than phiền về tần suất thì cái tên nêu
/// VI: ra là thứ người ở đây nhận ra được.
const AGENT: &str = "flowie-desktop";

/// A published release newer than the one running.
/// VI: Một bản phát hành đã công bố, mới hơn bản đang chạy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Newer {
    pub version: String,
    pub url: String,
}

/// What the tray reads. `None` means either that nothing newer exists or that
/// nobody has managed to ask yet, and the two are deliberately not told apart:
/// an entry reading "could not check" asks a person to deal with something
/// they cannot do anything about.
/// VI: Thứ tray đọc. `None` nghĩa là hoặc chưa có bản nào mới hơn, hoặc chưa ai
/// VI: hỏi được — hai trường hợp cố ý không phân biệt: một mục ghi "không kiểm
/// VI: tra được" là yêu cầu người dùng xử lý thứ họ không xử lý được.
pub type Available = Arc<Mutex<Option<Newer>>>;

/// Starts the watcher. It reports a failure nowhere: a GitHub that does not
/// answer says nothing about whether this machine can take work, so it must
/// not touch readiness and must not make the tray ask for attention.
/// VI: Khởi động vòng theo dõi. Nó không báo thất bại đi đâu cả: một GitHub
/// VI: không trả lời chẳng nói gì về việc máy này có nhận việc được hay không,
/// VI: nên nó không được chạm vào trạng thái sẵn sàng và không được làm tray đòi
/// VI: chú ý.
pub fn watch(current: String, found: Available) {
    std::thread::Builder::new()
        .name("flowie-update".into())
        .spawn(move || loop {
            if let Some(newer) = look(&current) {
                if let Ok(mut held) = found.lock() {
                    *held = Some(newer);
                }
            }
            std::thread::sleep(EVERY);
        })
        .expect("the update thread starts");
}

fn look(current: &str) -> Option<Newer> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .ok()?;
    let body: serde_json::Value = runtime.block_on(async {
        let client = reqwest::Client::builder()
            .user_agent(AGENT)
            .timeout(Duration::from_secs(20))
            .build()
            .ok()?;
        client.get(LATEST).send().await.ok()?.json().await.ok()
    })?;
    let tag = body["tag_name"].as_str()?;
    let url = body["html_url"].as_str()?;
    newer(current, tag).map(|version| Newer {
        version,
        url: url.to_string(),
    })
}

/// The published version, when it is ahead of the running one.
///
/// Compared as three numbers rather than as text, because as text `0.9.0`
/// sorts after `0.10.0`, and that comparison would stop offering updates
/// exactly when the minor version first reaches double figures. A tag that
/// does not parse is ignored rather than guessed at: a release named something
/// else is not evidence that this copy is old.
/// VI: Phiên bản đã công bố, khi nó đi trước bản đang chạy.
/// VI: So sánh theo ba con số chứ không theo chuỗi, vì xét như chuỗi thì `0.9.0`
/// VI: đứng sau `0.10.0`, và phép so sánh đó sẽ thôi báo cập nhật đúng vào lúc
/// VI: số minor lần đầu lên hai chữ số. Một tag không parse được thì bỏ qua chứ
/// VI: không đoán: một bản phát hành đặt tên kiểu khác không phải bằng chứng
/// VI: rằng bản này đã cũ.
fn newer(current: &str, tag: &str) -> Option<String> {
    let published = parse(tag)?;
    let running = parse(current)?;
    (published > running).then(|| tag.trim().trim_start_matches('v').to_string())
}

fn parse(version: &str) -> Option<(u64, u64, u64)> {
    let mut parts = version.trim().trim_start_matches('v').split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    // A trailing pre-release or build suffix is cut rather than refused, so
    // `0.17.0-rc.1` is read as `0.17.0` instead of being ignored entirely.
    // VI: Hậu tố pre-release hay build bị cắt chứ không bị từ chối, nên
    // VI: `0.17.0-rc.1` được đọc là `0.17.0` thay vì bị bỏ qua hoàn toàn.
    let tail = parts.next()?;
    let patch = tail.split(['-', '+']).next()?.parse().ok()?;
    let remainder = parts.next();
    // Anything still left is a fourth number, which is not a version this
    // application ever publishes, so it is refused rather than truncated.
    // VI: Thứ còn sót lại là một số thứ tư, không phải dạng phiên bản mà ứng
    // VI: dụng này từng phát hành, nên bị từ chối chứ không bị cắt bớt.
    let suffixed = tail.contains(['-', '+']);
    match remainder {
        None => Some((major, minor, patch)),
        Some(_) if suffixed => Some((major, minor, patch)),
        Some(_) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_published_release_counts_only_when_it_is_actually_ahead() {
        assert_eq!(newer("0.16.0", "v0.17.0").as_deref(), Some("0.17.0"));
        assert_eq!(newer("0.16.0", "v0.16.0"), None);
        assert_eq!(newer("0.17.0", "v0.16.0"), None);
        // Reported without the leading v, because that is how the version
        // reads everywhere else in the application.
        // VI: Báo lại không kèm chữ v đứng đầu, vì đó là cách phiên bản hiển thị
        // VI: ở mọi chỗ khác trong ứng dụng.
        assert_eq!(newer("1.0.0", "v1.0.1").as_deref(), Some("1.0.1"));
    }

    #[test]
    fn versions_are_compared_as_numbers_not_as_text() {
        // As text, 0.9.0 sorts after 0.10.0, so a text comparison stops
        // offering updates exactly when the minor version reaches ten.
        // VI: Xét như chuỗi thì 0.9.0 đứng sau 0.10.0, nên so sánh kiểu chuỗi sẽ
        // VI: thôi báo cập nhật đúng lúc số minor chạm mười.
        assert_eq!(newer("0.9.0", "v0.10.0").as_deref(), Some("0.10.0"));
        assert_eq!(newer("0.10.0", "v0.9.0"), None);
    }

    #[test]
    fn a_tag_that_is_not_a_version_is_ignored_rather_than_guessed_at() {
        // A release named for something else is not evidence that this copy is
        // old, and offering a download on that basis sends someone to install
        // whatever happens to have been published.
        // VI: Một bản phát hành đặt tên theo thứ khác không phải bằng chứng bản
        // VI: này đã cũ, và mời tải về dựa trên đó là đẩy người dùng đi cài bất
        // VI: cứ thứ gì tình cờ được công bố.
        assert_eq!(newer("0.16.0", "nightly"), None);
        assert_eq!(newer("0.16.0", "v0.17"), None);
        assert_eq!(newer("0.16.0", "v0.17.0.1"), None);
        assert_eq!(newer("not-a-version", "v0.17.0"), None);
    }

    #[test]
    fn a_pre_release_suffix_does_not_hide_the_version_it_belongs_to() {
        assert_eq!(
            newer("0.16.0", "v0.17.0-rc.1").as_deref(),
            Some("0.17.0-rc.1")
        );
    }
}
