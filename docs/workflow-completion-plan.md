# Flowie — Kế hoạch hoàn thiện luồng công việc, đợt 2

- Ngày: 2026-10-14 (+07). Nhánh: `codex/workflow-completion`, base `6a231be`.
- Phạm vi: bốn nhóm lỗi còn sót và sáu nhóm cải tiến đã được người dùng yêu cầu thực hiện.
- Client nghiệm thu: Codex trên máy nội bộ; người dùng sẽ chỉ định project/bug.
- Trạng thái đầu kỳ: IN_PROGRESS. Không coi build/test local là nghiệm thu CT107.
- Mỗi commit cập nhật CHANGELOG; backend chia theo module; Web dùng Astryx và shared features.

## Quản lý phạm vi và nghiệm thu

| ID | Ưu tiên | Công việc | Phụ thuộc | Tiêu chí hoàn thành | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| WF-01 | P1 | Deployment khóa SHA đã verify; đối chiếu source và readiness | Workflow main | Không lấy commit mới hơn CI; fail khi source dirty hoặc SHA không hợp lệ; giữ migrate → api/worker | IN_PROGRESS |
| WF-02 | P1 | Inbox preview dùng issue thật, GFM, activity/comment và attachment chung | Shared issue modules | Issue ngoài page đầu vẫn mở đúng; gửi/upload thật, lỗi giữ draft; mobile có Properties | TODO |
| WF-03 | P1 | Inbox sort/error/retry và cache theo account/workspace | Notification module | Sort theo instant gốc; lỗi không giả empty; không áp dụng response cũ sau đổi scope | TODO |
| WF-04 | P2 | Batch và cursor comment/activity, tải thread có giới hạn | Core cursor, ACL | Query count không tăng theo số comment trong page; cursor bind issue/actor; comment mới không mất sau refresh | TODO |
| WF-05 | P2 | Codex local runner và quy trình một bug tới PR | Project/bug và scoped token do người dùng cấu hình | Dry-run/context/run lease/evidence/cancel; chạy thật chỉ khi có task, repo và quyền SCM; không gửi token vào prompt/log | TODO |
| WF-06 | P2 | Tìm kiếm toàn workspace theo quyền | Shared query/ACL | Tìm issue/document/project/member phía server, có limit/cursor, Ctrl+K dẫn đến entity đúng | TODO |
| WF-07 | P2 | Snooze, kênh thông báo và delivery status | Prisma migration, worker, SMTP/browser permission | Snooze lưu DB và thức lại; email có retry/outbox; desktop chỉ xin quyền khi người dùng chọn; trạng thái phản ánh config thật | TODO |
| WF-08 | P2 | Preferences theo tài khoản và locale | Identity API, migration | Đồng bộ qua reload/thiết bị, account isolation và version conflict; mở rộng chuỗi Inbox/search/activity en/vi | TODO |
| WF-09 | P2 | AI operations: quota workspace/tool, lỗi/latency/run, CI evidence | MCP/agent runs, SCM | Manager-only overview; quota atomic; phân biệt evidence agent báo cáo với evidence bên ngoài đã xác minh | TODO |
| WF-10 | P2 | E2E Inbox, tải lớn, Firefox/WebKit và acceptance hạ tầng | WF-01–09 | Hồi quy API/DB thật, browser matrix, test MinIO/SMTP integration có điều kiện; ghi riêng phần chưa có config | TODO |

## Thứ tự triển khai và commit

1. Commit kế hoạch; sau đó WF-01 riêng để reviewer xem deployment độc lập.
2. WF-02/03: notification data/query và Inbox presentation tách module; dùng chung ActivityFeed/GFM/properties.
3. WF-04: backend page repository rồi Web page/thread controller; giữ response envelope tương thích.
4. WF-06: search service/contract/API rồi command UI; không tìm trên cache page đầu.
5. WF-07/08: migrations cùng API/worker; UI riêng; flag/config mặc định an toàn, availability thật.
6. WF-09/05: operations contracts/dashboard và local runner; run lease/repo boundary/token/SCM access rõ.
7. WF-10: E2E/benchmarks và tài liệu nghiệm thu, mỗi commit có entry Unreleased.

## Kiến trúc dự kiến

- API adapters không chứa vòng hydrate hoặc gọi controller khác: `modules/notifications`, `work_items`, `identity`, `search`, `agent_runs`, `mcp`.
- Web: `features/inbox`, `issues`, `search`, `notifications`, `identity`, `ai`; dùng `lib/http`, `lib/time`, `SubmissionGate` và scope guards.
- CLI runner: package trong `scripts/flowie_runner`, provider Codex riêng với contract độc lập; repository execution chỉ trên máy người dùng.
- Database do Prisma quản lý; migration đã commit phải chạy trước API/worker. Không đổi production schema trực tiếp.

## Cổng nghiệm thu

- Unit/API/DB: ACL, stale version, cursor scope, retries/idempotency, quota concurrency, snooze wake-up và account isolation.
- CI: clean migrations + schema diff, Ruff, web lint/types/build, browser regressions.
- Hạ tầng: SMTP delivery/MinIO thật chỉ đánh dấu PASS sau kiểm tra integration; không thay adapter production bằng fixture.
- AI thật: cần project/bug cụ thể và token đã cấu hình ngoài Git; không ghi credential vào kế hoạch. SCM PR creation có quyền riêng từ người dùng.
- CT107: chỉ sau merge được cho phép; kiểm tra workflow đúng SHA, migrations/readiness/smoke. Release/tag theo AGENTS.md.

## Bằng chứng cần cập nhật khi bàn giao

Ghi từng ID: module/commit, số kiểm thử, kết quả UI, migration/config mới, giới hạn còn lại và owner nghiệm thu production. Các mục phụ thuộc dữ liệu hoặc quyền ngoài phiên phải giữ WAITING_ACCEPTANCE, không tự ghi DONE.
