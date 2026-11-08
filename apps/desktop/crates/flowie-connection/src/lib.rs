//! The Flowie server as the orchestrator sees it.
//!
//! `flowie-core` holds the rules and describes what it needs as ports;
//! `flowie-mcp` can talk to the server. This crate is the one place they meet,
//! and it exists as its own crate for two reasons. The transport brings in a
//! TLS stack whose `ring` dependency needs a C compiler for the target, so a
//! crate that pulls it in can no longer be lint-checked for macOS from a
//! Windows machine; core stays clear of it. And the work here is worth testing
//! against a stub server, which a binary crate makes awkward.
//! VI: Server Flowie dưới cách nhìn của orchestrator.
//! VI: `flowie-core` giữ các quy tắc và mô tả những gì nó cần dưới dạng cổng;
//! VI: `flowie-mcp` biết nói chuyện với server. Crate này là nơi duy nhất hai
//! VI: phần đó gặp nhau, và nó tồn tại như một crate riêng vì hai lý do.
//! VI: Transport kéo theo một bộ TLS mà phụ thuộc `ring` của nó cần C compiler
//! VI: cho target, nên crate nào kéo nó vào thì không còn kiểm lint cho macOS
//! VI: từ máy Windows được; core tránh xa điều đó. Và phần việc ở đây đáng được
//! VI: kiểm thử với một server giả, điều mà một crate binary làm cho vướng.

pub mod server;

pub use server::{Access, Assigned, Connection, Refusal};
