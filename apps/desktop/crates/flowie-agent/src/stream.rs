//! Reading an agent's output without letting it exhaust memory or outlive
//! its deadline.
//!
//! An agent streams JSON events, and a single event can embed a whole file,
//! so lines are large by design but not unbounded. Both streams are drained
//! on their own threads: leaving either unread fills its pipe buffer and the
//! agent blocks writing to it, which looks exactly like a hung agent.
//! VI: Đọc output của agent mà không để nó làm cạn bộ nhớ hay sống quá hạn.
//! VI: Agent phát luồng sự kiện JSON, và một sự kiện có thể nhúng cả một file,
//! VI: nên các dòng vốn dĩ lớn nhưng không được vô hạn. Cả hai luồng đều được
//! VI: rút trên thread riêng: bỏ đọc một luồng sẽ làm đầy bộ đệm pipe và agent
//! VI: bị chặn khi ghi, hiện tượng y hệt một agent bị treo.

use std::io::{BufRead, BufReader, Read, Write};
use std::process::Child;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use crate::error::Error;

/// One line may carry an entire file inside a stream-JSON event, so the limit
/// is generous; it exists to stop a runaway writer, not to bound normal work.
/// VI: Một dòng có thể mang cả một file bên trong sự kiện stream-JSON nên giới
/// VI: hạn khá rộng; nó tồn tại để chặn một bên ghi mất kiểm soát, không phải
/// VI: để giới hạn công việc bình thường.
pub const LINE_LIMIT: usize = 16 * 1024 * 1024;

/// What a finished process produced.
/// VI: Những gì một tiến trình đã kết thúc tạo ra.
pub struct Finished {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Reads a stream line by line, handing each line to `on_line`, and stops
/// with an error rather than growing without bound.
/// VI: Đọc một luồng theo từng dòng, chuyển mỗi dòng cho `on_line`, và dừng
/// VI: bằng một lỗi thay vì phình ra không giới hạn.
pub fn read_lines<R: Read>(
    reader: R,
    mut on_line: impl FnMut(String),
) -> std::result::Result<(), Error> {
    let mut buffered = BufReader::new(reader);
    let mut line = Vec::new();
    loop {
        line.clear();
        let mut read = 0usize;
        loop {
            let available = match buffered.fill_buf() {
                Ok(buffer) => buffer,
                Err(ref error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => return Ok(()),
            };
            if available.is_empty() {
                break;
            }
            let (used, done) = match available.iter().position(|byte| *byte == b'\n') {
                Some(index) => (index + 1, true),
                None => (available.len(), false),
            };
            if read + used > LINE_LIMIT {
                return Err(Error::LineTooLong { bytes: read + used });
            }
            line.extend_from_slice(&available[..used]);
            read += used;
            buffered.consume(used);
            if done {
                break;
            }
        }
        if line.is_empty() {
            return Ok(());
        }
        let text = String::from_utf8_lossy(&line);
        on_line(text.trim_end_matches(['\n', '\r']).to_string());
    }
}

/// Waits for a child, draining both streams, and ends its whole process tree
/// if the deadline passes.
///
/// Terminating the tree rather than the child is what makes the deadline real:
/// an agent started through a shell or a package manager leaves a grandchild
/// holding the pipes, and reading those pipes would block until that
/// grandchild finished on its own.
/// VI: Chờ một tiến trình con, rút cả hai luồng, và kết thúc cả cây tiến trình
/// VI: của nó nếu quá hạn.
/// VI: Kết thúc cả cây thay vì chỉ tiến trình con là thứ làm cho hạn chót có
/// VI: hiệu lực thật: một agent khởi động qua shell hay package manager để lại
/// VI: tiến trình cháu đang giữ các pipe, và đọc những pipe đó sẽ bị chặn tới
/// VI: khi tiến trình cháu tự kết thúc.
pub fn wait_with_deadline(child: Child, timeout: Duration) -> std::result::Result<Finished, Error> {
    wait_watching(child, timeout, |_| {})
}

/// The same, with each line of standard output handed over as it arrives.
///
/// An unattended run is otherwise opaque until it ends: these lines are what
/// turn twenty silent minutes into a tray that says what the agent is doing.
/// The callback runs on the reading thread and must not block, or it holds up
/// the pipe it is reading from.
/// VI: Giống hàm trên, nhưng mỗi dòng standard output được trao lại ngay khi tới.
/// VI: Một lượt chạy không người canh thì mờ mịt cho tới lúc kết thúc: chính những
/// VI: dòng này biến hai mươi phút im lặng thành một tray nói rõ agent đang làm gì.
/// VI: Callback chạy trên thread đang đọc nên không được chặn, nếu không nó giữ luôn
/// VI: cái pipe mà nó đang đọc.
pub fn wait_watching(
    mut child: Child,
    timeout: Duration,
    mut on_line: impl FnMut(&str) + Send + 'static,
) -> std::result::Result<Finished, Error> {
    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let (sender, receiver) = mpsc::channel::<(bool, String)>();
    let out_sender = sender.clone();
    let out_thread = stdout.map(|stream| {
        std::thread::spawn(move || {
            let mut collected = String::new();
            let _ = read_lines(stream, |line| {
                on_line(&line);
                collected.push_str(&line);
                collected.push('\n');
            });
            let _ = out_sender.send((true, collected));
        })
    });
    let err_thread = stderr.map(|stream| {
        std::thread::spawn(move || {
            let mut collected = String::new();
            let _ = read_lines(stream, |line| {
                collected.push_str(&line);
                collected.push('\n');
            });
            let _ = sender.send((false, collected));
        })
    });

    let started = Instant::now();
    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.code().unwrap_or(-1),
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = flowie_platform::terminate_tree(pid);
                    let _ = child.kill();
                    let _ = child.wait();
                    timed_out = true;
                    break -1;
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(error) => {
                return Err(Error::Spawn {
                    program: pid.to_string(),
                    message: error.to_string(),
                })
            }
        }
    };

    let mut out = String::new();
    let mut err = String::new();
    for thread in [out_thread, err_thread].into_iter().flatten() {
        let _ = thread.join();
    }
    while let Ok((is_stdout, text)) = receiver.try_recv() {
        if is_stdout {
            out = text;
        } else {
            err = text;
        }
    }

    if timed_out {
        return Err(Error::TimedOut {
            program: pid.to_string(),
            seconds: timeout.as_secs(),
        });
    }

    Ok(Finished {
        status,
        stdout: out,
        stderr: err,
    })
}

/// Hands a prompt to a process over stdin.
///
/// The prompt is task text from the server. It goes on stdin precisely so it
/// never becomes part of a command line, where quoting rules differ between
/// platforms and a crafted title could change what runs.
/// VI: Đưa prompt cho một tiến trình qua stdin.
/// VI: Prompt là nội dung task từ server. Nó đi qua stdin chính là để không
/// VI: bao giờ trở thành một phần của dòng lệnh, nơi quy tắc trích dẫn khác
/// VI: nhau giữa các nền tảng và một tiêu đề được dàn dựng có thể đổi thứ
/// VI: được chạy.
pub fn write_prompt(child: &mut Child, prompt: &str) -> std::result::Result<(), Error> {
    let Some(mut stdin) = child.stdin.take() else {
        return Err(Error::Spawn {
            program: child.id().to_string(),
            message: "the process has no stdin".into(),
        });
    };
    stdin
        .write_all(prompt.as_bytes())
        .and_then(|()| stdin.flush())
        .map_err(|error| Error::Spawn {
            program: child.id().to_string(),
            message: format!("could not send the prompt: {error}"),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lines_arrive_one_at_a_time_without_their_terminator() {
        let mut seen = Vec::new();
        read_lines(&b"first\nsecond\r\nthird"[..], |line| seen.push(line)).unwrap();
        assert_eq!(seen, vec!["first", "second", "third"]);
    }

    #[test]
    fn vietnamese_text_survives_the_round_trip() {
        let mut seen = Vec::new();
        read_lines("đang sửa tệp\nxong rồi\n".as_bytes(), |line| {
            seen.push(line)
        })
        .unwrap();
        assert_eq!(seen, vec!["đang sửa tệp", "xong rồi"]);
    }

    #[test]
    fn a_large_line_is_allowed_because_an_event_can_carry_a_file() {
        let payload = format!("{}\n", "x".repeat(2 * 1024 * 1024));
        let mut count = 0;
        read_lines(payload.as_bytes(), |_| count += 1).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn a_runaway_line_stops_the_read_instead_of_growing() {
        // No newline ever arrives, so without the limit this would consume
        // memory until the process died.
        // VI: Không bao giờ có ký tự xuống dòng, nên nếu thiếu giới hạn thì
        // VI: việc này sẽ ngốn bộ nhớ tới khi tiến trình chết.
        let payload = vec![b'x'; LINE_LIMIT + 1024];
        let error = read_lines(&payload[..], |_| {}).unwrap_err();
        assert!(matches!(error, Error::LineTooLong { .. }));
    }

    #[test]
    fn an_empty_stream_yields_no_lines() {
        let mut count = 0;
        read_lines(&b""[..], |_| count += 1).unwrap();
        assert_eq!(count, 0);
    }
}
