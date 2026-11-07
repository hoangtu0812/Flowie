//! Finding a program the way the platform really finds it.
//!
//! On Windows `CreateProcess` only appends `.exe` when it searches PATH, so a
//! bare name never reaches an npm shim such as `claude.cmd`. The DTD-492
//! spike measured this on a real machine: Claude Code resolved to
//! `AppData\Roaming\npm\claude.cmd`, which a plain spawn would not have
//! found. PATHEXT is therefore applied explicitly.
//! VI: Tìm một chương trình đúng theo cách nền tảng thật sự tìm nó.
//! VI: Trên Windows, `CreateProcess` chỉ thêm `.exe` khi tìm trong PATH nên
//! VI: một tên trần không bao giờ tới được shim npm như `claude.cmd`. Spike
//! VI: DTD-492 đã đo điều này trên máy thật: Claude Code phân giải thành
//! VI: `AppData\Roaming\npm\claude.cmd`, thứ mà một lần spawn thường sẽ không
//! VI: tìm ra. Vì vậy PATHEXT được áp dụng tường minh.
//!
//! On macOS the problem is different: a GUI application does not inherit the
//! PATH a terminal has, so a tool installed by a package manager may be
//! invisible. There the answer is to let the operator name the executable,
//! which is why an absolute path is always accepted.
//! VI: Trên macOS vấn đề khác: ứng dụng GUI không kế thừa PATH của terminal
//! VI: nên một công cụ cài bằng package manager có thể không nhìn thấy được.
//! VI: Ở đó cách giải quyết là để người vận hành chỉ định executable, nên một
//! VI: đường dẫn tuyệt đối luôn được chấp nhận.

use std::path::{Path, PathBuf};

/// Default extensions when PATHEXT is unset, matching what Windows itself
/// falls back to.
/// VI: Phần mở rộng mặc định khi PATHEXT không được đặt, khớp với thứ Windows
/// VI: tự dùng.
const DEFAULT_PATHEXT: &str = ".COM;.EXE;.BAT;.CMD";

/// Resolves `program` to a file that can be executed, or `None`.
///
/// An absolute path is taken as given: that is how an operator points at an
/// executable the search would not find.
/// VI: Phân giải `program` thành một file chạy được, hoặc `None`.
/// VI: Đường dẫn tuyệt đối được lấy nguyên: đó là cách người vận hành chỉ tới
/// VI: một executable mà việc tìm kiếm sẽ không thấy.
pub fn resolve(program: &str) -> Option<PathBuf> {
    resolve_in(
        program,
        std::env::var_os("PATH").as_deref(),
        pathext().as_deref(),
    )
}

fn pathext() -> Option<std::ffi::OsString> {
    if cfg!(windows) {
        Some(
            std::env::var_os("PATHEXT")
                .unwrap_or_else(|| std::ffi::OsString::from(DEFAULT_PATHEXT)),
        )
    } else {
        None
    }
}

/// The search itself, with the environment passed in so it can be tested.
/// VI: Phần tìm kiếm, nhận môi trường từ ngoài vào để kiểm thử được.
pub fn resolve_in(
    program: &str,
    path: Option<&std::ffi::OsStr>,
    pathext: Option<&std::ffi::OsStr>,
) -> Option<PathBuf> {
    if program.is_empty() {
        return None;
    }

    let direct = Path::new(program);
    if direct.is_absolute() {
        return direct.is_file().then(|| direct.to_path_buf());
    }
    // A name carrying a separator is a relative path, not a PATH lookup.
    // VI: Một tên có chứa dấu phân cách là đường dẫn tương đối, không phải
    // VI: việc tra trong PATH.
    if program.contains('/') || program.contains('\\') {
        return direct.is_file().then(|| direct.to_path_buf());
    }

    let extensions: Vec<String> = match pathext {
        Some(value) => value
            .to_string_lossy()
            .split(';')
            .filter(|extension| !extension.is_empty())
            .map(|extension| extension.to_ascii_lowercase())
            .collect(),
        None => Vec::new(),
    };

    for directory in std::env::split_paths(path?) {
        if directory.as_os_str().is_empty() {
            continue;
        }
        // The bare name first: on Unix that is the whole answer, and on
        // Windows an extensionless file is still executable if it is there.
        // VI: Tên trần trước: trên Unix đó là toàn bộ câu trả lời, còn trên
        // VI: Windows một file không phần mở rộng vẫn chạy được nếu có mặt.
        let bare = directory.join(program);
        if bare.is_file() {
            return Some(bare);
        }
        for extension in &extensions {
            let candidate = directory.join(format!("{program}{extension}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    fn fixture() -> tempfile::TempDir {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("claude.cmd"), "shim").unwrap();
        std::fs::write(directory.path().join("codex.exe"), "binary").unwrap();
        std::fs::write(directory.path().join("plain"), "script").unwrap();
        directory
    }

    #[test]
    fn a_shim_is_found_through_pathext() {
        let directory = fixture();
        let path = OsString::from(directory.path());
        let pathext = OsString::from(".COM;.EXE;.BAT;.CMD");

        let found = resolve_in("claude", Some(&path), Some(&pathext)).unwrap();
        assert_eq!(found.file_name().unwrap(), "claude.cmd");
    }

    #[test]
    fn without_pathext_the_shim_is_invisible() {
        // This is the failure the explicit lookup exists to prevent: a plain
        // spawn on Windows would not find claude.cmd either.
        // VI: Đây chính là thất bại mà việc tra tường minh sinh ra để ngăn:
        // VI: một lần spawn thường trên Windows cũng sẽ không tìm ra claude.cmd.
        let directory = fixture();
        let path = OsString::from(directory.path());
        assert!(resolve_in("claude", Some(&path), None).is_none());
    }

    #[test]
    fn an_extensionless_file_is_found_before_the_extensions() {
        let directory = fixture();
        let path = OsString::from(directory.path());
        let pathext = OsString::from(".EXE");
        let found = resolve_in("plain", Some(&path), Some(&pathext)).unwrap();
        assert_eq!(found.file_name().unwrap(), "plain");
    }

    #[test]
    fn an_absolute_path_is_taken_as_given() {
        let directory = fixture();
        let target = directory.path().join("codex.exe");
        let found = resolve_in(target.to_str().unwrap(), None, None).unwrap();
        assert_eq!(found, target);
    }

    #[test]
    fn an_absolute_path_that_does_not_exist_resolves_to_nothing() {
        let directory = fixture();
        let missing = directory.path().join("not-here.exe");
        assert!(resolve_in(missing.to_str().unwrap(), None, None).is_none());
    }

    #[test]
    fn a_missing_program_resolves_to_nothing() {
        let directory = fixture();
        let path = OsString::from(directory.path());
        let pathext = OsString::from(".EXE;.CMD");
        assert!(resolve_in("nothing-here", Some(&path), Some(&pathext)).is_none());
        assert!(resolve_in("", Some(&path), Some(&pathext)).is_none());
    }

    #[test]
    fn empty_path_entries_are_skipped_rather_than_searched() {
        // An empty entry means the current directory on some systems, which
        // would let a file in the checkout shadow a real tool.
        // VI: Một mục rỗng có nghĩa là thư mục hiện tại trên một số hệ thống,
        // VI: điều đó cho phép một file trong checkout che mất công cụ thật.
        let directory = fixture();
        let joined =
            std::env::join_paths([std::path::PathBuf::new(), directory.path().to_path_buf()])
                .unwrap();
        let pathext = OsString::from(".CMD");
        let found = resolve_in("claude", Some(&joined), Some(&pathext)).unwrap();
        assert!(found.starts_with(directory.path()));
    }
}
