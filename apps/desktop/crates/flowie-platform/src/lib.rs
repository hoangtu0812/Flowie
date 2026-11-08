//! Everything that differs between Windows and macOS: the credential store,
//! executable resolution, process-tree termination and autostart. Keeping the
//! differences here is what lets the other crates stay identical on both
//! platforms.
//! VI: Mọi thứ khác nhau giữa Windows và macOS: kho credential, phân giải
//! VI: executable, hủy cây tiến trình và tự khởi động. Giữ khác biệt ở đây là
//! VI: cách để các crate còn lại giống hệt nhau trên cả hai nền tảng.
//!
//! Implemented here: the environment a child is allowed to see, resolving an
//! executable the way the platform really finds it, ending a process together
//! with everything it started, the credential store that holds the Flowie
//! token, and the lock that keeps one companion per machine. Autostart and
//! the installers arrive with the platform tasks DTD-488 and DTD-489.
//! VI: Đã hiện thực ở đây: môi trường một tiến trình con được phép nhìn thấy,
//! VI: phân giải executable đúng cách nền tảng thật sự tìm nó, kết thúc một
//! VI: tiến trình cùng mọi thứ nó đã khởi động, kho credential giữ token
//! VI: Flowie, và khoá giữ cho mỗi máy chỉ một companion. Tự khởi động và bộ
//! VI: cài sẽ có ở hai task nền tảng DTD-488 và DTD-489.

pub mod credential;
pub mod environment;
pub mod executable;
pub mod instance;
pub mod process;

pub use credential::{CredentialError, CredentialStore};
pub use environment::child_environment;
pub use executable::resolve;
pub use instance::{acquire, InstanceError, InstanceGuard};
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
