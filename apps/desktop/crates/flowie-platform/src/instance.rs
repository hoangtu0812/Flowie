//! One companion per machine.
//!
//! The server does not limit how many runs a connection may hold at once: a
//! claim only checks the issue being claimed, so two companions sharing a
//! token would each claim a different run and the server would accept both.
//! That is G3 in the desktop plan, and it means "one run at a time on this
//! machine" is a promise only the client can keep.
//! VI: Mỗi máy chỉ một companion.
//! VI: Server không giới hạn số run một connection giữ cùng lúc: claim chỉ
//! VI: kiểm issue đang claim, nên hai companion dùng chung token sẽ mỗi bên
//! VI: claim một run khác nhau và server chấp nhận cả hai. Đó là G3 trong kế
//! VI: hoạch desktop, nghĩa là "một lượt mỗi máy" là lời hứa chỉ phía client
//! VI: mới giữ được.
//!
//! The lock is held by the operating system on an open file rather than by a
//! pid written into one. A pid file cannot tell a running companion from a
//! crashed one whose pid has been reused, and the window where it guesses
//! wrong is exactly the window after a crash, when a person is most likely to
//! start the app again.
//! VI: Khoá do hệ điều hành giữ trên một file đang mở, chứ không phải bằng
//! VI: pid ghi vào file. File pid không phân biệt được companion đang chạy với
//! VI: companion đã chết mà pid bị cấp lại, và khoảng thời gian nó đoán sai
//! VI: chính là khoảng ngay sau một lần crash, lúc người dùng dễ mở lại ứng
//! VI: dụng nhất.

use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Holds the machine-wide claim for as long as it is alive. Dropping it, or
/// the process exiting for any reason including a crash, releases the lock:
/// the operating system closes the handle either way.
/// VI: Giữ quyền trên toàn máy chừng nào nó còn sống. Thả nó ra, hoặc tiến
/// VI: trình kết thúc vì bất kỳ lý do gì kể cả crash, đều nhả khoá: hệ điều
/// VI: hành đóng handle trong cả hai trường hợp.
#[derive(Debug)]
pub struct InstanceGuard {
    path: PathBuf,
    // Kept open for its lock; never read. Dropping the File is what releases.
    // VI: Giữ mở để giữ khoá; không bao giờ đọc. Thả File ra chính là nhả khoá.
    _file: File,
}

impl InstanceGuard {
    pub fn path(&self) -> &Path {
        &self.path
    }
}

/// Why the companion could not claim this machine.
/// VI: Vì sao companion không giành được máy này.
#[derive(Debug)]
pub enum InstanceError {
    /// Another companion is already running here.
    /// VI: Đã có một companion khác đang chạy ở đây.
    AlreadyRunning { path: PathBuf },
    /// The lock file could not be created or opened at all.
    /// VI: Hoàn toàn không tạo hay mở được file khoá.
    Unusable { path: PathBuf, message: String },
}

impl std::fmt::Display for InstanceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InstanceError::AlreadyRunning { path } => write!(
                f,
                "another Flowie companion already holds {}",
                path.display()
            ),
            InstanceError::Unusable { path, message } => {
                write!(f, "cannot use the lock at {}: {message}", path.display())
            }
        }
    }
}

impl std::error::Error for InstanceError {}

/// Takes the machine-wide lock, or reports who has it.
///
/// `directory` is the companion's own data directory, so the lock lives
/// beside its other state and is per-user: two people signed into the same
/// computer each get their own companion, which is correct, because each has
/// their own Flowie connection.
/// VI: Giành khoá toàn máy, hoặc báo ai đang giữ.
/// VI: `directory` là thư mục dữ liệu của chính companion, nên khoá nằm cạnh
/// VI: trạng thái khác của nó và theo từng người dùng: hai người đăng nhập
/// VI: cùng một máy tính thì mỗi người có companion riêng, điều đó đúng, vì
/// VI: mỗi người có kết nối Flowie riêng.
pub fn acquire(directory: &Path) -> Result<InstanceGuard, InstanceError> {
    std::fs::create_dir_all(directory).map_err(|error| InstanceError::Unusable {
        path: directory.to_path_buf(),
        message: error.to_string(),
    })?;
    let path = directory.join("companion.lock");

    let file = match open_locked(&path) {
        Ok(file) => file,
        Err(error) if is_contention(&error) => {
            return Err(InstanceError::AlreadyRunning { path });
        }
        Err(error) => {
            return Err(InstanceError::Unusable {
                path,
                message: error.to_string(),
            })
        }
    };

    let mut guard = InstanceGuard { path, _file: file };
    // The pid is written for a person reading the file during diagnosis. It
    // is deliberately not what enforces the lock.
    // VI: Pid được ghi để người chẩn đoán đọc được. Cố ý không dùng nó để
    // VI: thực thi khoá.
    let _ = writeln!(guard._file, "{}", std::process::id());
    Ok(guard)
}

/// Opens the lock file in a way that fails while another process holds it.
///
/// Windows does this with the share mode: opening with no sharing makes the
/// second open fail, and the handle closing on exit releases it. Unix has no
/// equivalent on open, so the file is opened normally and then locked.
/// VI: Mở file khoá theo cách thất bại khi tiến trình khác đang giữ.
/// VI: Windows làm điều này bằng share mode: mở với chế độ không chia sẻ khiến
/// VI: lần mở thứ hai thất bại, và handle đóng lúc thoát sẽ nhả khoá. Unix
/// VI: không có cơ chế tương đương lúc mở, nên mở bình thường rồi khoá sau.
#[cfg(windows)]
fn open_locked(path: &Path) -> io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .share_mode(0)
        .open(path)
}

#[cfg(unix)]
fn open_locked(path: &Path) -> io::Result<File> {
    use std::os::unix::io::AsRawFd;
    const LOCK_EX: i32 = 2;
    const LOCK_NB: i32 = 4;
    let file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)?;
    // flock has no safe wrapper in the standard library; the FFI boundary is
    // the only unsafety, and the descriptor is one this function just opened.
    // VI: flock không có lớp bọc an toàn trong thư viện chuẩn; ranh giới FFI là
    // VI: phần không an toàn duy nhất, và descriptor là thứ hàm này vừa mở.
    #[allow(unsafe_code)]
    let locked = unsafe { libc_flock(file.as_raw_fd(), LOCK_EX | LOCK_NB) };
    if locked == -1 {
        return Err(io::Error::last_os_error());
    }
    Ok(file)
}

#[cfg(unix)]
#[allow(unsafe_code)]
extern "C" {
    #[link_name = "flock"]
    fn libc_flock(fd: i32, operation: i32) -> i32;
}

/// Distinguishes "someone else holds it" from "this path is unusable", so a
/// missing directory or a read-only disk is not reported as a second
/// companion.
/// VI: Phân biệt "người khác đang giữ" với "đường dẫn này không dùng được", để
/// VI: một thư mục không tồn tại hay đĩa chỉ đọc không bị báo thành companion
/// VI: thứ hai.
fn is_contention(error: &io::Error) -> bool {
    #[cfg(windows)]
    {
        // ERROR_SHARING_VIOLATION (32) and ERROR_LOCK_VIOLATION (33).
        // VI: ERROR_SHARING_VIOLATION (32) và ERROR_LOCK_VIOLATION (33).
        matches!(error.raw_os_error(), Some(32) | Some(33))
    }
    #[cfg(unix)]
    {
        matches!(
            error.kind(),
            io::ErrorKind::WouldBlock | io::ErrorKind::ResourceBusy
        ) || matches!(error.raw_os_error(), Some(11) | Some(35))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_companion_takes_the_lock() {
        let directory = tempfile::tempdir().unwrap();
        let guard = acquire(directory.path()).unwrap();
        assert!(guard.path().is_file());
    }

    #[test]
    fn a_second_companion_in_the_same_process_is_refused() {
        let directory = tempfile::tempdir().unwrap();
        let _first = acquire(directory.path()).unwrap();
        match acquire(directory.path()) {
            Err(InstanceError::AlreadyRunning { .. }) => {}
            other => panic!("a second instance must be refused, got {other:?}"),
        }
    }

    #[test]
    fn releasing_the_guard_frees_the_machine() {
        let directory = tempfile::tempdir().unwrap();
        {
            let _first = acquire(directory.path()).unwrap();
        }
        // After the first companion exits, the next one starts normally. This
        // is the path a person takes after quitting and reopening the app.
        // VI: Sau khi companion thứ nhất thoát, cái kế tiếp khởi động bình
        // VI: thường. Đây là đường đi của người dùng khi thoát rồi mở lại ứng
        // VI: dụng.
        let second = acquire(directory.path());
        assert!(second.is_ok(), "{second:?}");
    }

    #[test]
    fn two_user_directories_do_not_contend() {
        // Two people signed into one computer each run their own companion
        // with their own Flowie connection, so they must not block each other.
        // VI: Hai người đăng nhập cùng một máy tính đều chạy companion riêng
        // VI: với kết nối Flowie riêng, nên không được chặn nhau.
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let _a = acquire(first.path()).unwrap();
        let _b = acquire(second.path()).unwrap();
    }

    #[test]
    fn the_directory_is_created_when_missing() {
        let root = tempfile::tempdir().unwrap();
        let nested = root.path().join("state").join("companion");
        let guard = acquire(&nested).unwrap();
        assert!(guard.path().starts_with(&nested));
    }

    #[test]
    fn an_unusable_path_is_not_reported_as_another_instance() {
        // A file where the directory should be cannot be used, and that is a
        // different problem from contention; conflating them would tell the
        // person to close an app that is not running.
        // VI: Một file nằm ở chỗ lẽ ra là thư mục thì không dùng được, và đó là
        // VI: vấn đề khác với tranh chấp; gộp chúng lại sẽ bảo người dùng đóng
        // VI: một ứng dụng vốn không chạy.
        let root = tempfile::tempdir().unwrap();
        let blocker = root.path().join("blocked");
        std::fs::write(&blocker, b"not a directory").unwrap();
        match acquire(&blocker) {
            Err(InstanceError::Unusable { .. }) => {}
            other => panic!("expected Unusable, got {other:?}"),
        }
    }

    #[test]
    fn the_lock_file_records_the_pid_for_diagnosis() {
        let directory = tempfile::tempdir().unwrap();
        let guard = acquire(directory.path()).unwrap();
        // Windows holds the file with no sharing, so the contents are only
        // readable after release; the check is that it is written at all.
        // VI: Windows giữ file ở chế độ không chia sẻ nên chỉ đọc được nội
        // VI: dung sau khi nhả; phép kiểm ở đây là nó có được ghi hay không.
        let path = guard.path().to_path_buf();
        drop(guard);
        let written = std::fs::read_to_string(&path).unwrap_or_default();
        assert_eq!(written.trim(), std::process::id().to_string());
    }
}
