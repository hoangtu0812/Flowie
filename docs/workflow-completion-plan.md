# Flowie — Kế hoạch hoàn thiện luồng công việc, đợt 2

- Ngày: 2026-10-14 (+07). Nhánh: `codex/workflow-completion`, base `6a231be`.
- Phạm vi: bốn nhóm lỗi còn sót và sáu nhóm cải tiến đã được người dùng yêu cầu thực hiện.
- Client nghiệm thu: Codex trên máy nội bộ; người dùng sẽ chỉ định project/bug.
- Trạng thái code local: READY_FOR_REVIEW. Không coi build/test local là nghiệm thu CT107.
- Mỗi commit cập nhật CHANGELOG; backend chia theo module; Web dùng Astryx và shared features.

## Quản lý phạm vi và nghiệm thu

| ID | Ưu tiên | Công việc | Phụ thuộc | Tiêu chí hoàn thành | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| WF-01 | P1 | Deployment khóa SHA đã verify; đối chiếu source và readiness | Workflow main | Không lấy commit mới hơn CI; fail khi source dirty hoặc SHA không hợp lệ; giữ migrate → api/worker | IN_REVIEW |
| WF-02 | P1 | Inbox preview dùng issue thật, GFM, activity/comment và attachment chung | Shared issue modules | Issue ngoài page đầu vẫn mở đúng; gửi/upload thật, lỗi giữ draft; mobile có Properties | IN_REVIEW |
| WF-03 | P1 | Inbox sort/error/retry và cache theo account/workspace | Notification module | Sort theo instant gốc; lỗi không giả empty; không áp dụng response cũ sau đổi scope | IN_REVIEW |
| WF-04 | P2 | Batch và cursor comment/activity, tải thread có giới hạn | Core cursor, ACL | Query count không tăng theo số comment trong page; cursor bind issue/actor; comment mới không mất sau refresh | IN_REVIEW |
| WF-05 | P2 | Codex local runner và quy trình một bug tới PR | Project/bug và scoped token do người dùng cấu hình | Dry-run/context/run lease/evidence/cancel; chạy thật chỉ khi có task, repo và quyền SCM; không gửi token vào prompt/log | WAITING_ACCEPTANCE |
| WF-06 | P2 | Tìm kiếm toàn workspace theo quyền | Shared query/ACL | Tìm issue/document/project/member phía server, có limit/cursor, Ctrl+K dẫn đến entity đúng | IN_REVIEW |
| WF-07 | P2 | Snooze, kênh thông báo và delivery status | Prisma migration, worker, SMTP/browser permission | Snooze lưu DB và thức lại; email có retry/outbox; desktop chỉ xin quyền khi người dùng chọn; trạng thái phản ánh config thật | IN_REVIEW |
| WF-08 | P2 | Preferences theo tài khoản và locale | Identity API, migration | Đồng bộ qua reload/thiết bị, account isolation và version conflict; mở rộng chuỗi Inbox/search/activity en/vi | IN_REVIEW |
| WF-09 | P2 | AI operations: quota workspace/tool, lỗi/latency/run, CI evidence | MCP/agent runs, SCM | Manager-only overview; quota atomic; phân biệt evidence agent báo cáo với evidence bên ngoài đã xác minh | IN_REVIEW |
| WF-10 | P2 | E2E Inbox, tải lớn, Firefox/WebKit và acceptance hạ tầng | WF-01–09 | Hồi quy API/DB thật, browser matrix, test MinIO/SMTP integration có điều kiện; ghi riêng phần chưa có config | IN_REVIEW |

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

Checkpoint local WF-02/03: TypeScript/build pass, 16 unit và 16 E2E pass; Inbox đã có fixture notification và kiểm tra gửi comment/Retry/task không cache.

Checkpoint WF-04: batch/cursor test DB pass (query count bằng nhau ở page 2/30 root); 17 unit, 17 E2E và web build pass; backend hồi quy trước test mới 103 pass, 2 skipped.

Checkpoint WF-06: Unicode/multi-entity/private-team/cursor DB test và E2E search → document trực tiếp pass; web build pass.

Checkpoint WF-08: migration account preferences áp dụng trên DB thử; account/version test và E2E hai browser context/home navigation pass; build pass. Chuỗi locale bổ sung tiếp trong cùng đợt.

## Bàn giao triển khai local

Các module đã có mã và kiểm thử. `IN_REVIEW` nghĩa là đạt cổng local, đang chờ PR/CI/review và triển khai production; không phải DONE trên CT107. WF-05 đã có runner nhưng giữ WAITING_ACCEPTANCE vì người dùng sẽ chỉ định project/bug.

| Nhóm | Bằng chứng | Kết quả / giới hạn |
| --- | --- | --- |
| API/DB/MCP | Full suite với PostgreSQL và MinIO thật | 119 passed, 2 skipped, 10 subtests; thêm test chặn đọc CI repository ngoài team và rerun AI/runner: 10 passed. Hai test persistence SCM/Microsoft ban đầu thiếu SCM_TEST_DATABASE_URL; đã bật và chạy 2/2 pass trên DB sạch. CI đã cấp biến và SCM test tự tạo fixture khi DB rỗng. |
| Prisma | DB nâng cấp và DB mới `flowie_wf_clean` | 88 migrations áp dụng; migrate diff không có khác biệt. Không dùng DB production. |
| Web | Unit, lint/types trong Next production build | 17 unit pass; build pass. Shared Astryx features và facade giữ tương thích với route cũ. |
| Browser | 22 kịch bản × Chromium/Firefox/WebKit | Full matrix 64/66 pass; phát hiện checkbox desktop phản hồi chậm và test dùng thông điệp lỗi riêng của browser. Đã sửa và chạy lại cả hai nhóm trên ba browser: 6/6 pass. CI sẽ chạy lại toàn bộ 66 trên commit được push. |
| Hạ tầng | S3 adapter với MinIO container riêng; SMTP socket/TLS thật | Binary/Unicode key/overwrite/cleanup và STARTTLS/TLS trực tiếp: 3/3 pass. Đây là fixture local có TLS trust riêng; mailbox/SMTP và MinIO trên CT107 vẫn cần smoke sau deploy. |
| AI/runner | Repository Git tạm, provider/SCM fixture, timeout/lease loss | Token không vào môi trường con; project/repo binding, CLI capability, test evidence, FAILED và AWAITING_REVIEW được kiểm tra. Doctor đã chạy với CLI Codex hiện có (capability/login status) và repo fixture: ready=true; không gọi model. Chưa chạy Codex trên bug thật. |
| Production trước đợt 2 | GitHub workflow 38555900872, SHA `6a231be` | Main vẫn ở base; workflow verify, deploy và API readiness đều success. Nhánh mới của đợt 2 chưa được publish/merge/deploy. |

### Thay đổi cần triển khai cùng nhau

- Bốn migration mới của đợt 2: `account_ui_preferences`, `notification_channels_snooze`, `notification_queue_utc`, `ai_operation_limits`. Compose migrate phải hoàn tất trước API/worker; giữ thứ tự đầy đủ, không chỉ chạy migration cuối.
- Email thông báo opt-in mặc định false. Cần SMTP_HOST/PORT/FROM, STARTTLS hoặc SMTP_SSL, credential đúng và email recipient đã xác minh. Không đưa nội dung task/bug vào email hay desktop body. Queue retry tối đa 8 lần, lease 2 phút; delivery có thể at-least-once. Mỗi lần tạm hoãn tối đa 30 ngày; worker thức lại theo lô 100.
- Desktop permission theo từng trình duyệt/máy; chỉ hỏi khi người dùng chọn bật. Settings được lưu theo account/workspace. Test cấp quyền tự động chỉ dùng Chromium; luồng snooze/availability được kiểm tra ở cả ba engine.
- Quota mặc định 300 tool request hợp lệ/phút/workspace; có thể đặt riêng mỗi tool 1–10000. Nhiều connection dùng chung quota; idempotent retry vẫn tính vào ngân sách. Quota window cũ được dọn sau 7 ngày.
- Xác minh CI hiện hỗ trợ GitHub.com với GitHub App đã cấu hình, repository enabled và gắn project; kiểm tra cả issue/team ACL. SHA đầy đủ phải khớp PR head trước/sau snapshot. Tối đa 100 check/status/workflow; vượt giới hạn giữ UNVERIFIED. Không thay branch protection/review và không tự đánh dấu Done.
- Runner dùng local clone sạch và Codex đã đăng nhập; approved local test argv không lấy từ server. `--publish` chỉ hỗ trợ GitHub.com qua Git/gh credential hiện có. Cần review kết quả trước merge; khi kết nối lỗi, đối chiếu run state trước retry.

### Công việc còn cần đầu vào / quyền

| Việc | Owner | Điều kiện / hành động tiếp theo |
| --- | --- | --- |
| Publish nhánh và PR nháp của đợt 2 | Người dùng / Codex | Đã được cho phép và thực hiện: [PR nháp #3](https://github.com/hoangtu0812/Flowie/pull/3), nhánh `codex/workflow-completion`. Các bản sửa CI được cập nhật trên cùng nhánh. |
| CI Linux trên commit mới | CI | Theo dõi [checks của PR #3](https://github.com/hoangtu0812/Flowie/pull/3/checks): clean migrate/schema diff, Ruff, build/unit, SMTP/MinIO, 66 browser E2E. Nếu lỗi phải sửa trên nhánh trước merge. |
| Bug thật → Codex local → PR | Người dùng chọn bug; runner thực thi | Cung cấp project/issue và cấu hình token/repo/test/SCM ở máy. Theo `docs/local-codex-runner.md`; chưa có dữ liệu nên chưa khởi chạy AI. |
| Email/desktop và storage CT107 | Quản trị vận hành | Smoke có quyền trên môi trường đang chạy; kiểm tra queue/status bằng recipient fixture đã duyệt. Không dùng thành công local để xác nhận mailbox thật. |
| Merge/deploy/release | Reviewer và quản trị production | Review/CI đạt; merge được cho phép; verify workflow đúng SHA, migrations/readiness. Version/tag/release theo AGENTS.md. |

Không còn TODO về mã trong 10 nhóm. Các bước cần token/bug thực, CI và CT107 còn mở theo bảng; không đổi chúng thành DONE vì đã có fixture.

### Checkpoint publish và CI

- Người dùng đã cho phép publish nhánh, tạo PR nháp và sửa CI trên cùng nhánh. Bản đầu `3d0c572` (12 commit) được đẩy và gắn PR #3 vào chat.
- Hai workflow push/PR đầu tiên đã đạt migration/schema và backend, rồi lỗi khi dựng MinIO: `docker compose pull` tuân theo `pull_policy: never`, khiến runner sạch không có image. CI đã đổi sang `docker pull minio/minio:latest` trước Compose. Cấu hình production giữ nguyên.
- Trạng thái CI hiện tại lấy từ checks của PR; dòng production trước đợt 2 ở bảng trên là checkpoint trước publish. Nhánh đợt 2 chưa được merge/deploy; chưa chạy AI trên bug thật.
