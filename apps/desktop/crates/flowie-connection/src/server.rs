//! A `Server` port backed by a real MCP connection.
//!
//! Two things happen here that are worth knowing about before reading on.
//!
//! The client is asynchronous and the port is not. The orchestrator is a long
//! sequence of blocking steps that runs on its own thread, so each call is
//! driven to completion on a runtime this connection owns. That is the simple
//! direction to bridge: the alternative, making every port async, would put
//! boxed futures through the traits the rules are written against for no gain,
//! because there is nothing else for that thread to do while a call is in
//! flight.
//! VI: Một cổng `Server` chạy trên một kết nối MCP thật.
//! VI: Có hai điều đáng biết trước khi đọc tiếp.
//! VI: Client là bất đồng bộ còn cổng thì không. Orchestrator là một chuỗi dài
//! VI: các bước blocking chạy trên thread riêng của nó, nên mỗi lời gọi được
//! VI: chạy tới khi xong trên một runtime do kết nối này sở hữu. Đó là chiều
//! VI: dễ bắc cầu: cách còn lại, biến mọi cổng thành async, sẽ nhồi future đóng
//! VI: hộp qua những trait mà các quy tắc dựa vào, mà không được gì, vì thread
//! VI: đó chẳng có việc khác để làm trong lúc một lời gọi đang bay.
//!
//! The lease is kept here rather than handed back through the port. `claim`
//! returns the run id because that is all the rules need; the lease token and
//! the fencing token are a bearer secret for the run and a guard against a
//! stale writer, and every later call needs them. Keeping them in one place
//! means no step can heartbeat or report without them, and losing ownership
//! clears them so a later step cannot write to a run this connection no
//! longer holds.
//! VI: Lease được giữ ở đây chứ không trả ngược qua cổng. `claim` trả về run id
//! VI: vì đó là tất cả những gì các quy tắc cần; lease token và fencing token
//! VI: là bí mật dạng bearer của run và là lớp chặn một bên ghi đã cũ, và mọi
//! VI: lời gọi sau đều cần chúng. Giữ chúng ở một chỗ nghĩa là không bước nào
//! VI: heartbeat hay báo kết quả mà thiếu chúng, và khi mất quyền sở hữu thì
//! VI: chúng được xoá để một bước sau không ghi lên một run kết nối này không
//! VI: còn giữ.

use std::future::Future;

use flowie_core::run::{Achievement, FeatureDoc, RunFailure, Server, TestOutcome};
use flowie_core::sequence::Outcome;
use flowie_core::translate;
use flowie_mcp::{
    Client, Endpoint, Lease, Outcome as Reported, RunResult, TestEvidence, TestResult, Token,
};
use serde_json::{json, Value};

/// The state a run sits in while it waits for the machine it was routed to.
/// VI: Trạng thái một run nằm chờ máy mà nó được định tuyến tới.
const PENDING: &str = "PENDING";

/// How many waiting runs to ask about at once. The companion takes one run at
/// a time, so this only needs to be enough to see that there is work and to
/// skip over an entry that turns out to be unusable.
/// VI: Hỏi về bao nhiêu run đang chờ mỗi lần. Companion chỉ làm một run tại một
/// VI: thời điểm, nên con số này chỉ cần đủ để thấy có việc và để bỏ qua một mục
/// VI: hoá ra không dùng được.
const POLL_LIMIT: u32 = 5;

/// One piece of work waiting for this machine.
/// VI: Một phần việc đang chờ máy này.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Assigned {
    pub run_id: String,
    pub issue_id: String,
    /// What a person calls the task, for the tray line. The server may not
    /// send it, and a run is still workable without it.
    /// VI: Cách một người gọi task, dùng cho dòng trên tray. Server có thể không
    /// VI: gửi, và thiếu nó thì run vẫn làm được.
    pub identifier: Option<String>,
    pub title: Option<String>,
}

/// Reads one waiting run, or skips it.
///
/// A row without an issue id cannot be claimed and a row without a run id
/// cannot be tracked, so neither is worth carrying forward; the rest of the
/// page is still usable, which is why this skips rather than fails.
/// VI: Đọc một run đang chờ, hoặc bỏ qua nó.
/// VI: Một dòng thiếu issue id thì không claim được và thiếu run id thì không
/// VI: theo dõi được, nên không đáng mang theo; phần còn lại của trang vẫn dùng
/// VI: được, nên ở đây bỏ qua chứ không báo lỗi.
fn assigned(item: &Value) -> Option<Assigned> {
    Some(Assigned {
        run_id: item["id"].as_str()?.to_string(),
        issue_id: item["issueId"].as_str()?.to_string(),
        identifier: item["issueIdentifier"].as_str().map(str::to_string),
        title: item["issueTitle"].as_str().map(str::to_string),
    })
}

/// A connection to one Flowie server, holding the lease for the run it
/// claimed.
/// VI: Một kết nối tới một server Flowie, giữ lease của run mà nó đã claim.
pub struct Connection {
    runtime: tokio::runtime::Runtime,
    client: Client,
    lease: Option<Lease>,
    warnings: Vec<String>,
}

impl Connection {
    /// Opens a connection and completes the MCP handshake.
    ///
    /// Must not be called from a thread that is already inside a tokio
    /// runtime: the runtime built here is driven with `block_on`, which panics
    /// when a runtime is already running on the thread. The companion starts
    /// the orchestrator on a thread of its own, which is where this belongs.
    /// VI: Mở một kết nối và hoàn tất bắt tay MCP.
    /// VI: Không được gọi từ một thread đã nằm trong một tokio runtime: runtime
    /// VI: dựng ở đây được chạy bằng `block_on`, thứ sẽ panic khi trên thread đã
    /// VI: có một runtime đang chạy. Companion khởi động orchestrator trên một
    /// VI: thread riêng, và đó là nơi dành cho hàm này.
    pub fn open(endpoint: Endpoint, token: Token) -> Result<Self, RunFailure> {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|error| {
                RunFailure::Precondition(format!("no runtime for the connection: {error}"))
            })?;
        let mut client = Client::new(endpoint, token).map_err(|error| translate(&error))?;
        runtime
            .block_on(client.initialize())
            .map_err(|error| translate(&error))?;
        Ok(Self {
            runtime,
            client,
            lease: None,
            warnings: Vec::new(),
        })
    }

    /// What went wrong in a way that did not stop the run, in the order it
    /// happened. A document that could not be saved lands here rather than
    /// ending the run, which is the level agreed in AGENTS.md.
    /// VI: Những gì đã sai theo cách không làm dừng run, theo thứ tự xảy ra. Một
    /// VI: tài liệu không lưu được sẽ nằm ở đây chứ không kết thúc run, đúng mức
    /// VI: đã thống nhất trong AGENTS.md.
    pub fn warnings(&self) -> &[String] {
        &self.warnings
    }

    /// The scopes this connection holds and whether it may write at all, for
    /// the readiness check the companion runs before it takes any work.
    /// VI: Các scope kết nối này có và nó có được ghi hay không, dành cho bước
    /// VI: kiểm tra sẵn sàng mà companion chạy trước khi nhận bất kỳ việc nào.
    pub fn access(&mut self) -> Result<(Vec<String>, bool), RunFailure> {
        let Self {
            runtime,
            client,
            lease,
            ..
        } = self;
        let value = finish(runtime, lease, client.get_my_access())?;
        let scopes = value["scopes"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        // Absent is taken as read-only. A connection that cannot write fails at
        // its first write, after the issue has already been claimed, so the
        // cautious reading is the correct one.
        // VI: Thiếu trường này thì coi là chỉ đọc. Một kết nối không ghi được sẽ
        // VI: hỏng ở lần ghi đầu tiên, khi issue đã bị claim, nên cách hiểu thận
        // VI: trọng mới là cách đúng.
        let writes = value["writesEnabled"].as_bool().unwrap_or(false);
        Ok((scopes, writes))
    }

    /// Work this connection has been given and has not started yet.
    ///
    /// A run reaches `PENDING` when something routes an issue to this
    /// connection; only that connection may claim it, so there is no race to
    /// win here and no reason to ask for anyone else's work. Asking the server
    /// to filter is what keeps that true: a companion that fetched everything
    /// and filtered locally would be one mistake away from claiming a run
    /// routed to a different machine, which the server would refuse anyway but
    /// only after the attempt.
    /// VI: Việc đã được giao cho kết nối này và chưa bắt đầu.
    /// VI: Một run ở trạng thái `PENDING` khi có thứ gì đó định tuyến một issue
    /// VI: tới kết nối này; chỉ kết nối đó được claim, nên không có cuộc đua nào
    /// VI: để thắng và không có lý do gì hỏi việc của người khác. Để server lọc
    /// VI: chính là thứ giữ cho điều đó đúng: một companion lấy hết rồi tự lọc
    /// VI: sẽ chỉ cách một sai sót là đi claim một run định tuyến cho máy khác,
    /// VI: điều server vẫn từ chối nhưng chỉ sau khi đã thử.
    pub fn assigned_runs(&mut self, project: Option<&str>) -> Result<Vec<Assigned>, RunFailure> {
        let Self {
            runtime,
            client,
            lease,
            ..
        } = self;
        let page = finish(
            runtime,
            lease,
            client.list_runs(Some(PENDING), project, true, POLL_LIMIT),
        )?;
        Ok(page["items"]
            .as_array()
            .map(|items| items.iter().filter_map(assigned).collect())
            .unwrap_or_default())
    }

    /// The lease, or a precondition failure naming the real mistake: a step
    /// that needs the lease ran before the claim, or after ownership was lost.
    /// VI: Lease, hoặc một thất bại precondition nêu đúng lỗi thật: một bước cần
    /// VI: lease đã chạy trước khi claim, hoặc sau khi mất quyền sở hữu.
    fn held(&self) -> Result<Lease, RunFailure> {
        self.lease
            .clone()
            .ok_or_else(|| RunFailure::Precondition("this connection holds no claimed run".into()))
    }
}

/// Drives one call to completion and translates any failure.
///
/// Takes the runtime, the lease slot and the future separately rather than
/// `&mut self`, because the future already borrows the client: splitting the
/// borrows is what lets a call be made and the lease be cleared in one place
/// without boxing every future to get past the borrow checker.
/// VI: Chạy một lời gọi tới khi xong và chuyển đổi mọi thất bại.
/// VI: Nhận runtime, ô chứa lease và future một cách riêng rẽ chứ không nhận
/// VI: `&mut self`, vì future đã vay mượn client: tách các lần vay chính là thứ
/// VI: cho phép gọi và xoá lease ở cùng một chỗ mà không phải đóng hộp mọi
/// VI: future chỉ để lách borrow checker.
fn finish<T>(
    runtime: &tokio::runtime::Runtime,
    lease: &mut Option<Lease>,
    future: impl Future<Output = flowie_mcp::Result<T>>,
) -> Result<T, RunFailure> {
    runtime.block_on(future).map_err(|error| {
        let failure = translate(&error);
        if failure == RunFailure::LeaseLost {
            // The run belongs to someone else now, so this connection must not
            // use the lease again even if a later step asks it to.
            // VI: Run giờ thuộc về người khác, nên kết nối này không được dùng
            // VI: lại lease dù một bước sau có yêu cầu.
            *lease = None;
        }
        failure
    })
}

impl Server for Connection {
    fn read_context(&mut self, issue: &str) -> Result<(), RunFailure> {
        let Self {
            runtime,
            client,
            lease,
            ..
        } = self;
        finish(runtime, lease, client.get_issue_context(issue))?;
        Ok(())
    }

    fn claim(&mut self, issue: &str, key: &str) -> Result<String, RunFailure> {
        let claimed = {
            let Self {
                runtime,
                client,
                lease,
                ..
            } = self;
            finish(runtime, lease, client.claim_issue(issue, key))?
        };

        // Everything the lease needs has to be present. A claim that answered
        // without a token would leave the run owned but unusable, and every
        // later call would fail for a reason that says nothing about the cause.
        // VI: Mọi thứ lease cần đều phải có. Một lần claim trả về mà thiếu token
        // VI: sẽ để run bị sở hữu nhưng không dùng được, và mọi lời gọi sau đều
        // VI: hỏng với một lý do không nói gì về nguyên nhân.
        let lease = Lease {
            run_id: field(&claimed, "id")?,
            lease_token: field(&claimed, "leaseToken")?,
            fencing_token: claimed["fencingToken"].as_i64().ok_or_else(|| {
                RunFailure::Reportable("the claim returned no fencing token".into())
            })?,
        };
        lease.validate().map_err(|error| translate(&error))?;
        let run_id = lease.run_id.clone();
        self.lease = Some(lease);
        Ok(run_id)
    }

    fn heartbeat(&mut self, progress: Option<&str>, key: &str) -> Result<(), RunFailure> {
        let held = self.held()?;
        let Self {
            runtime,
            client,
            lease,
            ..
        } = self;
        finish(runtime, lease, client.heartbeat_run(&held, progress, key))?;
        Ok(())
    }

    fn save_feature_docs(
        &mut self,
        issue: &str,
        docs: &[FeatureDoc],
        key: &str,
    ) -> Result<(), RunFailure> {
        let Self {
            runtime,
            client,
            lease,
            warnings,
        } = self;
        for (index, doc) in docs.iter().enumerate() {
            // Each document gets its own key derived from the step's key, so a
            // retry after a lost response saves the same document again rather
            // than adding a second copy of it.
            // VI: Mỗi tài liệu có key riêng dẫn từ key của bước, nên một lần thử
            // VI: lại sau khi mất response sẽ lưu lại đúng tài liệu đó chứ không
            // VI: thêm một bản thứ hai.
            let doc_key = format!("{key}-{index}");
            let draft = draft_arguments(doc);
            let saved = finish(
                runtime,
                lease,
                client.upsert_feature_doc(issue, &draft, &doc_key),
            );
            if let Err(failure) = saved {
                if failure == RunFailure::LeaseLost {
                    // Ownership is the one thing a warning cannot cover: going
                    // on would write to a run this connection no longer holds.
                    // VI: Quyền sở hữu là thứ duy nhất một cảnh báo không che
                    // VI: được: đi tiếp là ghi lên một run kết nối này không còn
                    // VI: giữ.
                    return Err(failure);
                }
                // Missing documentation is a warning rather than a blocker, as
                // agreed in AGENTS.md, so the run delivers the code and the gap
                // stays visible instead of the work being thrown away.
                // VI: Thiếu tài liệu là cảnh báo chứ không phải thứ chặn đường,
                // VI: đúng như đã thống nhất trong AGENTS.md, nên run vẫn giao
                // VI: code và chỗ thiếu vẫn hiện rõ thay vì vứt bỏ công việc.
                warnings.push(format!(
                    "{} · {}/{} was not saved: {}",
                    doc.doc_type.as_str(),
                    doc.module,
                    doc.feature,
                    detail(&failure)
                ));
            }
        }
        Ok(())
    }

    fn read_issue_version(&mut self, issue: &str) -> Result<i64, RunFailure> {
        let Self {
            runtime,
            client,
            lease,
            ..
        } = self;
        let value = finish(runtime, lease, client.get_issue(issue))?;
        value["version"].as_i64().ok_or_else(|| {
            RunFailure::Reportable(
                "the issue came back without a version to guard the write".into(),
            )
        })
    }

    fn record_schedule(
        &mut self,
        issue: &str,
        version: i64,
        target_date: &str,
        key: &str,
    ) -> Result<(), RunFailure> {
        let changes = json!({ "targetDate": target_date });
        let Self {
            runtime,
            client,
            lease,
            ..
        } = self;
        finish(
            runtime,
            lease,
            client.update_issue(issue, version, &changes, key),
        )?;
        Ok(())
    }

    fn post_plan(&mut self, issue: &str, plan: &str, key: &str) -> Result<(), RunFailure> {
        // Warnings ride along with the plan, which is where a person looks
        // first and the only place a document that could not be saved would
        // otherwise be invisible.
        // VI: Cảnh báo đi kèm kế hoạch, nơi người dùng xem trước nhất và cũng là
        // VI: chỗ duy nhất mà một tài liệu không lưu được sẽ bị vô hình.
        let content = if self.warnings.is_empty() {
            plan.to_string()
        } else {
            let notes: Vec<String> = self
                .warnings
                .iter()
                .map(|warning| format!("- {warning}"))
                .collect();
            format!("{plan}\n\nFDS/TDS:\n{}", notes.join("\n"))
        };
        let Self {
            runtime,
            client,
            lease,
            ..
        } = self;
        finish(runtime, lease, client.add_comment(issue, &content, key))?;
        Ok(())
    }

    fn report(
        &mut self,
        outcome: Outcome,
        summary: &str,
        achieved: &Achievement,
        key: &str,
    ) -> Result<(), RunFailure> {
        let held = self.held()?;
        let reported = match outcome {
            Outcome::AwaitingReview => Reported::AwaitingReview,
            Outcome::Failed => Reported::Failed,
            // `Released` goes through `release`, and `StoppedUncertain` reports
            // nothing at all, so the orchestrator never sends these here.
            // Guessing one of the two the server accepts would record the wrong
            // thing; this says so instead.
            // VI: `Released` đi qua `release`, còn `StoppedUncertain` không báo
            // VI: gì cả, nên orchestrator không bao giờ gửi chúng tới đây. Đoán
            // VI: lấy một trong hai giá trị server nhận sẽ ghi sai; ở đây nói
            // VI: thẳng ra thay vì đoán.
            other => {
                return Err(RunFailure::Precondition(format!(
                    "{other:?} is not an outcome the server records"
                )))
            }
        };
        let result = RunResult {
            outcome: reported,
            summary: summary.to_string(),
            commit: achieved.commit.clone(),
            pull_request_url: achieved.pull_request_url.clone(),
            tests: achieved.tests.iter().map(evidence).collect(),
        };
        let Self {
            runtime,
            client,
            lease,
            ..
        } = self;
        finish(
            runtime,
            lease,
            client.report_run_result(&held, &result, key),
        )?;
        Ok(())
    }

    fn release(&mut self, key: &str) -> Result<(), RunFailure> {
        let held = self.held()?;
        {
            let Self {
                runtime,
                client,
                lease,
                ..
            } = self;
            finish(runtime, lease, client.release_issue(&held, key))?;
        }
        // Released means handed back; keeping the lease would let a later step
        // write to a run this connection no longer holds.
        // VI: Release nghĩa là đã trả lại; giữ lease sẽ cho một bước sau ghi lên
        // VI: một run kết nối này không còn giữ.
        self.lease = None;
        Ok(())
    }
}

/// Reads a required string out of a server reply, saying which field was
/// missing rather than failing later with nothing to go on.
/// VI: Đọc một chuỗi bắt buộc từ phản hồi của server, nói rõ thiếu trường nào
/// VI: thay vì hỏng về sau mà không có gì để lần theo.
fn field(value: &Value, name: &str) -> Result<String, RunFailure> {
    value[name]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| RunFailure::Reportable(format!("the claim returned no {name}")))
}

/// The wire shape of one feature document.
/// VI: Hình dạng trên đường truyền của một tài liệu tính năng.
fn draft_arguments(doc: &FeatureDoc) -> Value {
    json!({
        "module": doc.module,
        "feature": doc.feature,
        "docType": doc.doc_type.as_str(),
        "content": doc.content,
        "changeSummary": doc.change_summary
    })
}

/// One executed check as the result contract wants it. The verdict comes from
/// the exit code, so the evidence cannot claim a pass the code contradicts.
/// VI: Một bài kiểm tra đã chạy theo đúng thứ hợp đồng kết quả muốn. Kết luận
/// VI: lấy từ exit code, nên bằng chứng không thể khẳng định một lần đạt mà exit
/// VI: code phủ nhận.
fn evidence(test: &TestOutcome) -> TestEvidence {
    TestEvidence {
        name: test.name.clone(),
        command: test.command.clone(),
        exit_code: test.exit_code,
        result: if test.passed() {
            TestResult::Passed
        } else {
            TestResult::Failed
        },
        duration_ms: test.duration_ms,
        log: test.log.clone(),
    }
}

/// The text of a failure, for a warning a person will read.
/// VI: Phần chữ của một thất bại, dành cho một cảnh báo mà người dùng sẽ đọc.
fn detail(failure: &RunFailure) -> String {
    match failure {
        RunFailure::Precondition(detail) | RunFailure::Reportable(detail) => detail.clone(),
        RunFailure::LeaseLost => "the run is no longer owned by this companion".into(),
        RunFailure::Cancelled => "the run was cancelled".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flowie_core::run::DocType;

    fn doc() -> FeatureDoc {
        FeatureDoc {
            module: "Desktop".into(),
            feature: "Companion".into(),
            doc_type: DocType::Tds,
            content: "# Companion".into(),
            change_summary: "Describes the run.".into(),
        }
    }

    #[test]
    fn a_draft_is_sent_in_the_shape_the_tool_expects() {
        let arguments = draft_arguments(&doc());
        assert_eq!(arguments["module"], json!("Desktop"));
        assert_eq!(arguments["feature"], json!("Companion"));
        assert_eq!(arguments["docType"], json!("TDS"));
        assert_eq!(arguments["changeSummary"], json!("Describes the run."));
        // The issue and the key belong to the method that sends this, and a
        // draft carrying them would be refused by the client.
        // VI: Issue và key thuộc về method gửi đi, và một bản nháp mang theo
        // VI: chúng sẽ bị client từ chối.
        assert!(arguments.get("issueId").is_none());
        assert!(arguments.get("idempotencyKey").is_none());
    }

    #[test]
    fn evidence_takes_its_verdict_from_the_exit_code() {
        let mut test = TestOutcome {
            name: "approved-local-test-1".into(),
            command: vec!["pnpm".into(), "test".into()],
            exit_code: 0,
            duration_ms: 90,
            log: "ok".into(),
        };
        assert_eq!(evidence(&test).result, TestResult::Passed);
        test.exit_code = 2;
        let mapped = evidence(&test);
        assert_eq!(mapped.result, TestResult::Failed);
        // Everything the contract needs for an audit survives the mapping.
        // VI: Mọi thứ hợp đồng cần để kiểm toán đều sống sót qua phép chuyển đổi.
        assert_eq!(mapped.command, vec!["pnpm".to_string(), "test".to_string()]);
        assert_eq!(mapped.exit_code, 2);
        assert_eq!(mapped.duration_ms, 90);
        assert_eq!(mapped.log, "ok");
    }

    #[test]
    fn a_failure_always_has_text_for_a_person_to_read() {
        for failure in [
            RunFailure::Precondition("no checkout".into()),
            RunFailure::Reportable("server said no".into()),
            RunFailure::LeaseLost,
            RunFailure::Cancelled,
        ] {
            assert!(!detail(&failure).is_empty(), "{failure:?} had no text");
        }
    }

    #[test]
    fn a_claim_reply_missing_a_field_names_the_field() {
        let reply = json!({ "id": "crun1", "fencingToken": 1 });
        let error = field(&reply, "leaseToken").unwrap_err();
        match error {
            RunFailure::Reportable(detail) => assert!(detail.contains("leaseToken")),
            other => panic!("expected the field named, got {other:?}"),
        }
        assert_eq!(field(&reply, "id").unwrap(), "crun1");
    }
}
