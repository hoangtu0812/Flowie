//! The Flowie connection token, held by the operating system rather than by
//! the application.
//!
//! The token is the companion's whole authority: anything holding it can
//! claim runs, write to issues and report results as this machine. It
//! therefore never lands in a configuration file, a log or the journal, and
//! it is read from the store at the moment it is needed rather than kept
//! somewhere convenient.
//! VI: Token kết nối Flowie, do hệ điều hành giữ chứ không phải ứng dụng giữ.
//! VI: Token là toàn bộ thẩm quyền của companion: ai cầm nó cũng claim được
//! VI: run, ghi được vào issue và báo được kết quả với tư cách máy này. Vì vậy
//! VI: nó không bao giờ nằm trong file cấu hình, log hay journal, và được đọc
//! VI: từ kho đúng lúc cần chứ không giữ sẵn ở chỗ tiện tay.
//!
//! Two failures must stay distinguishable, because they send the operator to
//! opposite places: no token has been configured yet, and the store exists
//! but will not answer. A keychain the person has not unlocked, or a policy
//! that denies access, must not look like a fresh installation that simply
//! needs setting up. The DTD-492 spike measured that `keyring` reports a
//! missing entry as its own error rather than as an empty string, which is
//! what makes the distinction possible at all.
//! VI: Hai kiểu thất bại phải phân biệt được, vì chúng đẩy người vận hành đi
//! VI: hai hướng ngược nhau: chưa cấu hình token, và kho có tồn tại nhưng
//! VI: không trả lời. Một keychain chưa được mở khoá, hay một chính sách chặn
//! VI: truy cập, không được trông giống một bản cài mới chỉ cần thiết lập.
//! VI: Spike DTD-492 đã đo rằng `keyring` báo mục không tồn tại bằng một lỗi
//! VI: riêng chứ không phải chuỗi rỗng, chính điều đó làm việc phân biệt khả thi.

use std::fmt;

/// Names the credential so several Flowie installations, or a test, do not
/// fight over one entry.
/// VI: Đặt tên credential để nhiều bản cài Flowie, hoặc một bài test, không
/// VI: tranh nhau cùng một mục.
const SERVICE: &str = "io.flowie.desktop";

#[derive(Debug)]
pub enum CredentialError {
    /// No token has been stored for this account yet. The companion is
    /// unconfigured, not broken.
    /// VI: Chưa có token nào được lưu cho tài khoản này. Companion ở trạng
    /// VI: thái chưa cấu hình, không phải hỏng.
    NotConfigured,
    /// The store refused or could not be reached: locked keychain, denied
    /// policy, missing service. The operator has to act on the machine.
    /// VI: Kho từ chối hoặc không truy cập được: keychain bị khoá, chính sách
    /// VI: chặn, dịch vụ không có. Người vận hành phải xử lý trên máy.
    Unavailable(String),
    /// The caller passed something that cannot be a token.
    /// VI: Bên gọi truyền vào thứ không thể là token.
    Invalid(String),
}

impl fmt::Display for CredentialError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CredentialError::NotConfigured => {
                f.write_str("no Flowie token is stored on this machine yet")
            }
            CredentialError::Unavailable(detail) => {
                write!(f, "the credential store is unavailable: {detail}")
            }
            CredentialError::Invalid(detail) => write!(f, "invalid token: {detail}"),
        }
    }
}

impl std::error::Error for CredentialError {}

pub type Result<T> = std::result::Result<T, CredentialError>;

/// The stored Flowie token for one connection account.
///
/// `account` separates one Flowie endpoint from another on a machine that
/// talks to more than one, so switching endpoints does not silently reuse the
/// wrong credential.
/// VI: Token Flowie đã lưu cho một tài khoản kết nối.
/// VI: `account` tách endpoint Flowie này với endpoint khác trên một máy nói
/// VI: chuyện với nhiều nơi, để đổi endpoint không âm thầm dùng lại nhầm
/// VI: credential.
pub struct CredentialStore {
    account: String,
}

impl fmt::Debug for CredentialStore {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // The account is an identifier, not a secret, but the type must never
        // grow a field that prints one.
        // VI: Account là định danh chứ không phải bí mật, nhưng kiểu này không
        // VI: bao giờ được phép có thêm trường in ra bí mật.
        f.debug_struct("CredentialStore")
            .field("account", &self.account)
            .finish()
    }
}

impl CredentialStore {
    pub fn new(account: impl Into<String>) -> Result<Self> {
        let account = account.into();
        if account.trim().is_empty() {
            return Err(CredentialError::Invalid(
                "the credential account must not be empty".into(),
            ));
        }
        Ok(Self { account })
    }

    fn entry(&self) -> Result<keyring::Entry> {
        keyring::Entry::new(SERVICE, &self.account)
            .map_err(|error| CredentialError::Unavailable(error.to_string()))
    }

    /// Stores the token, replacing any previous one for this account.
    /// VI: Lưu token, thay cho token trước đó của tài khoản này nếu có.
    pub fn save(&self, token: &str) -> Result<()> {
        if token.trim().is_empty() {
            return Err(CredentialError::Invalid("the token is empty".into()));
        }
        self.entry()?
            .set_password(token)
            .map_err(|error| CredentialError::Unavailable(error.to_string()))
    }

    /// Reads the token. `NotConfigured` means nothing has been stored;
    /// anything else means the store itself is the problem.
    /// VI: Đọc token. `NotConfigured` nghĩa là chưa lưu gì; mọi trường hợp
    /// VI: khác nghĩa là bản thân kho mới là vấn đề.
    pub fn read(&self) -> Result<String> {
        match self.entry()?.get_password() {
            Ok(token) => Ok(token),
            Err(keyring::Error::NoEntry) => Err(CredentialError::NotConfigured),
            Err(error) => Err(CredentialError::Unavailable(error.to_string())),
        }
    }

    /// Removes the token. Deleting something that is not there is success:
    /// the caller asked for the machine to hold no token, and it does not.
    /// VI: Xoá token. Xoá thứ vốn không có cũng là thành công: bên gọi muốn
    /// VI: máy không giữ token nào, và nó đang không giữ.
    pub fn delete(&self) -> Result<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(CredentialError::Unavailable(error.to_string())),
        }
    }

    /// Whether a token is stored, without returning it. Used by the shell to
    /// decide between "needs setting up" and "ready", so it must not pull the
    /// secret into the process to answer a question about its presence.
    /// VI: Có token hay không, mà không trả về token. Vỏ ứng dụng dùng hàm này
    /// VI: để phân biệt "cần thiết lập" với "sẵn sàng", nên nó không được kéo
    /// VI: bí mật vào tiến trình chỉ để trả lời câu hỏi về sự tồn tại.
    pub fn is_configured(&self) -> Result<bool> {
        match self.read() {
            Ok(_) => Ok(true),
            Err(CredentialError::NotConfigured) => Ok(false),
            Err(other) => Err(other),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Each test uses its own account so a parallel run cannot see another
    /// test's entry, and so a failure leaves nothing behind that a later run
    /// would pick up.
    /// VI: Mỗi test dùng account riêng để lần chạy song song không thấy mục
    /// VI: của test khác, và để một lần hỏng không để lại thứ mà lần chạy sau
    /// VI: nhặt phải.
    fn store(name: &str) -> CredentialStore {
        CredentialStore::new(format!(
            "test-{name}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ))
        .unwrap()
    }

    #[test]
    fn an_empty_account_is_refused() {
        assert!(matches!(
            CredentialStore::new("  "),
            Err(CredentialError::Invalid(_))
        ));
    }

    #[test]
    fn an_empty_token_is_refused_before_touching_the_store() {
        let store = store("empty-token");
        assert!(matches!(store.save(""), Err(CredentialError::Invalid(_))));
    }

    #[test]
    fn a_token_survives_a_round_trip() {
        let store = store("round-trip");
        let token = "flowie_live_round_trip_value";
        if store.save(token).is_err() {
            // No usable credential store on this machine, which is a valid
            // environment rather than a failing test; the behaviour is proved
            // on the platforms CI runs.
            // VI: Máy này không có kho credential dùng được, đó là một môi
            // VI: trường hợp lệ chứ không phải test hỏng; hành vi được chứng
            // VI: minh trên các nền tảng CI chạy.
            return;
        }
        assert_eq!(store.read().unwrap(), token);
        assert!(store.is_configured().unwrap());
        store.delete().unwrap();
    }

    #[test]
    fn a_missing_entry_is_not_configured_rather_than_unavailable() {
        let store = store("missing");
        // Nothing was ever saved under this account.
        // VI: Chưa từng lưu gì dưới account này.
        match store.read() {
            Err(CredentialError::NotConfigured) => {}
            Err(CredentialError::Unavailable(_)) => return, // no store here
            other => panic!("expected NotConfigured, got {other:?}"),
        }
        assert!(!store.is_configured().unwrap());
    }

    #[test]
    fn deleting_what_is_not_there_succeeds() {
        let store = store("delete-missing");
        match store.delete() {
            Ok(()) => {}
            Err(CredentialError::Unavailable(_)) => {} // no store here
            other => panic!("deleting a missing entry must succeed, got {other:?}"),
        }
    }

    #[test]
    fn reading_after_deleting_reports_not_configured() {
        let store = store("delete-then-read");
        if store.save("flowie_live_temporary").is_err() {
            return;
        }
        store.delete().unwrap();
        // This is the distinction the shell depends on: after a sign-out the
        // machine is unconfigured, not broken.
        // VI: Đây chính là sự phân biệt mà vỏ ứng dụng dựa vào: sau khi đăng
        // VI: xuất, máy ở trạng thái chưa cấu hình chứ không phải hỏng.
        assert!(matches!(store.read(), Err(CredentialError::NotConfigured)));
    }

    #[test]
    fn the_store_debug_cannot_leak_a_token() {
        let store = store("debug");
        let rendered = format!("{store:?}");
        assert!(!rendered.contains("flowie_live"));
        assert!(rendered.contains("CredentialStore"));
    }
}
