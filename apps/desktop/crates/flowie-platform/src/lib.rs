//! Everything that differs between Windows and macOS: the credential store,
//! executable resolution, process-tree termination and autostart. Keeping the
//! differences here is what lets the other crates stay identical on both
//! platforms.
//! VI: Mọi thứ khác nhau giữa Windows và macOS: kho credential, phân giải
//! VI: executable, hủy cây tiến trình và tự khởi động. Giữ khác biệt ở đây là
//! VI: cách để các crate còn lại giống hệt nhau trên cả hai nền tảng.
//!
//! Three of those differences are implemented: the environment a child is
//! allowed to see, resolving an executable the way the platform really finds
//! it, and ending a process together with everything it started. The
//! credential store and autostart arrive with the platform tasks DTD-488 and
//! DTD-489.
//! VI: Ba trong số các khác biệt đó đã được hiện thực: môi trường một tiến
//! VI: trình con được phép nhìn thấy, phân giải executable đúng cách nền tảng
//! VI: thật sự tìm nó, và kết thúc một tiến trình cùng mọi thứ nó đã khởi
//! VI: động. Kho credential và tự khởi động sẽ có ở hai task nền tảng DTD-488
//! VI: và DTD-489.

pub mod environment;
pub mod executable;
pub mod process;

pub use environment::child_environment;
pub use executable::resolve;
pub use process::{spawn_in_own_group, terminate_tree};

pub fn crate_name() -> &'static str {
    "flowie-platform"
}

#[cfg(test)]
mod tests {
    #[test]
    fn crate_is_wired_into_the_workspace() {
        assert_eq!(super::crate_name(), "flowie-platform");
    }
}
