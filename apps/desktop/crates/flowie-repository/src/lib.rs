//! Git access for a run: verifying the checkout against the configuration the
//! server hands out, cutting a worktree per run beside the checkout, running
//! the approved test commands and committing the result.
//!
//! The crate holds one rule above the others: a worktree that still contains
//! work is never removed. Leaving a directory behind costs disk space, while
//! deleting it costs someone their changes.
//! VI: Truy cập Git cho một run: đối chiếu checkout với cấu hình server cấp,
//! VI: cắt một worktree cho mỗi run đặt cạnh checkout, chạy các lệnh test đã
//! VI: duyệt và commit kết quả.
//! VI: Crate giữ một quy tắc cao hơn những quy tắc khác: không bao giờ xoá một
//! VI: worktree còn chứa công việc. Để thừa một thư mục chỉ tốn dung lượng,
//! VI: còn xoá nó thì ai đó mất thay đổi của mình.

pub mod error;
pub mod git;
pub mod repository;
pub mod tests_runner;

pub use error::{Error, Result};
pub use repository::{Repository, RepositoryConfig, Retired, Worktree};
pub use tests_runner::{Executed, DEFAULT_TIMEOUT_SECONDS, LOG_TAIL, TIMEOUT_EXIT_CODE};
