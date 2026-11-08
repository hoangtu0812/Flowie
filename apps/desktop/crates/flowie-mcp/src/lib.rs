//! MCP client and the Flowie tool contract for the desktop companion.
//!
//! The crate owns three things: a validated endpoint, a transport that speaks
//! MCP streamable HTTP to the Flowie server, and the run-lifecycle contract
//! with the limits the server enforces. Everything it can fail with is a named
//! variant, because the companion shows a different state for a revoked token,
//! a missing scope, a lost lease and a network outage.
//! VI: Crate sở hữu ba thứ: một endpoint đã kiểm tra, một transport nói MCP
//! VI: streamable HTTP với server Flowie, và hợp đồng vòng đời run kèm các giới
//! VI: hạn server áp dụng. Mọi cách nó có thể thất bại đều là một biến thể có
//! VI: tên, vì companion hiển thị trạng thái khác nhau cho token bị thu hồi,
//! VI: thiếu scope, mất lease và mất mạng.
//!
//! The token never reaches a log: it lives behind a type whose `Debug` is
//! redacted, and it is stripped out of transport error strings.
//! VI: Token không bao giờ tới được log: nó nằm sau một kiểu có `Debug` bị che,
//! VI: và bị loại khỏi chuỗi lỗi của transport.

#[cfg(feature = "transport")]
pub mod client;
pub mod contract;
pub mod endpoint;
pub mod error;

#[cfg(feature = "transport")]
pub use client::{Client, Token};
pub use contract::{Lease, Outcome, RunResult, TestEvidence, TestResult};
pub use endpoint::Endpoint;
pub use error::{Error, Result};
