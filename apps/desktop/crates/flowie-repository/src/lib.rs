//! Git access for a run: validating the checkout against the repository
//! configuration the server hands out, creating a worktree per run beside the
//! checkout, running the approved test commands, and committing. A worktree
//! that still holds unsaved work is kept, because losing a developer's changes
//! is worse than leaving a directory behind.
//! VI: Truy cập Git cho một run: đối chiếu checkout với cấu hình repository do
//! VI: server cấp, tạo worktree riêng cho mỗi run cạnh checkout, chạy các lệnh
//! VI: test đã duyệt, và commit. Worktree còn thay đổi chưa lưu thì được giữ,
//! VI: vì mất thay đổi của lập trình viên tệ hơn là để thừa một thư mục.
//!
//! Scaffolding only: the behaviour arrives with DTD-495.
//! VI: Mới là khung: hành vi sẽ có ở DTD-495.

pub fn crate_name() -> &'static str {
    "flowie-repository"
}

#[cfg(test)]
mod tests {
    #[test]
    fn crate_is_wired_into_the_workspace() {
        assert_eq!(super::crate_name(), "flowie-repository");
    }
}
