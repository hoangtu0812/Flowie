//! The connection driven against a stub MCP server.
//!
//! These cover what unit tests cannot: that the lease taken from a claim is
//! actually sent on the calls that need it, that losing it stops the run, and
//! that a document which cannot be saved becomes a warning instead of ending
//! a run that was otherwise fine.
//!
//! The tests are plain `#[test]`, not `#[tokio::test]`. `Connection` owns a
//! runtime and drives it with `block_on`, which panics if the thread is
//! already inside one, so the stub server gets a thread and a runtime of its
//! own. That arrangement is also how the companion will use it.
//! VI: Kết nối được chạy thật với một server MCP giả.
//! VI: Phần này phủ những thứ unit test không với tới: lease lấy từ một lần
//! VI: claim có thật sự được gửi kèm những lời gọi cần nó, mất lease thì run
//! VI: dừng, và một tài liệu không lưu được thì thành cảnh báo chứ không kết
//! VI: thúc một run vốn không sao.
//! VI: Các test là `#[test]` thường, không phải `#[tokio::test]`. `Connection`
//! VI: sở hữu một runtime và chạy nó bằng `block_on`, thứ sẽ panic nếu thread đã
//! VI: nằm trong một runtime, nên server giả có thread và runtime riêng. Cách bố
//! VI: trí đó cũng chính là cách companion sẽ dùng nó.

use std::sync::{Arc, Mutex};

use flowie_connection::{Assigned, Connection};
use flowie_core::run::{Achievement, DocType, FeatureDoc, RunFailure, Server, TestOutcome};
use flowie_core::sequence::Outcome;
use flowie_mcp::{Endpoint, Token};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[derive(Default)]
struct Seen {
    bodies: Vec<Value>,
}

impl Seen {
    /// The arguments of the call to `name`, so a test asserts on what was
    /// sent rather than only on what came back.
    /// VI: Tham số của lời gọi tới `name`, để test khẳng định về thứ đã gửi chứ
    /// VI: không chỉ về thứ nhận lại.
    fn arguments_of(&self, name: &str) -> Option<Value> {
        self.bodies
            .iter()
            .find(|body| body["params"]["name"] == name)
            .map(|body| body["params"]["arguments"].clone())
    }

    fn called(&self, name: &str) -> bool {
        self.arguments_of(name).is_some()
    }
}

struct Reply {
    status: u16,
    body: String,
}

impl Reply {
    fn data(value: Value) -> Self {
        Self {
            status: 200,
            body: json!({
                "jsonrpc": "2.0",
                "id": 0,
                "result": { "structuredContent": { "data": value } }
            })
            .to_string(),
        }
    }

    fn empty() -> Self {
        Self {
            status: 200,
            body: json!({ "jsonrpc": "2.0" }).to_string(),
        }
    }

    fn handshake() -> Self {
        Self {
            status: 200,
            body: json!({
                "jsonrpc": "2.0",
                "id": 1,
                "result": { "protocolVersion": "2025-06-18" }
            })
            .to_string(),
        }
    }

    fn failure(status: u16, message: &str) -> Self {
        Self {
            status,
            body: json!({ "error": "Conflict", "message": message, "statusCode": status })
                .to_string(),
        }
    }
}

/// Starts a stub server on its own thread, answering each request with the
/// next canned reply.
/// VI: Khởi động một server giả trên thread riêng, trả lời mỗi request bằng
/// VI: phản hồi dựng sẵn kế tiếp.
fn stub(replies: Vec<Reply>) -> (String, Arc<Mutex<Seen>>) {
    let seen = Arc::new(Mutex::new(Seen::default()));
    let recorder = Arc::clone(&seen);
    let (announce, port) = std::sync::mpsc::channel();

    std::thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("a runtime for the stub");
        runtime.block_on(async move {
            let listener = TcpListener::bind("127.0.0.1:0").await.expect("a port");
            announce
                .send(listener.local_addr().expect("an address").port())
                .expect("the port is announced");
            for reply in replies {
                let Ok((mut socket, _)) = listener.accept().await else {
                    return;
                };
                let mut raw = Vec::new();
                let mut buffer = [0_u8; 4096];
                // Reads until the body is complete, using Content-Length
                // because the client always sends one.
                // VI: Đọc tới khi body đủ, dựa vào Content-Length vì client luôn
                // VI: gửi kèm.
                loop {
                    let read = socket.read(&mut buffer).await.unwrap_or(0);
                    if read == 0 {
                        break;
                    }
                    raw.extend_from_slice(&buffer[..read]);
                    let text = String::from_utf8_lossy(&raw).to_string();
                    if let Some((head, body)) = text.split_once("\r\n\r\n") {
                        let length: usize = head
                            .lines()
                            .find_map(|line| {
                                let (name, value) = line.split_once(':')?;
                                name.eq_ignore_ascii_case("content-length")
                                    .then(|| value.trim().parse().ok())?
                            })
                            .unwrap_or(0);
                        if body.len() >= length {
                            recorder
                                .lock()
                                .expect("the recorder")
                                .bodies
                                .push(serde_json::from_str(body).unwrap_or(Value::Null));
                            break;
                        }
                    }
                }

                let response = format!(
                    "HTTP/1.1 {} OK\r\ncontent-type: application/json\r\nmcp-session-id: session-1\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                    reply.status,
                    reply.body.len(),
                    reply.body
                );
                let _ = socket.write_all(response.as_bytes()).await;
                let _ = socket.flush().await;
            }
        });
    });

    let port = port.recv().expect("the stub announces its port");
    (format!("http://127.0.0.1:{port}/mcp/"), seen)
}

/// Opens a connection, consuming the two handshake replies.
/// VI: Mở một kết nối, dùng hết hai phản hồi bắt tay.
fn connect(url: &str) -> Connection {
    Connection::open(
        Endpoint::parse(url).expect("the stub url is an endpoint"),
        Token::new("flowie_live_stub_token").expect("a token"),
    )
    .expect("the handshake succeeds")
}

fn claim_reply() -> Reply {
    Reply::data(json!({
        "id": "crun0000000000000000000001",
        "leaseToken": "0123456789abcdef0123456789abcdef",
        "fencingToken": 4
    }))
}

fn draft(doc_type: DocType) -> FeatureDoc {
    FeatureDoc {
        module: "Desktop".into(),
        feature: "Companion".into(),
        doc_type,
        content: "# Companion\n\nBehaviour.".into(),
        change_summary: "Describes the companion run.".into(),
    }
}

#[test]
fn the_lease_from_a_claim_is_sent_on_the_calls_that_need_it() {
    let (url, seen) = stub(vec![
        Reply::handshake(),
        Reply::empty(),
        claim_reply(),
        Reply::data(json!({ "ok": true })), // heartbeat
    ]);

    let mut connection = connect(&url);
    let run_id = connection.claim("DTD-1", "key-claim").expect("the claim");
    assert_eq!(run_id, "crun0000000000000000000001");

    connection
        .heartbeat(Some("Implementing the plan"), "key-beat")
        .expect("the heartbeat");

    let record = seen.lock().expect("the recorder");
    let beat = record
        .arguments_of("heartbeat_run")
        .expect("a heartbeat was sent");
    // The run id alone is not enough: the lease token proves ownership and the
    // fencing token is what makes a stale writer lose.
    // VI: Chỉ run id là không đủ: lease token chứng minh quyền sở hữu và fencing
    // VI: token là thứ khiến một bên ghi đã cũ bị loại.
    assert_eq!(beat["runId"], json!("crun0000000000000000000001"));
    assert_eq!(
        beat["leaseToken"],
        json!("0123456789abcdef0123456789abcdef")
    );
    assert_eq!(beat["fencingToken"], json!(4));
    assert_eq!(beat["progress"], json!("Implementing the plan"));
}

#[test]
fn a_step_needing_the_lease_before_the_claim_says_so_and_sends_nothing() {
    // Only the handshake is queued, so a request that should not happen makes
    // the test hang rather than pass quietly.
    // VI: Chỉ xếp sẵn phần bắt tay, nên một request lẽ ra không xảy ra sẽ làm
    // VI: test treo chứ không lặng lẽ đạt.
    let (url, seen) = stub(vec![Reply::handshake(), Reply::empty()]);
    let mut connection = connect(&url);

    let error = connection
        .heartbeat(None, "key-beat")
        .expect_err("there is no lease to use");
    match error {
        RunFailure::Precondition(detail) => assert!(detail.contains("no claimed run")),
        other => panic!("expected a precondition, got {other:?}"),
    }
    assert_eq!(seen.lock().expect("the recorder").bodies.len(), 2);
}

#[test]
fn a_document_that_cannot_be_saved_is_a_warning_and_lands_in_the_plan() {
    let (url, seen) = stub(vec![
        Reply::handshake(),
        Reply::empty(),
        claim_reply(),
        Reply::data(json!({ "title": "FDS · Companion", "version": 2 })), // first saves
        Reply::failure(422, "The document exceeds its size limit."),      // second does not
        Reply::data(json!({ "id": "ccomment1" })),                        // the plan comment
    ]);

    let mut connection = connect(&url);
    connection.claim("DTD-1", "key-claim").expect("the claim");

    // Missing documentation is a warning, not a blocker, so this returns Ok
    // and the run goes on to deliver the code.
    // VI: Thiếu tài liệu là cảnh báo chứ không phải thứ chặn đường, nên hàm này
    // VI: trả về Ok và run vẫn đi tiếp để giao code.
    connection
        .save_feature_docs(
            "DTD-1",
            &[draft(DocType::Fds), draft(DocType::Tds)],
            "key-docs",
        )
        .expect("a failed document does not end the run");

    assert_eq!(
        connection.warnings().len(),
        1,
        "{:?}",
        connection.warnings()
    );
    let warning = &connection.warnings()[0];
    assert!(warning.contains("TDS"), "names the document: {warning}");
    assert!(
        warning.contains("size limit"),
        "keeps the reason: {warning}"
    );

    connection
        .post_plan("DTD-1", "Plan before implementation", "key-plan")
        .expect("the plan comment");

    let record = seen.lock().expect("the recorder");
    let comment = record
        .arguments_of("add_comment")
        .expect("a comment was posted");
    let content = comment["content"].as_str().unwrap_or_default();
    assert!(content.starts_with("Plan before implementation"));
    // The gap has to be visible where a person actually looks.
    // VI: Chỗ thiếu phải hiện ra ở nơi người dùng thật sự xem.
    assert!(content.contains("FDS/TDS:"), "got {content}");
    assert!(content.contains("size limit"), "got {content}");

    // Each document carries its own key, so a retry saves the same document
    // again rather than adding a second copy.
    // VI: Mỗi tài liệu mang key riêng, nên một lần thử lại sẽ lưu lại đúng tài
    // VI: liệu đó chứ không thêm một bản thứ hai.
    let keys: Vec<String> = record
        .bodies
        .iter()
        .filter(|body| body["params"]["name"] == "upsert_feature_doc")
        .map(|body| body["params"]["arguments"]["idempotencyKey"].to_string())
        .collect();
    assert_eq!(keys.len(), 2);
    assert_ne!(keys[0], keys[1]);
}

#[test]
fn losing_the_lease_while_saving_a_document_stops_rather_than_warns() {
    let (url, _seen) = stub(vec![
        Reply::handshake(),
        Reply::empty(),
        claim_reply(),
        Reply::failure(409, "The lease expired or the run is no longer running."),
    ]);

    let mut connection = connect(&url);
    connection.claim("DTD-1", "key-claim").expect("the claim");

    let error = connection
        .save_feature_docs("DTD-1", &[draft(DocType::Fds)], "key-docs")
        .expect_err("ownership is not something a warning can cover");
    assert_eq!(error, RunFailure::LeaseLost);
    assert!(
        connection.warnings().is_empty(),
        "a lost lease is not a warning"
    );

    // The lease is dropped, so a later step cannot write to a run this
    // connection no longer holds.
    // VI: Lease bị xoá, nên một bước sau không thể ghi lên một run kết nối này
    // VI: không còn giữ.
    let after = connection
        .report(
            Outcome::Failed,
            "stopped",
            &Achievement::default(),
            "key-report",
        )
        .expect_err("the lease is gone");
    assert!(matches!(after, RunFailure::Precondition(_)), "{after:?}");
}

#[test]
fn a_review_ready_result_carries_the_commit_and_the_executed_checks() {
    let (url, seen) = stub(vec![
        Reply::handshake(),
        Reply::empty(),
        claim_reply(),
        Reply::data(json!({ "state": "AWAITING_REVIEW" })),
    ]);

    let mut connection = connect(&url);
    connection.claim("DTD-1", "key-claim").expect("the claim");

    let achieved = Achievement {
        commit: Some("0123abcd".into()),
        pull_request_url: Some("https://github.com/hoangtu0812/Flowie/pull/1".into()),
        tests: vec![TestOutcome {
            name: "approved-local-test-1".into(),
            command: vec!["pnpm".into(), "test".into()],
            exit_code: 0,
            duration_ms: 4_200,
            log: "all good".into(),
        }],
    };
    connection
        .report(
            Outcome::AwaitingReview,
            "Implemented the companion run.",
            &achieved,
            "key-report",
        )
        .expect("the server accepts a complete result");

    let record = seen.lock().expect("the recorder");
    let result = record
        .arguments_of("report_run_result")
        .expect("a result was reported");
    assert_eq!(result["outcome"], json!("AWAITING_REVIEW"));
    assert_eq!(result["commit"], json!("0123abcd"));
    assert_eq!(
        result["pullRequestUrl"],
        json!("https://github.com/hoangtu0812/Flowie/pull/1")
    );
    assert_eq!(result["tests"][0]["result"], json!("passed"));
    assert_eq!(result["tests"][0]["exitCode"], json!(0));
    assert_eq!(result["tests"][0]["durationMs"], json!(4_200));
}

#[test]
fn releasing_hands_the_run_back_and_keeps_nothing() {
    let (url, seen) = stub(vec![
        Reply::handshake(),
        Reply::empty(),
        claim_reply(),
        Reply::data(json!({ "state": "QUEUED" })),
    ]);

    let mut connection = connect(&url);
    connection.claim("DTD-1", "key-claim").expect("the claim");
    connection.release("key-release").expect("the release");

    assert!(seen.lock().expect("the recorder").called("release_issue"));
    let after = connection
        .heartbeat(None, "key-beat")
        .expect_err("the run was handed back");
    assert!(matches!(after, RunFailure::Precondition(_)), "{after:?}");
}

#[test]
fn an_outcome_the_server_does_not_record_is_refused_rather_than_guessed() {
    let (url, seen) = stub(vec![Reply::handshake(), Reply::empty(), claim_reply()]);
    let mut connection = connect(&url);
    connection.claim("DTD-1", "key-claim").expect("the claim");

    // Released is handed back through release_issue and StoppedUncertain
    // reports nothing at all. Mapping either onto FAILED would record
    // something untrue about a run.
    // VI: Released được trả lại qua release_issue, còn StoppedUncertain thì
    // VI: không báo gì cả. Ánh xạ một trong hai sang FAILED sẽ ghi một điều
    // VI: không đúng về run.
    for outcome in [Outcome::Released, Outcome::StoppedUncertain] {
        let error = connection
            .report(outcome, "x", &Achievement::default(), "key-report")
            .expect_err("the server does not record this");
        assert!(matches!(error, RunFailure::Precondition(_)), "{error:?}");
    }
    assert!(!seen
        .lock()
        .expect("the recorder")
        .called("report_run_result"));
}

#[test]
fn a_connection_that_cannot_write_is_reported_as_read_only() {
    let (url, _seen) = stub(vec![
        Reply::handshake(),
        Reply::empty(),
        Reply::data(json!({ "scopes": ["issues:read", "runs:read"] })),
    ]);

    let mut connection = connect(&url);
    let access = connection.access().expect("access is readable");
    assert_eq!(
        access.scopes,
        vec!["issues:read".to_string(), "runs:read".to_string()]
    );
    // The field was absent. A connection that cannot write fails at its first
    // write, after the issue is already claimed, so absent must mean no.
    // VI: Trường này không có. Một kết nối không ghi được sẽ hỏng ở lần ghi đầu
    // VI: tiên, khi issue đã bị claim, nên thiếu trường phải hiểu là không.
    assert!(!access.writes_enabled);
}

#[test]
fn polling_asks_only_for_work_routed_to_this_connection() {
    // The page shape is taken from a live list_runs response, not invented:
    // a row carries the run id, the issue id and what a person calls the task.
    // VI: Hình dạng trang lấy từ một phản hồi list_runs thật chứ không bịa: một
    // VI: dòng mang run id, issue id và cách một người gọi task.
    let (url, seen) = stub(vec![
        Reply::handshake(),
        Reply::empty(),
        Reply::data(json!({
            "items": [
                {
                    "id": "crun0000000000000000000001",
                    "issueId": "cissue1",
                    "issueIdentifier": "DTD-204",
                    "issueTitle": "Chuẩn hoá Package",
                    "state": "PENDING",
                    "assignedToThisConnection": true,
                    "progress": null,
                    "pullRequestUrl": null
                },
                {
                    "id": "crun0000000000000000000002",
                    "issueId": "cissue2",
                    "state": "PENDING"
                }
            ],
            "nextCursor": null,
            "truncated": false
        })),
    ]);

    let mut connection = connect(&url);
    let waiting = connection
        .assigned_runs(Some("cproject1"))
        .expect("the page is readable");

    assert_eq!(
        waiting,
        vec![
            Assigned {
                run_id: "crun0000000000000000000001".into(),
                issue_id: "cissue1".into(),
                identifier: Some("DTD-204".into()),
                title: Some("Chuẩn hoá Package".into()),
            },
            // A row without a title is still work; only the tray line is poorer.
            // VI: Một dòng không có tiêu đề vẫn là việc; chỉ dòng trên tray nghèo đi.
            Assigned {
                run_id: "crun0000000000000000000002".into(),
                issue_id: "cissue2".into(),
                identifier: None,
                title: None,
            },
        ]
    );

    let record = seen.lock().expect("the recorder");
    let arguments = record
        .arguments_of("list_runs")
        .expect("the server was asked");
    // Letting the server filter is what keeps the companion from ever trying
    // to claim a run routed to a different machine.
    // VI: Để server lọc chính là thứ giữ cho companion không bao giờ thử claim
    // VI: một run được định tuyến cho máy khác.
    assert_eq!(arguments["assignedToThisConnection"], json!(true));
    assert_eq!(arguments["state"], json!("PENDING"));
    assert_eq!(arguments["projectId"], json!("cproject1"));
}

#[test]
fn a_row_that_cannot_be_claimed_or_tracked_is_skipped_not_fatal() {
    // One unusable row must not cost the whole poll: the rest of the page is
    // still work this machine was given.
    // VI: Một dòng không dùng được không được làm hỏng cả lần poll: phần còn lại
    // VI: của trang vẫn là việc máy này được giao.
    let (url, _seen) = stub(vec![
        Reply::handshake(),
        Reply::empty(),
        Reply::data(json!({
            "items": [
                { "issueId": "cissue1" },
                { "id": "crun1" },
                { "id": "crun2", "issueId": "cissue2" }
            ]
        })),
    ]);

    let mut connection = connect(&url);
    let waiting = connection
        .assigned_runs(None)
        .expect("the page is readable");
    assert_eq!(waiting.len(), 1);
    assert_eq!(waiting[0].run_id, "crun2");
}

#[test]
fn nothing_waiting_is_an_empty_list_rather_than_a_failure() {
    // The ordinary case: an idle machine polls and finds nothing.
    // VI: Trường hợp thường gặp: một máy rảnh poll và không thấy gì.
    let (url, _seen) = stub(vec![
        Reply::handshake(),
        Reply::empty(),
        Reply::data(json!({ "items": [], "nextCursor": null })),
    ]);
    let mut connection = connect(&url);
    assert!(connection
        .assigned_runs(None)
        .expect("an empty page is fine")
        .is_empty());
}

#[test]
fn a_project_id_from_another_server_reads_as_unknown_not_as_a_lost_connection() {
    // The id exists here, the next one does not, and a refused token is still
    // a failure rather than "unknown": only "not found" may mean a wrong id.
    // VI: Id thứ nhất có ở đây, id thứ hai thì không, còn token bị từ chối vẫn
    // VI: là thất bại chứ không phải "không có": chỉ "không tìm thấy" mới được
    // VI: hiểu là sai id.
    let (url, seen) = stub(vec![
        Reply::handshake(),
        Reply::empty(),
        Reply::data(json!({ "id": "cproj1", "name": "Flowie" })),
        Reply::failure(404, "Project not found in the allowed scope."),
        Reply::failure(401, "The token was revoked."),
    ]);
    let mut connection = connect(&url);
    assert!(connection.project_visible("cproj1").expect("found"));
    assert!(!connection
        .project_visible("cother")
        .expect("not found is an answer"));
    assert!(connection.project_visible("cproj1").is_err());
    assert_eq!(
        seen.lock().unwrap().arguments_of("get_project"),
        Some(json!({ "projectId": "cproj1" }))
    );
}
