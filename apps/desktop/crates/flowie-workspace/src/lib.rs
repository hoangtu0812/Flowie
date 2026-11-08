//! The checkout as the orchestrator sees it.
//!
//! `flowie-repository` knows how to verify a checkout, cut a worktree, run an
//! approved command and commit; `flowie-core` says what a run needs from one.
//! This crate joins them. It is separate because `flowie-core` already depends
//! on `flowie-repository` for the branch rules, so putting the adapter in
//! either of those would make them depend on each other.
//! VI: Checkout dưới cách nhìn của orchestrator.
//! VI: `flowie-repository` biết cách đối chiếu một checkout, cắt worktree, chạy
//! VI: một lệnh đã duyệt và commit; `flowie-core` nói một run cần gì từ đó.
//! VI: Crate này nối hai bên. Nó tách riêng vì `flowie-core` vốn đã phụ thuộc
//! VI: `flowie-repository` để lấy quy tắc nhánh, nên đặt adapter vào một trong
//! VI: hai sẽ khiến chúng phụ thuộc lẫn nhau.

pub mod checkout;

pub use checkout::Checkout;
