//! Terminating a process and everything it started.
//!
//! Killing only the direct child is not enough: an approved test command runs
//! through a shell or a package manager that starts the real work as a
//! grandchild, and that grandchild keeps the output pipes open. A caller that
//! kills the child and then reads its output blocks until the grandchild
//! finishes on its own, which defeats the timeout entirely.
//! VI: Kết thúc một tiến trình và mọi thứ nó đã khởi động.
//! VI: Chỉ giết tiến trình con trực tiếp là không đủ: một lệnh test đã duyệt
//! VI: chạy qua shell hoặc package manager, và công việc thật nằm ở tiến trình
//! VI: cháu, chính tiến trình cháu đó giữ các pipe output. Bên gọi giết con rồi
//! VI: đọc output sẽ bị chặn tới khi cháu tự kết thúc, làm hỏng hoàn toàn cơ
//! VI: chế timeout.
//!
//! The DTD-492 spike measured both Windows strategies: assigning an already
//! running process to a Job Object kills only that process, because its
//! descendants were created before the assignment, while `taskkill /T /F`
//! cleans the whole tree. A Job Object would have to be created before the
//! process starts, which needs a suspended spawn through CreateProcessW.
//! VI: Spike DTD-492 đã đo cả hai cách trên Windows: gán một tiến trình đang
//! VI: chạy vào Job Object chỉ giết đúng tiến trình đó, vì con cháu của nó
//! VI: sinh ra trước lúc gán, trong khi `taskkill /T /F` dọn sạch cả cây. Muốn
//! VI: dùng Job Object thì phải tạo job trước khi tiến trình khởi động, tức là
//! VI: phải spawn ở trạng thái suspended qua CreateProcessW.

use std::io;
use std::process::Command;
use std::time::Duration;

/// How long a tree gets to exit after a polite signal before it is killed.
/// VI: Thời gian một cây tiến trình được cho để tự thoát sau tín hiệu lịch sự,
/// VI: trước khi bị giết.
pub const GRACE: Duration = Duration::from_millis(500);

/// Ends `pid` and every process it started.
///
/// On Windows this shells out to `taskkill`, which walks the tree by parent
/// id. On Unix it signals the process group, so the child must have been
/// started in its own session for the group to exist; see `spawn_in_own_group`.
/// VI: Kết thúc `pid` và mọi tiến trình nó đã khởi động.
/// VI: Trên Windows dùng `taskkill`, lệnh này đi theo cây dựa vào id tiến
/// VI: trình cha. Trên Unix gửi tín hiệu cho process group, nên tiến trình con
/// VI: phải được khởi động trong session riêng thì group mới tồn tại; xem
/// VI: `spawn_in_own_group`.
pub fn terminate_tree(pid: u32) -> io::Result<()> {
    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()?;
        // Exit code 128 means the process was already gone, which is the
        // outcome the caller wanted.
        // VI: Mã thoát 128 nghĩa là tiến trình đã biến mất, đúng kết quả bên
        // VI: gọi mong muốn.
        if status.success() || status.code() == Some(128) {
            return Ok(());
        }
        Err(io::Error::other(format!(
            "taskkill could not end the tree for pid {pid}"
        )))
    }

    #[cfg(unix)]
    {
        // A negative pid addresses the whole process group.
        // VI: pid âm nhắm tới cả process group.
        let group = -(pid as i32);
        // Signalling a process group has no safe wrapper in the standard
        // library: `kill` is a libc call, so the FFI boundary is the only
        // unsafety here. The arguments are a pid this function was handed and
        // a constant signal number. SIGTERM first so a well behaved tree can
        // shut itself down, SIGKILL after the grace period for one that will
        // not.
        // VI: Gửi tín hiệu cho một process group không có lớp bọc an toàn
        // VI: trong thư viện chuẩn: `kill` là một lời gọi libc nên ranh giới
        // VI: FFI là phần không an toàn duy nhất ở đây. Tham số gồm một pid
        // VI: hàm này nhận được và một hằng số tín hiệu. SIGTERM trước để một
        // VI: cây tiến trình cư xử đúng mực tự tắt, SIGKILL sau thời gian ân
        // VI: hạn cho cây không chịu tắt.
        #[allow(unsafe_code)]
        unsafe {
            libc_kill(group, 15);
        }
        std::thread::sleep(GRACE);
        #[allow(unsafe_code)]
        unsafe {
            libc_kill(group, 9);
        }
        Ok(())
    }
}

// Declaring foreign functions is itself unsafe code; these two are the whole
// surface this crate borrows from libc.
// VI: Khai báo hàm ngoại cũng là mã không an toàn; hai hàm này là toàn bộ bề
// VI: mặt crate này mượn từ libc.
#[cfg(unix)]
#[allow(unsafe_code)]
extern "C" {
    #[link_name = "kill"]
    fn libc_kill(pid: i32, signal: i32) -> i32;
    #[link_name = "setsid"]
    fn libc_setsid() -> i32;
}

/// Configures a command so its children form a group that can be ended
/// together. Without this a timeout can only reach the direct child.
/// VI: Cấu hình một lệnh để con cháu của nó thành một nhóm có thể kết thúc
/// VI: cùng lúc. Thiếu bước này thì timeout chỉ với tới được tiến trình con
/// VI: trực tiếp.
pub fn spawn_in_own_group(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        command.creation_flags(CREATE_NEW_PROCESS_GROUP);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // `pre_exec` is unsafe because its closure runs in the forked child
        // between fork and exec, where only async-signal-safe calls are
        // allowed. `setsid` is on that list and nothing else happens here.
        // VI: `pre_exec` không an toàn vì closure của nó chạy trong tiến trình
        // VI: con đã fork, ở giữa fork và exec, nơi chỉ các lời gọi an toàn
        // VI: với tín hiệu bất đồng bộ được phép. `setsid` nằm trong danh sách
        // VI: đó và ở đây không có gì khác xảy ra.
        #[allow(unsafe_code)]
        unsafe {
            command.pre_exec(|| {
                if libc_setsid() == -1 {
                    return Err(io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Stdio;

    #[test]
    fn terminating_a_vanished_process_is_not_an_error() {
        let mut command = Command::new(if cfg!(windows) { "cmd" } else { "sh" });
        command
            .args(if cfg!(windows) {
                vec!["/C", "exit 0"]
            } else {
                vec!["-c", "exit 0"]
            })
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        spawn_in_own_group(&mut command);
        let mut child = command.spawn().unwrap();
        let pid = child.id();
        child.wait().unwrap();

        // The process is already gone; ending its tree must still succeed so
        // a caller does not have to race the exit.
        // VI: Tiến trình đã biến mất; kết thúc cây của nó vẫn phải thành công
        // VI: để bên gọi không phải chạy đua với thời điểm thoát.
        assert!(terminate_tree(pid).is_ok());
    }
}
