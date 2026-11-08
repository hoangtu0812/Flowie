//! Provider adapters for Claude Code and Codex, and the lifecycle of the
//! processes they run.
//!
//! The crate answers two questions: can this machine run this provider at
//! all, and what happened when it did. It never relaxes a provider's own
//! safety settings to make a run succeed: a sandbox flag the runner depends
//! on being absent is reported as a tool too old, not worked around.
//! VI: Adapter provider cho Claude Code và Codex, cùng vòng đời các tiến trình
//! VI: chúng chạy.
//! VI: Crate trả lời hai câu hỏi: máy này có chạy được provider này không, và
//! VI: chuyện gì đã xảy ra khi chạy. Nó không bao giờ nới lỏng thiết lập an
//! VI: toàn của provider để một run thành công: thiếu một flag sandbox mà
//! VI: runner phụ thuộc thì được báo là công cụ quá cũ, chứ không tìm cách
//! VI: lách.

pub mod driver;
pub mod error;
pub mod invoke;
pub mod prompt;
pub mod provider;
pub mod stream;

pub use driver::{Driver, DEFAULT_TIMEOUT};
pub use error::{Error, Result};
pub use invoke::{Phase, CODEX_RESULT_MAX};
pub use prompt::{checked_review, checked_summary, review_prompt, task_prompt};
pub use provider::{Capability, Provider};
pub use stream::{Finished, LINE_LIMIT};
