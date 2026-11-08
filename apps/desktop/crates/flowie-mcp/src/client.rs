//! The MCP streamable-HTTP transport and the Flowie tool surface.
//!
//! Written by hand rather than on an MCP client crate. The DTD-492 spike
//! proved roughly 170 lines are enough to talk to the live server, and the
//! companion calls fifteen tools over a stable protocol; taking on another
//! crate's release cycle buys nothing for that.
//! VI: Transport streamable HTTP của MCP và bề mặt tool Flowie.
//! VI: Viết tay thay vì dùng một crate client MCP. Spike DTD-492 đã chứng minh
//! VI: khoảng 170 dòng là đủ để nói chuyện với server thật, và companion chỉ
//! VI: gọi mười lăm tool trên một giao thức ổn định; gánh thêm vòng đời phát
//! VI: hành của một crate khác không đem lại gì cho việc đó.

use std::time::Duration;

use serde_json::{json, Value};

use crate::contract::{Lease, RunResult};
use crate::endpoint::Endpoint;
use crate::error::{classify, Error, Result};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

/// Holds the connection token. Its `Debug` is redacted so the token cannot
/// reach a log, a crash report or a diagnostics export by accident.
/// VI: Giữ token của kết nối. `Debug` của nó được che để token không thể lọt
/// VI: vào log, báo cáo lỗi hay bản xuất chẩn đoán một cách vô tình.
#[derive(Clone)]
pub struct Token(String);

impl Token {
    pub fn new(value: impl Into<String>) -> Result<Self> {
        let value = value.into();
        if value.trim().is_empty() {
            return Err(Error::Contract("the connection token is empty".into()));
        }
        Ok(Self(value))
    }
}

impl std::fmt::Debug for Token {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Token(<redacted>)")
    }
}

/// A Flowie MCP connection.
/// VI: Một kết nối MCP tới Flowie.
#[derive(Debug)]
pub struct Client {
    http: reqwest::Client,
    endpoint: Endpoint,
    token: Token,
    session: Option<String>,
    next_id: i64,
}

impl Client {
    pub fn new(endpoint: Endpoint, token: Token) -> Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|error| Error::Transport(error.to_string()))?;
        Ok(Self {
            http,
            endpoint,
            token,
            session: None,
            next_id: 1,
        })
    }

    /// Opens the session. The server's `mcp-session-id` is kept and sent on
    /// every later request.
    /// VI: Mở phiên. `mcp-session-id` của server được giữ lại và gửi kèm mọi
    /// VI: request sau đó.
    pub async fn initialize(&mut self) -> Result<Value> {
        let id = self.take_id();
        let reply = self
            .post(
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-06-18",
                        "capabilities": {},
                        "clientInfo": { "name": "flowie-desktop", "version": env!("CARGO_PKG_VERSION") }
                    }
                }),
                true,
            )
            .await?
            .ok_or_else(|| Error::Protocol("initialize returned no reply".into()))?;
        self.post(
            json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
            false,
        )
        .await?;
        Ok(reply)
    }

    /// Names of the tools the server exposes. Used to tell "this server is
    /// older than this companion" apart from "this call was rejected".
    /// VI: Tên các tool server cung cấp. Dùng để phân biệt "server cũ hơn
    /// VI: companion này" với "lời gọi này bị từ chối".
    pub async fn list_tools(&mut self) -> Result<Vec<String>> {
        let id = self.take_id();
        let reply = self
            .post(
                json!({ "jsonrpc": "2.0", "id": id, "method": "tools/list", "params": {} }),
                true,
            )
            .await?
            .ok_or_else(|| Error::Protocol("tools/list returned no reply".into()))?;
        Ok(reply["tools"]
            .as_array()
            .map(|tools| {
                tools
                    .iter()
                    .filter_map(|tool| tool["name"].as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default())
    }

    /// Calls a tool and unwraps the `{data: ...}` envelope the Flowie server
    /// wraps every successful result in.
    /// VI: Gọi một tool và bóc envelope `{data: ...}` mà server Flowie bọc
    /// VI: quanh mọi kết quả thành công.
    pub async fn call(&mut self, name: &str, arguments: Value) -> Result<Value> {
        let id = self.take_id();
        let reply = self
            .post(
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "method": "tools/call",
                    "params": { "name": name, "arguments": arguments }
                }),
                true,
            )
            .await?
            .ok_or_else(|| Error::Protocol(format!("{name} returned no reply")))?;

        if reply["isError"].as_bool().unwrap_or(false) {
            return Err(tool_error(name, &content_text(&reply)));
        }
        let payload = if reply["structuredContent"].is_object() {
            reply["structuredContent"].clone()
        } else {
            serde_json::from_str::<Value>(&content_text(&reply)).map_err(|_| {
                Error::Protocol(format!(
                    "{name} returned neither structured content nor JSON"
                ))
            })?
        };
        Ok(payload.get("data").cloned().unwrap_or(payload))
    }

    // Read-only tools. Their payload shapes belong to the crates that consume
    // them, so the values pass through untyped; the lifecycle tools below are
    // typed because this crate owns their contract.
    // VI: Các tool chỉ đọc. Hình dạng payload của chúng thuộc về crate sử dụng,
    // VI: nên giá trị đi qua không định kiểu; các tool vòng đời bên dưới có
    // VI: kiểu vì crate này sở hữu hợp đồng của chúng.

    /// The workspaces this connection can see. Their slugs are what a browser
    /// address needs, and nothing else reports them.
    /// VI: Các workspace mà kết nối này thấy được. Slug của chúng là thứ một địa chỉ
    /// VI: trình duyệt cần, và không chỗ nào khác báo chúng.
    pub async fn list_workspaces(&mut self) -> Result<Value> {
        self.call("list_workspaces", json!({})).await
    }

    pub async fn get_my_access(&mut self) -> Result<Value> {
        self.call("get_my_access", json!({})).await
    }

    pub async fn get_project_repositories(&mut self, project_id: &str) -> Result<Value> {
        self.call(
            "get_project_repositories",
            json!({ "projectId": project_id }),
        )
        .await
    }

    pub async fn get_issue_context(&mut self, issue_id: &str) -> Result<Value> {
        self.call("get_issue_context", json!({ "issueId": issue_id }))
            .await
    }

    pub async fn get_feature_docs(&mut self, issue_id: &str) -> Result<Value> {
        self.call("get_feature_docs", json!({ "issueId": issue_id }))
            .await
    }

    pub async fn get_issue(&mut self, issue_id: &str) -> Result<Value> {
        self.call("get_issue", json!({ "issueId": issue_id })).await
    }

    pub async fn get_run(&mut self, run_id: &str) -> Result<Value> {
        self.call("get_run", json!({ "runId": run_id })).await
    }

    /// Runs queued for this connection. `assigned_to_this_connection` keeps a
    /// runner off work routed to another agent.
    /// VI: Các run đang xếp hàng cho kết nối này. `assigned_to_this_connection`
    /// VI: giữ cho runner không đụng vào việc định tuyến cho agent khác.
    pub async fn list_runs(
        &mut self,
        state: Option<&str>,
        project_id: Option<&str>,
        assigned_to_this_connection: bool,
        limit: u32,
    ) -> Result<Value> {
        let mut arguments = json!({
            "assignedToThisConnection": assigned_to_this_connection,
            "limit": limit
        });
        if let Some(state) = state {
            arguments["state"] = json!(state);
        }
        if let Some(project) = project_id {
            arguments["projectId"] = json!(project);
        }
        self.call("list_runs", arguments).await
    }

    // Run lifecycle. Every mutation takes the caller's idempotency key: a
    // retry must reuse the key it already sent, because a new key after a lost
    // response is how one logical action becomes two.
    // VI: Vòng đời run. Mọi mutation nhận idempotency key của bên gọi: lần thử
    // VI: lại phải dùng đúng key đã gửi, vì tạo key mới sau khi mất response
    // VI: chính là cách một hành động logic biến thành hai.

    pub async fn claim_issue(&mut self, issue_id: &str, idempotency_key: &str) -> Result<Value> {
        self.call(
            "claim_issue",
            json!({ "issueId": issue_id, "idempotencyKey": idempotency_key }),
        )
        .await
    }

    pub async fn heartbeat_run(
        &mut self,
        lease: &Lease,
        progress: Option<&str>,
        idempotency_key: &str,
    ) -> Result<Value> {
        lease.validate()?;
        let mut arguments = lease_arguments(lease, idempotency_key);
        if let Some(progress) = progress {
            crate::contract::validate_progress(progress)?;
            arguments["progress"] = json!(progress);
        }
        self.call("heartbeat_run", arguments).await
    }

    pub async fn release_issue(&mut self, lease: &Lease, idempotency_key: &str) -> Result<Value> {
        lease.validate()?;
        self.call("release_issue", lease_arguments(lease, idempotency_key))
            .await
    }

    pub async fn cancel_run(&mut self, run_id: &str, idempotency_key: &str) -> Result<Value> {
        self.call(
            "cancel_run",
            json!({ "runId": run_id, "idempotencyKey": idempotency_key }),
        )
        .await
    }

    pub async fn report_run_result(
        &mut self,
        lease: &Lease,
        result: &RunResult,
        idempotency_key: &str,
    ) -> Result<Value> {
        lease.validate()?;
        result.validate()?;
        let mut arguments = lease_arguments(lease, idempotency_key);
        let body =
            serde_json::to_value(result).map_err(|error| Error::Contract(error.to_string()))?;
        if let Some(fields) = body.as_object() {
            for (key, value) in fields {
                arguments[key] = value.clone();
            }
        }
        self.call("report_run_result", arguments).await
    }

    // Issue and document writes. These are what a run does to the task itself
    // rather than to its own lifecycle: the plan comment, the target date and
    // the feature documents.
    // VI: Các lần ghi lên issue và tài liệu. Đây là những gì một run tác động
    // VI: lên chính task chứ không lên vòng đời của nó: comment kế hoạch, ngày
    // VI: kết thúc dự kiến và các tài liệu tính năng.

    /// Adds a comment to an issue.
    /// VI: Thêm một comment vào issue.
    pub async fn add_comment(
        &mut self,
        issue_id: &str,
        content: &str,
        idempotency_key: &str,
    ) -> Result<Value> {
        self.call(
            "add_comment",
            json!({
                "issueId": issue_id,
                "content": content,
                "idempotencyKey": idempotency_key
            }),
        )
        .await
    }

    /// Changes fields on an issue, guarded by the version the caller read.
    ///
    /// `expected_version` is not optional on purpose. Two writers that both
    /// skip it overwrite each other silently, and the run writes to an issue a
    /// person may be editing at the same moment. `changes` carries the fields
    /// to set and may not name the three arguments this method owns, so a
    /// caller cannot smuggle in a different issue, a different version or a
    /// different idempotency key than the ones it passed.
    /// VI: Thay đổi các trường của một issue, có version mà bên gọi đã đọc làm
    /// VI: chốt.
    /// VI: `expected_version` cố ý không phải tùy chọn. Hai bên ghi mà cùng bỏ
    /// VI: qua nó sẽ âm thầm đè lên nhau, và run ghi lên một issue mà một người
    /// VI: có thể đang sửa cùng lúc. `changes` mang các trường cần đặt và không
    /// VI: được nêu ba tham số mà method này sở hữu, nên bên gọi không thể lén
    /// VI: đưa vào một issue khác, một version khác hay một idempotency key
    /// VI: khác với thứ nó đã truyền.
    pub async fn update_issue(
        &mut self,
        issue_id: &str,
        expected_version: i64,
        changes: &Value,
        idempotency_key: &str,
    ) -> Result<Value> {
        let mut arguments = json!({
            "issueId": issue_id,
            "expectedVersion": expected_version,
            "idempotencyKey": idempotency_key
        });
        merge_fields(&mut arguments, changes, "update_issue")?;
        self.call("update_issue", arguments).await
    }

    /// Creates or updates one feature document (an FDS or a TDS).
    ///
    /// `draft` is the document as the reviewing pass produced it. Its shape
    /// belongs to the server's tool rather than to this crate, so it passes
    /// through untyped, with the same guard against overriding the arguments
    /// this method owns.
    /// VI: Tạo hoặc cập nhật một tài liệu tính năng (FDS hoặc TDS).
    /// VI: `draft` là tài liệu đúng như lượt review tạo ra. Hình dạng của nó
    /// VI: thuộc về tool của server chứ không thuộc crate này, nên nó đi qua
    /// VI: không định kiểu, với cùng một lớp chặn việc ghi đè các tham số mà
    /// VI: method này sở hữu.
    pub async fn upsert_feature_doc(
        &mut self,
        issue_id: &str,
        draft: &Value,
        idempotency_key: &str,
    ) -> Result<Value> {
        let mut arguments = json!({
            "issueId": issue_id,
            "idempotencyKey": idempotency_key
        });
        merge_fields(&mut arguments, draft, "upsert_feature_doc")?;
        self.call("upsert_feature_doc", arguments).await
    }

    async fn post(&mut self, body: Value, expect_reply: bool) -> Result<Option<Value>> {
        let mut request = self
            .http
            .post(self.endpoint.as_str())
            .bearer_auth(&self.token.0)
            .header("content-type", "application/json")
            .header("accept", "application/json, text/event-stream");
        if let Some(session) = &self.session {
            request = request.header("mcp-session-id", session.clone());
        }

        let response =
            request.json(&body).send().await.map_err(|error| {
                Error::Transport(strip_token(&error.to_string(), &self.token.0))
            })?;

        let status = response.status().as_u16();
        if let Some(id) = response.headers().get("mcp-session-id") {
            if let Ok(value) = id.to_str() {
                self.session = Some(value.to_string());
            }
        }
        let text = response
            .text()
            .await
            .map_err(|error| Error::Transport(strip_token(&error.to_string(), &self.token.0)))?;

        if !(200..300).contains(&status) {
            return Err(classify(status, extract_message(&text).trim()));
        }
        if !expect_reply {
            return Ok(None);
        }
        Ok(Some(parse_payload(&text)?))
    }

    fn take_id(&mut self) -> i64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }
}

/// Copies caller-supplied fields into a prepared argument object, refusing any
/// that would replace an argument the calling method already set.
///
/// Those arguments are the ones that decide which issue is written, which
/// version the write is guarded by and which key makes a retry idempotent. A
/// field that silently replaced one of them would turn a safe call into an
/// unguarded write against something else, so the collision is an error the
/// caller has to see rather than something resolved by whichever side happens
/// to be copied last.
/// VI: Chép các trường do bên gọi cung cấp vào một object tham số đã dựng sẵn,
/// từ chối bất kỳ trường nào sẽ thay thế một tham số mà method gọi đã đặt.
/// VI: Những tham số đó quyết định issue nào bị ghi, version nào làm chốt cho
/// VI: lần ghi, và key nào khiến lần thử lại là idempotent. Một trường âm thầm
/// VI: thay thế một trong số đó sẽ biến một lời gọi an toàn thành một lần ghi
/// VI: không chốt lên thứ khác, nên xung đột là lỗi bên gọi phải thấy chứ không
/// VI: phải thứ được giải quyết bằng việc bên nào tình cờ được chép sau.
fn merge_fields(arguments: &mut Value, fields: &Value, tool: &str) -> Result<()> {
    let Some(fields) = fields.as_object() else {
        return Err(Error::Contract(format!(
            "{tool} fields must be a JSON object"
        )));
    };
    let reserved: Vec<String> = arguments
        .as_object()
        .map(|owned| owned.keys().cloned().collect())
        .unwrap_or_default();
    for name in fields.keys() {
        if reserved.iter().any(|owned| owned == name) {
            return Err(Error::Contract(format!(
                "{tool} fields must not set {name}"
            )));
        }
    }
    for (name, value) in fields {
        arguments[name] = value.clone();
    }
    Ok(())
}

fn lease_arguments(lease: &Lease, idempotency_key: &str) -> Value {
    json!({
        "runId": lease.run_id,
        "leaseToken": lease.lease_token,
        "fencingToken": lease.fencing_token,
        "idempotencyKey": idempotency_key
    })
}

/// A tool-level failure carries the server's error envelope as text, so the
/// status code is read back out of it to reach the same classification an
/// HTTP-level failure gets.
/// VI: Lỗi ở mức tool mang envelope lỗi của server dưới dạng text, nên status
/// VI: code được đọc ngược ra từ đó để đạt cùng cách phân loại như lỗi ở mức HTTP.
fn tool_error(name: &str, text: &str) -> Error {
    let parsed: Option<Value> = serde_json::from_str(text).ok();
    let status = parsed
        .as_ref()
        .and_then(|value| value["statusCode"].as_u64())
        .unwrap_or(0) as u16;
    let message = parsed
        .as_ref()
        .and_then(|value| value["message"].as_str())
        .unwrap_or(text)
        .to_string();
    if status == 0 {
        return Error::Server {
            status: 0,
            message: format!("{name}: {message}"),
        };
    }
    classify(status, &message)
}

/// Pulls the server's human-readable `message` out of its error envelope,
/// falling back to the raw body so an unexpected shape is still reported
/// rather than swallowed.
/// VI: Lấy `message` dành cho người đọc từ envelope lỗi của server, dự phòng
/// VI: bằng nguyên body để một hình dạng bất ngờ vẫn được báo chứ không bị nuốt.
fn extract_message(text: &str) -> String {
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|value| value["message"].as_str().map(str::to_string))
        .unwrap_or_else(|| text.to_string())
}

fn content_text(reply: &Value) -> String {
    reply["content"]
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find(|item| item["type"] == "text")
                .and_then(|item| item["text"].as_str())
        })
        .unwrap_or_default()
        .to_string()
}

/// A token must never survive into an error string, even one produced by a
/// dependency that saw the request URL or headers.
/// VI: Token không bao giờ được lọt vào một chuỗi lỗi, kể cả chuỗi do một thư
/// VI: viện phụ thuộc sinh ra khi nó nhìn thấy URL hay header của request.
fn strip_token(text: &str, token: &str) -> String {
    if token.is_empty() {
        return text.to_string();
    }
    text.replace(token, "<redacted>")
}

/// A streamable-HTTP server may answer with plain JSON or with an SSE frame.
/// VI: Server streamable HTTP có thể trả JSON thường hoặc một khung SSE.
fn parse_payload(text: &str) -> Result<Value> {
    let message: Value = match serde_json::from_str(text) {
        Ok(direct) => direct,
        Err(_) => {
            let data: String = text
                .lines()
                .filter_map(|line| line.strip_prefix("data:"))
                .map(str::trim)
                .collect::<Vec<_>>()
                .join("");
            if data.is_empty() {
                return Err(Error::Protocol(
                    "the reply was neither JSON nor an SSE data frame".into(),
                ));
            }
            serde_json::from_str(&data)
                .map_err(|_| Error::Protocol("the SSE data frame was not JSON".into()))?
        }
    };
    if let Some(error) = message.get("error") {
        let status = error["code"].as_i64().unwrap_or(0);
        let text = error["message"].as_str().unwrap_or("JSON-RPC error");
        return Err(Error::Server {
            status: status.unsigned_abs() as u16,
            message: text.to_string(),
        });
    }
    message
        .get("result")
        .cloned()
        .ok_or_else(|| Error::Protocol("the reply carried no result".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_debug_is_redacted() {
        let token = Token::new("flowie_live_abcdef123456").unwrap();
        let rendered = format!("{token:?}");
        assert!(!rendered.contains("abcdef123456"));
        assert_eq!(rendered, "Token(<redacted>)");
    }

    #[test]
    fn an_empty_token_is_rejected_before_any_request() {
        assert!(matches!(Token::new("   "), Err(Error::Contract(_))));
    }

    #[test]
    fn client_debug_never_contains_the_token() {
        let client = Client::new(
            Endpoint::parse("https://flowie.example.com/mcp/").unwrap(),
            Token::new("flowie_live_abcdef123456").unwrap(),
        )
        .unwrap();
        assert!(!format!("{client:?}").contains("abcdef123456"));
    }

    #[test]
    fn a_token_is_stripped_out_of_transport_errors() {
        let text = strip_token(
            "error sending request for url https://x/mcp/ with bearer flowie_live_secret",
            "flowie_live_secret",
        );
        assert!(!text.contains("flowie_live_secret"));
        assert!(text.contains("<redacted>"));
    }

    #[test]
    fn sse_frames_and_plain_json_both_decode() {
        let plain = r#"{"jsonrpc":"2.0","id":1,"result":{"ok":true}}"#;
        assert_eq!(parse_payload(plain).unwrap()["ok"], json!(true));

        let sse =
            "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"ok\":true}}\n\n";
        assert_eq!(parse_payload(sse).unwrap()["ok"], json!(true));
    }

    #[test]
    fn a_reply_without_a_result_is_a_protocol_error() {
        assert!(matches!(
            parse_payload(r#"{"jsonrpc":"2.0","id":1}"#),
            Err(Error::Protocol(_))
        ));
        assert!(matches!(
            parse_payload("not json at all"),
            Err(Error::Protocol(_))
        ));
    }

    #[test]
    fn tool_errors_reuse_the_http_classification() {
        // Shapes taken from the live server during the DTD-492 spike.
        // VI: Hình dạng lấy từ server thật trong spike DTD-492.
        let not_found = tool_error(
            "claim_issue",
            r#"{"error": "Not Found", "message": "Issue not found in the allowed scope.", "statusCode": 404}"#,
        );
        assert!(matches!(not_found, Error::NotFound { .. }));

        let budget = tool_error(
            "heartbeat_run",
            r#"{"error": "Conflict", "message": "The run exceeded its two-hour budget. Release it before starting again.", "statusCode": 409}"#,
        );
        assert!(matches!(budget, Error::RunBudgetExhausted { .. }));

        let opaque = tool_error("list_runs", "something went wrong");
        assert!(matches!(opaque, Error::Server { status: 0, .. }));
    }

    #[test]
    fn lifecycle_arguments_carry_the_whole_lease() {
        let lease = Lease {
            run_id: "crun1".into(),
            lease_token: "0123456789abcdef".into(),
            fencing_token: 7,
        };
        let arguments = lease_arguments(&lease, "key-1");
        assert_eq!(arguments["runId"], json!("crun1"));
        assert_eq!(arguments["fencingToken"], json!(7));
        assert_eq!(arguments["idempotencyKey"], json!("key-1"));
    }

    #[test]
    fn supplied_fields_are_added_alongside_the_arguments_the_method_owns() {
        let mut arguments = json!({ "issueId": "cissue1", "idempotencyKey": "key-1" });
        merge_fields(
            &mut arguments,
            &json!({ "targetDate": "2026-12-01", "estimatedEffort": 2 }),
            "update_issue",
        )
        .unwrap();
        assert_eq!(arguments["issueId"], json!("cissue1"));
        assert_eq!(arguments["targetDate"], json!("2026-12-01"));
        assert_eq!(arguments["estimatedEffort"], json!(2));
    }

    #[test]
    fn a_supplied_field_can_never_replace_an_argument_the_method_owns() {
        // Replacing one of these turns a guarded write to one issue into an
        // unguarded write to another, which is worth an error rather than
        // depending on which side is copied last.
        // VI: Thay thế một trong những tham số này biến một lần ghi có chốt lên
        // VI: một issue thành một lần ghi không chốt lên issue khác, điều đáng
        // VI: báo lỗi chứ không nên phụ thuộc vào bên nào được chép sau.
        for intruder in ["issueId", "expectedVersion", "idempotencyKey"] {
            let mut arguments = json!({
                "issueId": "cissue1",
                "expectedVersion": 3,
                "idempotencyKey": "key-1"
            });
            let error = merge_fields(
                &mut arguments,
                &json!({ intruder: "someone else" }),
                "update_issue",
            )
            .unwrap_err();
            assert!(
                matches!(&error, Error::Contract(detail) if detail.contains(intruder)),
                "{intruder} was accepted: {error:?}"
            );
            // The prepared arguments are left exactly as they were.
            // VI: Các tham số đã dựng được giữ nguyên như cũ.
            assert_eq!(arguments["expectedVersion"], json!(3));
            assert_eq!(arguments["issueId"], json!("cissue1"));
        }
    }

    #[test]
    fn fields_that_are_not_an_object_are_refused() {
        let mut arguments = json!({ "issueId": "cissue1" });
        for wrong in [json!("a string"), json!([1, 2]), json!(null)] {
            assert!(matches!(
                merge_fields(&mut arguments, &wrong, "upsert_feature_doc"),
                Err(Error::Contract(_))
            ));
        }
    }
}
