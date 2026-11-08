//! End-to-end checks against a stub MCP server. These exercise the parts unit
//! tests cannot reach: the Authorization header, the session header round
//! trip, the envelope, SSE framing and the mapping from a real HTTP status
//! onto an error variant.
//! VI: Kiểm tra đầu-cuối với một server MCP giả. Phần này chạm tới những thứ
//! VI: unit test không với tới được: header Authorization, vòng đi về của
//! VI: header phiên, envelope, khung SSE và việc ánh xạ một status HTTP thật
//! VI: sang biến thể lỗi.

use std::sync::{Arc, Mutex};

use flowie_mcp::{Client, Endpoint, Error, Lease, Token};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// What the stub server saw, so a test can assert on the request as well as
/// on the reply.
/// VI: Những gì server giả nhìn thấy, để test khẳng định được cả về request
/// VI: chứ không chỉ về phản hồi.
#[derive(Default)]
struct Seen {
    authorization: Vec<String>,
    sessions: Vec<Option<String>>,
    bodies: Vec<Value>,
}

/// One canned reply per request, in order.
/// VI: Mỗi request một phản hồi dựng sẵn, theo thứ tự.
struct Reply {
    status: u16,
    body: String,
    content_type: &'static str,
}

impl Reply {
    fn json(value: Value) -> Self {
        Self {
            status: 200,
            body: value.to_string(),
            content_type: "application/json",
        }
    }

    fn sse(value: Value) -> Self {
        Self {
            status: 200,
            body: format!("event: message\ndata: {value}\n\n"),
            content_type: "text/event-stream",
        }
    }

    fn failure(status: u16, body: Value) -> Self {
        Self {
            status,
            body: body.to_string(),
            content_type: "application/json",
        }
    }
}

async fn stub(replies: Vec<Reply>) -> (String, Arc<Mutex<Seen>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let seen = Arc::new(Mutex::new(Seen::default()));
    let recorder = Arc::clone(&seen);

    tokio::spawn(async move {
        for reply in replies {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };
            let mut raw = Vec::new();
            let mut buffer = [0_u8; 4096];
            // Reads until the body is complete, using Content-Length because
            // the client always sends one.
            // VI: Đọc tới khi body đủ, dựa vào Content-Length vì client luôn gửi.
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
                        let header = |name: &str| {
                            head.lines().find_map(|line| {
                                let (key, value) = line.split_once(':')?;
                                key.eq_ignore_ascii_case(name)
                                    .then(|| value.trim().to_string())
                            })
                        };
                        let mut record = recorder.lock().unwrap();
                        record
                            .authorization
                            .push(header("authorization").unwrap_or_default());
                        record.sessions.push(header("mcp-session-id"));
                        record
                            .bodies
                            .push(serde_json::from_str(body).unwrap_or(Value::Null));
                        break;
                    }
                }
            }

            let response = format!(
                "HTTP/1.1 {} OK\r\ncontent-type: {}\r\nmcp-session-id: session-xyz\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                reply.status,
                reply.content_type,
                reply.body.len(),
                reply.body
            );
            let _ = socket.write_all(response.as_bytes()).await;
            let _ = socket.flush().await;
        }
    });

    (format!("http://127.0.0.1:{port}/mcp/"), seen)
}

fn initialize_reply() -> Reply {
    Reply::json(json!({
        "jsonrpc": "2.0",
        "id": 1,
        "result": {
            "protocolVersion": "2025-06-18",
            "serverInfo": { "name": "Flowie", "version": "1.0.0" }
        }
    }))
}

async fn connect(url: &str) -> Client {
    Client::new(
        Endpoint::parse(url).unwrap(),
        Token::new("flowie_live_secret_value").unwrap(),
    )
    .unwrap()
}

#[tokio::test]
async fn initialize_sends_the_bearer_token_and_keeps_the_session() {
    let (url, seen) = stub(vec![
        initialize_reply(),
        Reply::json(json!({ "jsonrpc": "2.0" })),
        Reply::json(json!({
            "jsonrpc": "2.0",
            "id": 2,
            "result": { "structuredContent": { "data": { "writesEnabled": true } } }
        })),
    ])
    .await;

    let mut client = connect(&url).await;
    let info = client.initialize().await.unwrap();
    assert_eq!(info["serverInfo"]["name"], "Flowie");

    let access = client.get_my_access().await.unwrap();
    assert_eq!(access["writesEnabled"], json!(true));

    let record = seen.lock().unwrap();
    assert_eq!(record.authorization[0], "Bearer flowie_live_secret_value");
    // The first request cannot know the session; every later one carries the
    // id the server handed back.
    // VI: Request đầu chưa thể biết phiên; mọi request sau đều mang id mà
    // VI: server đã trả về.
    assert_eq!(record.sessions[0], None);
    assert_eq!(record.sessions[2].as_deref(), Some("session-xyz"));
    assert_eq!(record.bodies[0]["method"], "initialize");
    assert_eq!(record.bodies[1]["method"], "notifications/initialized");
    assert_eq!(record.bodies[2]["params"]["name"], "get_my_access");
}

#[tokio::test]
async fn an_sse_framed_reply_decodes_like_plain_json() {
    let (url, _) = stub(vec![
        initialize_reply(),
        Reply::json(json!({ "jsonrpc": "2.0" })),
        Reply::sse(json!({
            "jsonrpc": "2.0",
            "id": 2,
            "result": { "structuredContent": { "data": { "items": [], "nextCursor": null } } }
        })),
    ])
    .await;

    let mut client = connect(&url).await;
    client.initialize().await.unwrap();
    let page = client
        .list_runs(Some("PENDING"), None, true, 5)
        .await
        .unwrap();
    assert_eq!(page["items"], json!([]));
}

#[tokio::test]
async fn an_expired_lease_is_reported_as_a_lost_lease() {
    let (url, _) = stub(vec![
        initialize_reply(),
        Reply::json(json!({ "jsonrpc": "2.0" })),
        Reply::failure(
            409,
            json!({
                "error": "Conflict",
                "message": "The lease expired or the run is no longer running.",
                "statusCode": 409
            }),
        ),
    ])
    .await;

    let mut client = connect(&url).await;
    client.initialize().await.unwrap();
    let lease = Lease {
        run_id: "crun1".into(),
        lease_token: "0123456789abcdef0123456789abcdef".into(),
        fencing_token: 3,
    };
    let error = client
        .heartbeat_run(&lease, Some("still working"), "key-1")
        .await
        .unwrap_err();
    assert!(matches!(error, Error::LeaseLost { .. }), "got {error:?}");
    assert!(!error.is_retryable());
}

#[tokio::test]
async fn an_exhausted_budget_is_its_own_state() {
    let (url, _) = stub(vec![
        initialize_reply(),
        Reply::json(json!({ "jsonrpc": "2.0" })),
        Reply::failure(
            409,
            json!({
                "error": "Conflict",
                "message": "The run exceeded its two-hour budget. Release it before starting again.",
                "statusCode": 409
            }),
        ),
    ])
    .await;

    let mut client = connect(&url).await;
    client.initialize().await.unwrap();
    let lease = Lease {
        run_id: "crun1".into(),
        lease_token: "0123456789abcdef0123456789abcdef".into(),
        fencing_token: 3,
    };
    let error = client
        .heartbeat_run(&lease, None, "key-2")
        .await
        .unwrap_err();
    assert!(
        matches!(error, Error::RunBudgetExhausted { .. }),
        "got {error:?}"
    );
}

#[tokio::test]
async fn a_contract_violation_never_reaches_the_network() {
    // Only two replies are queued: if the invalid result were sent, the test
    // would hang waiting for a third connection instead of failing fast.
    // VI: Chỉ xếp sẵn hai phản hồi: nếu kết quả không hợp lệ bị gửi đi, test sẽ
    // VI: treo chờ kết nối thứ ba thay vì hỏng ngay.
    let (url, seen) = stub(vec![
        initialize_reply(),
        Reply::json(json!({ "jsonrpc": "2.0" })),
    ])
    .await;

    let mut client = connect(&url).await;
    client.initialize().await.unwrap();

    let lease = Lease {
        run_id: "crun1".into(),
        lease_token: "0123456789abcdef0123456789abcdef".into(),
        fencing_token: 1,
    };
    let result = flowie_mcp::RunResult {
        outcome: flowie_mcp::Outcome::AwaitingReview,
        summary: "claims to be done".into(),
        commit: Some("0123abc".into()),
        pull_request_url: None,
        tests: vec![],
    };
    let error = client
        .report_run_result(&lease, &result, "key-3")
        .await
        .unwrap_err();
    assert!(matches!(error, Error::Contract(_)), "got {error:?}");
    assert_eq!(seen.lock().unwrap().bodies.len(), 2);
}

#[tokio::test]
async fn an_issue_write_carries_the_version_it_is_guarded_by() {
    let (url, seen) = stub(vec![
        initialize_reply(),
        Reply::json(json!({ "jsonrpc": "2.0" })),
        Reply::json(json!({
            "jsonrpc": "2.0",
            "id": 2,
            "result": { "structuredContent": { "data": { "version": 8 } } }
        })),
        Reply::json(json!({
            "jsonrpc": "2.0",
            "id": 3,
            "result": { "structuredContent": { "data": { "id": "ccomment1" } } }
        })),
    ])
    .await;

    let mut client = connect(&url).await;
    client.initialize().await.unwrap();

    let updated = client
        .update_issue(
            "cissue1",
            7,
            &json!({ "targetDate": "2026-12-01" }),
            "key-schedule",
        )
        .await
        .unwrap();
    assert_eq!(updated["version"], json!(8));

    client
        .add_comment("cissue1", "Plan before implementation", "key-plan")
        .await
        .unwrap();

    let record = seen.lock().unwrap();
    let update = &record.bodies[2]["params"]["arguments"];
    assert_eq!(record.bodies[2]["params"]["name"], "update_issue");
    // The version the caller read travels with the write; without it two
    // writers overwrite each other silently.
    // VI: Version mà bên gọi đã đọc đi kèm lần ghi; thiếu nó thì hai bên ghi sẽ
    // VI: âm thầm đè lên nhau.
    assert_eq!(update["expectedVersion"], json!(7));
    assert_eq!(update["targetDate"], json!("2026-12-01"));
    assert_eq!(update["idempotencyKey"], json!("key-schedule"));

    let comment = &record.bodies[3]["params"]["arguments"];
    assert_eq!(record.bodies[3]["params"]["name"], "add_comment");
    assert_eq!(comment["content"], json!("Plan before implementation"));
    assert_eq!(comment["idempotencyKey"], json!("key-plan"));
}

#[tokio::test]
async fn a_field_colliding_with_an_owned_argument_never_reaches_the_network() {
    // Only two replies are queued, so a request that should not be sent makes
    // the test hang rather than pass quietly.
    // VI: Chỉ xếp sẵn hai phản hồi, nên một request lẽ ra không được gửi sẽ làm
    // VI: test treo chứ không lặng lẽ đạt.
    let (url, seen) = stub(vec![
        initialize_reply(),
        Reply::json(json!({ "jsonrpc": "2.0" })),
    ])
    .await;

    let mut client = connect(&url).await;
    client.initialize().await.unwrap();

    let error = client
        .update_issue(
            "cissue1",
            7,
            &json!({ "expectedVersion": 1, "targetDate": "2026-12-01" }),
            "key-1",
        )
        .await
        .unwrap_err();
    assert!(matches!(error, Error::Contract(_)), "got {error:?}");
    assert_eq!(seen.lock().unwrap().bodies.len(), 2);
}
