//! Error classification. The shell shows a different state for a revoked
//! token, a missing scope, a lost lease and a network outage, so these must
//! never collapse into one opaque failure: a companion that reports
//! "disconnected" when the real problem is a revoked credential sends its user
//! to restart the network instead of to re-enter a token.
//! VI: Phân loại lỗi. Vỏ ứng dụng hiển thị trạng thái khác nhau cho token bị
//! VI: thu hồi, thiếu scope, mất lease và mất mạng, nên chúng không bao giờ
//! VI: được gộp thành một lỗi chung: companion báo "mất kết nối" trong khi vấn
//! VI: đề thật là credential bị thu hồi sẽ đẩy người dùng đi khởi động lại mạng
//! VI: thay vì đi nhập lại token.

use std::fmt;

/// What went wrong, at the granularity the user interface needs.
/// VI: Chuyện gì đã sai, ở mức chi tiết mà giao diện cần.
#[derive(Debug)]
pub enum Error {
    /// The endpoint string itself is unusable; nothing was sent.
    /// VI: Chuỗi endpoint không dùng được; chưa gửi gì cả.
    Endpoint(String),
    /// The credential was rejected: wrong, expired or revoked (401 or 403
    /// without a named scope).
    /// VI: Credential bị từ chối: sai, hết hạn hoặc bị thu hồi.
    Unauthorized { message: String },
    /// The connection is authenticated but lacks a scope this call needs.
    /// VI: Kết nối đã xác thực nhưng thiếu scope mà lời gọi này cần.
    MissingScope { message: String },
    /// The server does not expose this tool, which means the companion is
    /// newer than the server it is talking to.
    /// VI: Server không có tool này, nghĩa là companion mới hơn server nó đang
    /// VI: nói chuyện cùng.
    UnsupportedTool { name: String },
    /// This agent no longer owns the run: a stale fencing token, a lease that
    /// expired, or another connection took over. Execution must stop before
    /// any further side effect.
    /// VI: Agent không còn sở hữu run: fencing token cũ, lease hết hạn, hoặc
    /// VI: connection khác đã tiếp quản. Phải dừng trước mọi side effect tiếp theo.
    LeaseLost { message: String },
    /// The run passed the server's wall-clock budget and must be released
    /// before any further work is reported.
    /// VI: Run đã vượt giới hạn thời gian của server và phải được release trước
    /// VI: khi báo thêm bất cứ điều gì.
    RunBudgetExhausted { message: String },
    /// The referenced issue, run or document does not exist in the allowed
    /// scope.
    /// VI: Issue, run hay tài liệu được tham chiếu không tồn tại trong phạm vi
    /// VI: được phép.
    NotFound { message: String },
    /// The server rejected the arguments. This is a defect in the caller, not
    /// a condition to retry.
    /// VI: Server từ chối tham số. Đây là lỗi của bên gọi, không phải tình
    /// VI: huống để thử lại.
    InvalidArguments { message: String },
    /// A conflict the categories above do not cover, carrying the server's
    /// status code so a caller can still decide.
    /// VI: Một xung đột không thuộc các nhóm trên, kèm status code của server
    /// VI: để bên gọi vẫn quyết định được.
    Server { status: u16, message: String },
    /// The request never completed: no route, timeout, TLS failure.
    /// VI: Request không hoàn tất: không có đường ra, timeout, lỗi TLS.
    Transport(String),
    /// A reply arrived but did not match the protocol.
    /// VI: Có phản hồi nhưng không đúng giao thức.
    Protocol(String),
    /// The caller's own arguments failed the contract before anything was
    /// sent, so no request was made.
    /// VI: Tham số của chính bên gọi không đạt hợp đồng trước khi gửi, nên
    /// VI: không có request nào được tạo.
    Contract(String),
}

impl Error {
    /// True when the same request may be retried unchanged, reusing its
    /// idempotency key. A lost lease is never retryable: the run has moved on.
    /// VI: Đúng khi có thể thử lại nguyên request đó với cùng idempotency key.
    /// VI: Mất lease thì không bao giờ thử lại được: run đã sang trạng thái khác.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Error::Transport(_)
                | Error::Server {
                    status: 500..=599,
                    ..
                }
        )
    }

    /// True when the operator has to do something before work can continue,
    /// so the tray shows an attention state instead of a transient one.
    /// VI: Đúng khi người vận hành phải làm gì đó thì công việc mới tiếp tục
    /// VI: được, để tray hiện trạng thái cần xử lý thay vì trạng thái tạm thời.
    pub fn needs_operator(&self) -> bool {
        matches!(
            self,
            Error::Endpoint(_)
                | Error::Unauthorized { .. }
                | Error::MissingScope { .. }
                | Error::UnsupportedTool { .. }
        )
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Endpoint(detail) => write!(f, "endpoint is unusable: {detail}"),
            Error::Unauthorized { message } => write!(f, "credential rejected: {message}"),
            Error::MissingScope { message } => write!(f, "missing scope: {message}"),
            Error::UnsupportedTool { name } => {
                write!(f, "server does not provide the tool {name}")
            }
            Error::LeaseLost { message } => write!(f, "lease lost: {message}"),
            Error::RunBudgetExhausted { message } => write!(f, "run budget exhausted: {message}"),
            Error::NotFound { message } => write!(f, "not found: {message}"),
            Error::InvalidArguments { message } => write!(f, "invalid arguments: {message}"),
            Error::Server { status, message } => write!(f, "server error {status}: {message}"),
            Error::Transport(detail) => write!(f, "transport failure: {detail}"),
            Error::Protocol(detail) => write!(f, "protocol violation: {detail}"),
            Error::Contract(detail) => write!(f, "contract violation: {detail}"),
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

/// Maps an HTTP status and the server's message onto a variant. The message
/// text is matched only where the status alone cannot separate two very
/// different operator actions, and every branch falls back to a status-based
/// variant so an unrecognised message is never silently reclassified.
/// VI: Ánh xạ status HTTP và thông điệp của server sang một biến thể. Chỉ đối
/// VI: chiếu nội dung thông điệp ở chỗ mà riêng status không tách được hai
/// VI: hành động vận hành rất khác nhau, và mọi nhánh đều có phương án dự phòng
/// VI: theo status để một thông điệp lạ không bị phân loại sai một cách âm thầm.
pub fn classify(status: u16, message: &str) -> Error {
    let lowered = message.to_ascii_lowercase();
    match status {
        401 => Error::Unauthorized {
            message: message.to_string(),
        },
        403 => {
            if lowered.contains("scope") {
                Error::MissingScope {
                    message: message.to_string(),
                }
            } else {
                Error::Unauthorized {
                    message: message.to_string(),
                }
            }
        }
        404 => Error::NotFound {
            message: message.to_string(),
        },
        // The server uses 409 for both "someone else owns this run now" and
        // "this run ran out of time"; they lead to different recovery, so the
        // message decides between them.
        // VI: Server dùng 409 cho cả "người khác đang sở hữu run này" lẫn "run
        // VI: này hết thời gian"; hai tình huống phục hồi khác nhau nên phải
        // VI: dựa vào thông điệp để phân biệt.
        409 if lowered.contains("budget") => Error::RunBudgetExhausted {
            message: message.to_string(),
        },
        409 if lowered.contains("lease") || lowered.contains("no longer owns") => {
            Error::LeaseLost {
                message: message.to_string(),
            }
        }
        400 | 422 => Error::InvalidArguments {
            message: message.to_string(),
        },
        other => Error::Server {
            status: other,
            message: message.to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // The four messages below were captured from the live server during the
    // DTD-492 spike, so this test pins the mapping to real behaviour.
    // VI: Bốn thông điệp dưới đây ghi được từ server thật trong spike DTD-492,
    // VI: nên test này neo việc ánh xạ vào hành vi thật.
    #[test]
    fn real_server_messages_map_to_distinct_variants() {
        assert!(matches!(
            classify(404, "Issue not found in the allowed scope."),
            Error::NotFound { .. }
        ));
        assert!(matches!(
            classify(404, "Agent run not found."),
            Error::NotFound { .. }
        ));
        assert!(matches!(
            classify(
                400,
                "Tool arguments do not match the input schema: leaseToken: String should have at least 16 characters"
            ),
            Error::InvalidArguments { .. }
        ));
        assert!(matches!(
            classify(
                400,
                "Tool arguments do not match the input schema: arguments: Value error, A code result awaiting review must report the tests it executed."
            ),
            Error::InvalidArguments { .. }
        ));
    }

    #[test]
    fn conflict_splits_into_lease_and_budget() {
        assert!(matches!(
            classify(
                409,
                "The run exceeded its two-hour budget. Release it before starting again."
            ),
            Error::RunBudgetExhausted { .. }
        ));
        assert!(matches!(
            classify(409, "This agent no longer owns the run."),
            Error::LeaseLost { .. }
        ));
        assert!(matches!(
            classify(409, "The lease expired or the run is no longer running."),
            Error::LeaseLost { .. }
        ));
        // An unrecognised conflict keeps its status rather than being guessed
        // into one of the two recoveries above.
        // VI: Xung đột không nhận ra thì giữ nguyên status chứ không bị đoán
        // VI: thành một trong hai hướng phục hồi ở trên.
        assert!(matches!(
            classify(409, "This issue is assigned to another agent connection."),
            Error::Server { status: 409, .. }
        ));
    }

    #[test]
    fn forbidden_separates_scope_from_credential() {
        assert!(matches!(
            classify(403, "The connection is missing the runs:write scope."),
            Error::MissingScope { .. }
        ));
        assert!(matches!(
            classify(403, "Only the owning connection can cancel this run."),
            Error::Unauthorized { .. }
        ));
    }

    #[test]
    fn retry_and_operator_attention_are_separate_questions() {
        assert!(Error::Transport("timed out".into()).is_retryable());
        assert!(Error::Server {
            status: 503,
            message: String::new()
        }
        .is_retryable());
        assert!(!Error::LeaseLost {
            message: String::new()
        }
        .is_retryable());
        assert!(!Error::InvalidArguments {
            message: String::new()
        }
        .is_retryable());

        assert!(Error::Unauthorized {
            message: String::new()
        }
        .needs_operator());
        assert!(Error::MissingScope {
            message: String::new()
        }
        .needs_operator());
        assert!(!Error::Transport("offline".into()).needs_operator());
    }
}
