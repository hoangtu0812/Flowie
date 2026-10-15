# Flowie — Kế hoạch triển khai hoàn thiện sản phẩm

Ngày 2026-10-15 (+07), nhánh `codex/product-completeness`, base `f3ae6ae`.
Phạm vi đã được yêu cầu: toàn bộ AUD-01–12 và NEXT-01–09 trong báo cáo
`product-completeness-review-2026-10-15.md`.

## Theo dõi công việc

| ID | Module / cổng nghiệm thu | Trạng thái |
| --- | --- | --- |
| AUD-01/02 | Shared project access policy; list/initiative không rò metadata và không fail toàn list; test member/admin/revocation | LOCAL_VERIFIED |
| AUD-03/04 | Saved View provider; route quản lý status; URL/reload/permission E2E | LOCAL_VERIFIED |
| AUD-05 | Shared issue query scope và aggregate server; >100 rows, ACL, Load more invariance | LOCAL_VERIFIED |
| AUD-06 | Error boundaries và Saved View Retry đã có; còn chuẩn hóa recovery các trang legacy khác | IN_PROGRESS |
| AUD-07 | Batched portfolio list, cursor/history và load-more UI; bounded queries | TODO |
| AUD-08 | Dependency probes, request ID/build identity, scrubbed error report, job heartbeat/lag | LOCAL_VERIFIED |
| AUD-09 | Backup/restore tooling và rehearsal đã kiểm tra; đích S3 độc lập, credential và CT107 inventory chưa cấu hình | WAITING_CONFIGURATION |
| AUD-10 | Đã thêm role/revocation, >100 rows, view/error/workflow/operations; tiếp tục mở rộng theo feature | IN_PROGRESS |
| AUD-11 | Codex bug thật → PR; người dùng cho phép tự chọn project/bug, đang chuẩn bị nghiệm thu | IN_PROGRESS |
| AUD-12 | Cập nhật bằng chứng kế hoạch cũ, build identity/release checklist; release thực sau deploy verified | TODO |
| NEXT-01 | Bulk preview/execute có version/ACL/idempotency và explicit all-results selection | LOCAL_VERIFIED |
| NEXT-02 | Recurring schedules/timezone, lease/idempotency, pause/run history và UI | TODO |
| NEXT-03 | Business calendar, SLA pause/resume/escalation, policy revision và reports | TODO |
| NEXT-04 | Archived center/restore theo quyền, retention; không purge object khi chưa có policy/backup | TODO |
| NEXT-05 | CSV mapping/preview/validation/dedup, filtered scoped export và document export | TODO |
| NEXT-06 | Server reporting trên actual status history: flow, aging, WIP, reopen, workload | TODO |
| NEXT-07 | MFA/IdP policy, per-session revoke, credential inventory và login audit | TODO |
| NEXT-08 | Workspace audit cursor/filter/export và admin UI | TODO |
| NEXT-09 | Locale core workflows, week start/timezone, optional self-assignment, keyboard/mobile | TODO |

## Thứ tự commit và kiến trúc

1. Bản kế hoạch và báo cáo; mỗi commit sau cập nhật CHANGELOG cùng thay đổi.
2. Quyền và đọc portfolio: access predicate chung, repository/service/API adapter tách module.
3. Saved Views/settings/errors; query và aggregate chung, route regressions.
4. Readiness/observability/backup/build identity trước scheduler và feature có job.
5. Bulk, archived, import/export và workspace audit dùng chung query/ACL.
6. Recurring và SLA: Prisma migrations, worker lease/idempotency, history, UI.
7. Reporting, account security/preferences và nghiệm thu AI khi có đầu vào.

Web dùng feature modules và Astryx; backend mở rộng `modules/access`,
`work_items`, `portfolio`, `operations`, `identity`; scheduler và read repository
không nằm trong controller. Mọi schema do Prisma quản lý; migration đã commit
phải hoàn tất trước API/worker. Production duy nhất CT107.

## Bằng chứng và bàn giao

- Kiểm thử DB synthetic có rollback; HTTP/Web E2E fixture riêng; không dùng production cho fixture.
- Mọi item chỉ đánh dấu LOCAL_VERIFIED khi code và kiểm thử tương ứng đạt;
  DEPLOYED cần đúng SHA, migration/readiness và smoke trên CT107.
- SMTP/mailbox, off-host backup, MFA/IdP policy và bug thật cần đầu vào thực;
  trạng thái WAITING_INPUT/WAITING_ACCEPTANCE được ghi riêng.
- Code được chuẩn bị trên nhánh để review. Merge main và release/tag là các
  hành động production; không suy ra đã deploy từ build local.

## Nhật ký nghiệm thu

AUD-01/02: predicate chung cho project list, initiative project links/count/activity,
search và MCP; issue options lọc project/status/cycle theo team membership.
DB regressions kiểm tra member/admin/owner, cấp và thu hồi membership; full MCP
và workspace search 35 passed, 10 subtests. Chưa deploy đợt này.

AUD-03/04/05: build/lint/types pass; workflow service test kiểm tra stale version,
status in-use và bootstrap không ghi đè. Issue Insights kiểm tra 150 issue được
phép đọc + 25 issue team khác, page 100/50, filter và cả bốn dimension.
Saved Views direct URL/reload/retry và workflow CRUD: 12/12 E2E trên ba engine.

AUD-08: 89 migrations và schema diff pass trên DB thử; backend full 131 passed,
1 optional S3 skip, 10 subtests. MinIO ký request thật (bao gồm HEAD hợp lệ và
credential sai) + SMTP/TLS: 3 passed. Web build, 17 unit và worker build pass;
Operations/report contract E2E 3/3 trên ba engine. Runbook nêu bucket phải được
provision và phân biệt liveness, readiness, heartbeat và progress. Chưa deploy.

NEXT-01: preview không đổi task, all-results giới hạn 1000, retry cùng key,
stale version, quyền bị thu hồi, hủy, concurrent workers và rollback side effect
đã kiểm tra DB. Bulk UI preview/apply/reload/resume: 3/3 engine. Backend 133 passed,
1 optional storage skip, 10 subtests; production web build pass. Migration thứ 90
đã áp dụng trên DB thử và schema diff không có thay đổi. Chưa deploy.

AUD-09: đề xuất restic mã hóa đến S3-compatible độc lập CT107, retention 7 ngày /
4 tuần / 6 tháng. Công cụ capture dừng writer, restart khi lỗi, manifest SHA256,
restore đích mới và stale-backup status; deployment dùng chung flock. Kiểm thử
3 ca guard/rollback và 1 rehearsal thật (restic 0.19.1 checksum verified, S3 trên
MinIO thử, PostgreSQL custom dump → DB mới, physical MinIO → server mới, hash
attachment và mật khẩu sai). Chưa có đích off-host thật và chưa bật timer CT107.
