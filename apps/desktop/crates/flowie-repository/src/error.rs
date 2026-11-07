//! Failures this crate can produce. A Git or SCM failure is kept separate
//! from a failing test and from a bad configuration, because the companion
//! reports them differently: a failed test is a result to send to Flowie,
//! while a push that was refused leaves a good commit sitting locally and
//! needs a person.
//! VI: Các thất bại crate này có thể tạo ra. Lỗi Git hoặc SCM được tách khỏi
//! VI: test thất bại và khỏi cấu hình sai, vì companion báo chúng theo cách
//! VI: khác nhau: test thất bại là một kết quả để gửi về Flowie, còn một lần
//! VI: push bị từ chối để lại một commit tốt nằm ở máy và cần người xử lý.

use std::fmt;
use std::path::PathBuf;

#[derive(Debug)]
pub enum Error {
    /// The repository configuration cannot be used as given.
    /// VI: Cấu hình repository không dùng được như đang có.
    Configuration(String),
    /// The local checkout does not match the configuration: wrong remote, no
    /// base branch, not a repository.
    /// VI: Checkout tại máy không khớp cấu hình: sai remote, không có base
    /// VI: branch, không phải repository.
    Checkout(String),
    /// Git itself failed.
    /// VI: Bản thân git thất bại.
    Git { message: String },
    /// A test command could not be started or observed. This is not the same
    /// as a test that ran and failed, which is a normal result.
    /// VI: Một lệnh test không khởi động hoặc không theo dõi được. Khác với
    /// VI: test đã chạy và thất bại, vốn là một kết quả bình thường.
    TestCommand { name: String, message: String },
    /// A worktree was kept because it still holds work, and the caller must
    /// decide what happens to it.
    /// VI: Một worktree được giữ lại vì còn chứa việc, và bên gọi phải quyết
    /// VI: định số phận của nó.
    WorktreeKept { path: PathBuf, reason: String },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Configuration(detail) => write!(f, "invalid configuration: {detail}"),
            Error::Checkout(detail) => write!(f, "checkout does not match: {detail}"),
            Error::Git { message } => write!(f, "git failed: {message}"),
            Error::TestCommand { name, message } => {
                write!(f, "test command {name} could not run: {message}")
            }
            Error::WorktreeKept { path, reason } => {
                write!(f, "worktree kept at {}: {reason}", path.display())
            }
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;
