//! Failures from running an agent command line tool.
//!
//! A tool that is absent, a tool too old, a tool nobody signed into and a
//! tool that produced unusable output are four different situations, and the
//! companion shows a different thing for each. Collapsing them would leave
//! an operator guessing which of four fixes to try.
//! VI: Các thất bại khi chạy công cụ dòng lệnh của agent.
//! VI: Công cụ không có, công cụ quá cũ, công cụ chưa ai đăng nhập và công cụ
//! VI: sinh ra output không dùng được là bốn tình huống khác nhau, và companion
//! VI: hiển thị khác nhau cho từng cái. Gộp chúng lại sẽ khiến người vận hành
//! VI: phải đoán xem nên thử cách sửa nào trong bốn cách.

use std::fmt;

#[derive(Debug)]
pub enum Error {
    /// The process could not be started at all.
    /// VI: Tiến trình hoàn toàn không khởi động được.
    Spawn { program: String, message: String },
    /// The tool ran past its deadline and its whole tree was ended.
    /// VI: Công cụ chạy quá hạn và cả cây tiến trình của nó đã bị kết thúc.
    TimedOut { program: String, seconds: u64 },
    /// A single line of output exceeded the limit. Stream-JSON events can
    /// embed whole files, but an unbounded line is a way to exhaust memory.
    /// VI: Một dòng output vượt giới hạn. Sự kiện stream-JSON có thể nhúng cả
    /// VI: file, nhưng một dòng không giới hạn là cách làm cạn bộ nhớ.
    LineTooLong { bytes: usize },
    /// The tool finished but its output did not match the agreed shape.
    /// VI: Công cụ chạy xong nhưng output không đúng hình dạng đã thống nhất.
    Output { program: String, message: String },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Spawn { program, message } => write!(f, "could not run {program}: {message}"),
            Error::TimedOut { program, seconds } => {
                write!(f, "{program} exceeded its {seconds} second deadline")
            }
            Error::LineTooLong { bytes } => {
                write!(f, "a single output line reached {bytes} bytes")
            }
            Error::Output { program, message } => {
                write!(f, "{program} produced unusable output: {message}")
            }
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;
