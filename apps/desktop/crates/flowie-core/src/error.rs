//! Failures in reading or accepting this machine's setup.
//!
//! "Not configured yet" is separated from "configured wrongly" and from
//! "the file cannot be read", because the companion shows a different thing
//! for each: an onboarding screen, the specific complaint, or a disk problem
//! the person has to fix outside the app.
//! VI: Các thất bại khi đọc hoặc chấp nhận thiết lập của máy này.
//! VI: "Chưa cấu hình" được tách khỏi "cấu hình sai" và khỏi "không đọc được
//! VI: file", vì companion hiển thị khác nhau cho từng trường hợp: màn hình
//! VI: thiết lập, lời phàn nàn cụ thể, hay một vấn đề về đĩa mà người dùng
//! VI: phải xử lý bên ngoài ứng dụng.

use std::fmt;
use std::path::PathBuf;

#[derive(Debug)]
pub enum ConfigError {
    /// No configuration exists yet; this machine has never been set up.
    /// VI: Chưa có cấu hình nào; máy này chưa từng được thiết lập.
    NotConfigured,
    /// The configuration exists but cannot be used as written.
    /// VI: Cấu hình có tồn tại nhưng không dùng được như đang viết.
    Invalid(String),
    /// The file is not valid JSON, or carries a field this build does not
    /// know, which is how a typo is caught rather than silently dropped.
    /// VI: File không phải JSON hợp lệ, hoặc mang một trường bản dựng này
    /// VI: không biết, đó là cách bắt lỗi gõ sai thay vì âm thầm bỏ qua.
    Malformed { path: PathBuf, message: String },
    /// The file could not be read or written at all.
    /// VI: Hoàn toàn không đọc hay ghi được file.
    Unreadable { path: PathBuf, message: String },
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigError::NotConfigured => {
                f.write_str("this machine has not been set up for Flowie yet")
            }
            ConfigError::Invalid(detail) => write!(f, "the configuration is not usable: {detail}"),
            ConfigError::Malformed { path, message } => {
                write!(f, "{} could not be understood: {message}", path.display())
            }
            ConfigError::Unreadable { path, message } => {
                write!(f, "{} could not be read: {message}", path.display())
            }
        }
    }
}

impl std::error::Error for ConfigError {}

pub type Result<T> = std::result::Result<T, ConfigError>;
