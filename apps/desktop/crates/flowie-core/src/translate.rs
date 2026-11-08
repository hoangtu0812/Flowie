//! Turning what the server reports into what the run may do next.
//!
//! This sits in `flowie-core` rather than in the shell because the question it
//! answers is a rule, not a detail of presentation: may this run keep touching
//! things? `RunFailure` is this crate's type and the orchestrator here is what
//! acts on it, so deciding it anywhere else would put a rule outside the crate
//! that owns it, and out of reach of tests that need no desktop application.
//! Core already depends on `flowie-mcp` with its transport feature off, so
//! naming those errors here adds no TLS stack and keeps the workspace
//! lint-checkable for macOS from a Windows machine.
//! VI: Biến những gì server báo về thành những gì run được phép làm tiếp.
//! VI: Phần này nằm trong `flowie-core` chứ không nằm ở vỏ ứng dụng, vì câu hỏi
//! VI: nó trả lời là một quy tắc chứ không phải chi tiết hiển thị: run này còn
//! VI: được đụng vào thứ gì nữa không? `RunFailure` là kiểu của crate này và
//! VI: orchestrator ở đây mới là thứ hành động theo nó, nên quyết định ở chỗ
//! VI: khác là đặt một quy tắc ra ngoài crate sở hữu nó, và ngoài tầm những
//! VI: test không cần tới ứng dụng desktop. Core vốn đã phụ thuộc `flowie-mcp`
//! VI: với feature transport tắt, nên gọi tên các lỗi đó ở đây không kéo thêm
//! VI: bộ TLS nào và vẫn giữ cho workspace kiểm lint được cho macOS từ máy
//! VI: Windows.
//!
//! Getting the mapping wrong is expensive in both directions: a lost lease
//! treated as retryable writes over the result of another connection, and a
//! transient timeout treated as a lost lease throws away a run that was fine,
//! silently.
//! VI: Ánh xạ sai thì đắt theo cả hai hướng: coi mất lease là có thể thử lại sẽ
//! VI: ghi đè kết quả của connection khác, còn coi một timeout tạm thời là mất
//! VI: lease thì vứt bỏ một run vốn không sao, và vứt trong im lặng.

use crate::run::RunFailure;
use flowie_mcp::Error as McpError;

/// Turns a server failure into the view the orchestrator takes of it.
///
/// `LeaseLost` is the only mapping that stops the run silently, so it is
/// deliberately narrow: exactly the condition the server uses to say another
/// connection owns this run now. An exhausted budget is reportable instead,
/// because the run is still ours. It simply ran out of time, and the person
/// deserves to be told that rather than meeting silence.
/// VI: Biến một thất bại của server thành cách orchestrator nhìn nó.
/// VI: `LeaseLost` là ánh xạ duy nhất khiến run dừng trong im lặng, nên nó cố
/// VI: ý hẹp: đúng tình huống server dùng để nói rằng connection khác đang sở
/// VI: hữu run này. Hết budget thì vẫn báo được, vì run vẫn là của mình. Nó chỉ
/// VI: hết giờ, và người dùng xứng đáng được biết điều đó thay vì nhận lấy sự
/// VI: im lặng.
pub fn translate(error: &McpError) -> RunFailure {
    match error {
        // The run belongs to someone else now. Anything further would be
        // writing over work this companion no longer owns.
        // VI: Run giờ thuộc về người khác. Làm thêm bất cứ điều gì cũng là ghi
        // VI: đè lên công việc mà companion này không còn sở hữu.
        McpError::LeaseLost { .. } => RunFailure::LeaseLost,

        // The machine or the connection cannot do this run at all, and no
        // amount of retrying changes that. Nothing has been claimed when these
        // appear during the read-only checks, and if they appear later the run
        // cannot finish either way.
        // VI: Máy hoặc kết nối hoàn toàn không làm được run này, và thử lại bao
        // VI: nhiêu lần cũng vậy. Khi chúng xuất hiện trong các bước chỉ đọc
        // VI: thì chưa claim gì, và nếu xuất hiện muộn hơn thì run cũng không
        // VI: hoàn thành được.
        McpError::Endpoint(detail) => RunFailure::Precondition(detail.clone()),
        McpError::Unauthorized { message } | McpError::MissingScope { message } => {
            RunFailure::Precondition(message.clone())
        }
        McpError::UnsupportedTool { name } => {
            RunFailure::Precondition(format!("this server does not provide {name}"))
        }

        // Still ours, still worth telling someone about.
        // VI: Vẫn là của mình, vẫn đáng báo cho ai đó biết.
        McpError::RunBudgetExhausted { message }
        | McpError::NotFound { message }
        | McpError::InvalidArguments { message } => RunFailure::Reportable(message.clone()),
        McpError::Server { status, message } => {
            RunFailure::Reportable(format!("server error {status}: {message}"))
        }
        McpError::Transport(detail) => {
            RunFailure::Reportable(format!("the server could not be reached: {detail}"))
        }
        McpError::Protocol(detail) | McpError::Contract(detail) => {
            RunFailure::Reportable(detail.clone())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_lost_lease_stops_the_run_silently() {
        // This is the one mapping that makes the run report nothing at all, so
        // it must cover exactly the condition where the run is no longer ours
        // and nothing wider.
        // VI: Đây là ánh xạ duy nhất khiến run không báo gì cả, nên nó phải phủ
        // VI: đúng tình huống run không còn là của mình, không rộng hơn.
        assert_eq!(
            translate(&McpError::LeaseLost {
                message: "This agent no longer owns the run.".into()
            }),
            RunFailure::LeaseLost
        );
    }

    #[test]
    fn an_exhausted_budget_is_reported_rather_than_silent() {
        // The run is still ours; it ran out of time. Silence here would leave a
        // person watching a task that never resolves.
        // VI: Run vẫn là của mình; nó chỉ hết giờ. Im lặng ở đây sẽ để một người
        // VI: ngồi nhìn một task không bao giờ kết thúc.
        let failure = translate(&McpError::RunBudgetExhausted {
            message: "The run exceeded its two-hour budget.".into(),
        });
        assert!(matches!(failure, RunFailure::Reportable(_)));
        assert_ne!(failure, RunFailure::LeaseLost);
    }

    #[test]
    fn a_revoked_credential_or_missing_scope_stops_before_claiming() {
        for error in [
            McpError::Unauthorized {
                message: "credential rejected".into(),
            },
            McpError::MissingScope {
                message: "missing runs:write".into(),
            },
        ] {
            assert!(
                matches!(translate(&error), RunFailure::Precondition(_)),
                "{error:?} must be a precondition, not something to report mid-run"
            );
        }
    }

    #[test]
    fn a_server_too_old_for_a_tool_is_a_precondition() {
        let failure = translate(&McpError::UnsupportedTool {
            name: "claim_issue".into(),
        });
        match failure {
            RunFailure::Precondition(detail) => assert!(detail.contains("claim_issue")),
            other => panic!("expected a precondition naming the tool, got {other:?}"),
        }
    }

    #[test]
    fn a_transient_outage_never_becomes_a_lost_lease() {
        // Treating a timeout as a lost lease throws away a run that was fine,
        // and does it silently.
        // VI: Coi một timeout là mất lease sẽ vứt bỏ một run vốn không sao, và
        // VI: vứt trong im lặng.
        let failure = translate(&McpError::Transport("timed out".into()));
        assert_ne!(failure, RunFailure::LeaseLost);
        assert!(matches!(failure, RunFailure::Reportable(_)));
    }

    #[test]
    fn a_contract_violation_is_ours_to_report() {
        let failure = translate(&McpError::Contract(
            "a code result awaiting review must report the tests it executed".into(),
        ));
        match failure {
            RunFailure::Reportable(detail) => assert!(detail.contains("tests")),
            other => panic!("expected the detail kept, got {other:?}"),
        }
    }

    #[test]
    fn every_variant_is_mapped_deliberately() {
        // A new variant added to flowie-mcp must be considered here rather than
        // falling into a catch-all that guesses. This list is the reminder;
        // translate has no wildcard arm.
        // VI: Một biến thể mới thêm vào flowie-mcp phải được cân nhắc ở đây chứ
        // VI: không rơi vào một nhánh bắt-tất-cả rồi đoán. Danh sách này là lời
        // VI: nhắc; translate không có nhánh wildcard.
        let all = [
            McpError::Endpoint("x".into()),
            McpError::Unauthorized {
                message: "x".into(),
            },
            McpError::MissingScope {
                message: "x".into(),
            },
            McpError::UnsupportedTool { name: "x".into() },
            McpError::LeaseLost {
                message: "x".into(),
            },
            McpError::RunBudgetExhausted {
                message: "x".into(),
            },
            McpError::NotFound {
                message: "x".into(),
            },
            McpError::InvalidArguments {
                message: "x".into(),
            },
            McpError::Server {
                status: 500,
                message: "x".into(),
            },
            McpError::Transport("x".into()),
            McpError::Protocol("x".into()),
            McpError::Contract("x".into()),
        ];
        let silent = all
            .iter()
            .filter(|e| translate(e) == RunFailure::LeaseLost)
            .count();
        assert_eq!(silent, 1, "exactly one variant may stop the run silently");
    }
}
