//! Git invocation. Every command is an argument vector handed straight to the
//! process, never a shell string: branch names, paths and repository URLs
//! arrive from the server, and building a command line out of them is how a
//! task title ends up executing something.
//! VI: Gọi Git. Mọi lệnh là một mảng argument đưa thẳng cho tiến trình, không
//! VI: bao giờ là chuỗi shell: tên nhánh, đường dẫn và URL repository đến từ
//! VI: server, và ghép chúng thành dòng lệnh chính là cách một tiêu đề task
//! VI: biến thành thứ được thực thi.

use std::ffi::OsStr;
use std::path::Path;
use std::process::{Command, Stdio};

use crate::error::{Error, Result};

/// A finished git invocation.
/// VI: Một lần gọi git đã kết thúc.
pub struct Output {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

impl Output {
    pub fn ok(&self) -> bool {
        self.status == 0
    }

    /// The trimmed first line of stdout, which is what most porcelain commands
    /// answer with.
    /// VI: Dòng đầu của stdout đã cắt khoảng trắng, thứ mà phần lớn lệnh
    /// VI: porcelain trả về.
    pub fn line(&self) -> &str {
        self.stdout.lines().next().unwrap_or("").trim()
    }
}

/// Runs git in `directory`. The child inherits no environment beyond what the
/// platform needs, so a credential helper configured for the user still works
/// while Flowie's own secrets stay out of the process.
/// VI: Chạy git trong `directory`. Tiến trình con không kế thừa môi trường nào
/// VI: ngoài những gì nền tảng cần, nên credential helper người dùng cấu hình
/// VI: vẫn hoạt động trong khi các bí mật của Flowie không lọt vào tiến trình.
pub fn run<I, S>(directory: &Path, arguments: I) -> Result<Output>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = Command::new("git")
        .args(arguments)
        .current_dir(directory)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| Error::Git {
            message: format!("git could not be started: {error}"),
        })?;
    Ok(Output {
        status: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

/// Runs git and turns a non-zero exit into an error naming what was attempted.
/// VI: Chạy git và biến exit khác 0 thành lỗi có nêu việc đang làm.
pub fn checked<I, S>(directory: &Path, what: &str, arguments: I) -> Result<Output>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = run(directory, arguments)?;
    if !output.ok() {
        return Err(Error::Git {
            message: format!("{what} failed: {}", output.stderr.trim()),
        });
    }
    Ok(output)
}

/// Rejects a branch name the way the Python runner's configuration does,
/// before it reaches git at all. A leading dash would be read as an option,
/// and `..` or whitespace make a ref that does not mean what it looks like.
/// VI: Từ chối một tên nhánh giống như cấu hình của runner Python, trước khi
/// VI: nó tới được git. Dấu gạch đầu dòng sẽ bị đọc thành tuỳ chọn, còn `..`
/// VI: hay khoảng trắng tạo ra một ref không mang nghĩa như vẻ ngoài của nó.
pub fn validate_branch(name: &str) -> Result<()> {
    if name.is_empty() {
        return Err(Error::Configuration("the base branch is empty".into()));
    }
    if name.starts_with('-') {
        return Err(Error::Configuration(
            "a branch name must not start with a dash".into(),
        ));
    }
    if name.contains("..") {
        return Err(Error::Configuration(
            "a branch name must not contain ..".into(),
        ));
    }
    if name.chars().any(char::is_whitespace) {
        return Err(Error::Configuration(
            "a branch name must not contain whitespace".into(),
        ));
    }
    Ok(())
}

/// Compares two remote URLs for the same repository. Git accepts a trailing
/// `.git` and a trailing slash interchangeably, and hosts are case
/// insensitive, so a literal comparison would reject correct configurations.
/// VI: So sánh hai URL remote của cùng một repository. Git chấp nhận lẫn lộn
/// VI: hậu tố `.git` và dấu gạch chéo cuối, còn host thì không phân biệt hoa
/// VI: thường, nên so sánh nguyên văn sẽ từ chối cả cấu hình đúng.
pub fn same_remote(left: &str, right: &str) -> bool {
    fn normalise(value: &str) -> String {
        let trimmed = value.trim().trim_end_matches('/');
        let trimmed = trimmed.strip_suffix(".git").unwrap_or(trimmed);
        trimmed.to_ascii_lowercase()
    }
    normalise(left) == normalise(right)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn branch_names_follow_the_runner_rules() {
        assert!(validate_branch("main").is_ok());
        assert!(validate_branch("feature/x-1").is_ok());
        assert!(matches!(validate_branch(""), Err(Error::Configuration(_))));
        assert!(matches!(
            validate_branch("--upload-pack=touch"),
            Err(Error::Configuration(_))
        ));
        assert!(matches!(
            validate_branch("a..b"),
            Err(Error::Configuration(_))
        ));
        assert!(matches!(
            validate_branch("has space"),
            Err(Error::Configuration(_))
        ));
    }

    #[test]
    fn remote_comparison_tolerates_git_suffix_and_case() {
        assert!(same_remote(
            "https://github.com/hoangtu0812/Flowie.git",
            "https://github.com/hoangtu0812/Flowie"
        ));
        assert!(same_remote(
            "https://GitHub.com/A/B/",
            "https://github.com/a/b"
        ));
        assert!(!same_remote(
            "https://github.com/a/b",
            "https://github.com/a/c"
        ));
    }
}
