//! Everything that differs between Windows and macOS: the credential store,
//! executable resolution, process-tree termination and autostart. Keeping the
//! differences here is what lets the other crates stay identical on both
//! platforms.
//! VI: Mọi thứ khác nhau giữa Windows và macOS: kho credential, phân giải
//! VI: executable, hủy cây tiến trình và tự khởi động. Giữ khác biệt ở đây là
//! VI: cách để các crate còn lại giống hệt nhau trên cả hai nền tảng.
//!
//! Scaffolding only: the behaviour arrives with DTD-496 and the platform tasks
//! DTD-488 and DTD-489.
//! VI: Mới là khung: hành vi sẽ có ở DTD-496 và hai task nền tảng DTD-488,
//! VI: DTD-489.

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
