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
| AUD-06 | Error boundaries, Saved View, Projects và Initiative Retry; trạng thái lỗi tách khỏi not found | LOCAL_VERIFIED |
| AUD-07 | Batched portfolio list, cursor/update history và load-more UI; aggregate theo quyền đọc | LOCAL_VERIFIED |
| AUD-08 | Dependency probes, request ID/build identity, scrubbed error report, job heartbeat/lag | LOCAL_VERIFIED |
| AUD-09 | Backup/restore tooling và rehearsal đã kiểm tra; đã đề xuất B2/S3, còn account/bucket/key, CT107 inventory và restore ngoài máy chủ | WAITING_CONFIGURATION |
| AUD-10 | Ma trận route/role/revocation, dữ liệu lớn, recovery và các feature mới trên ba engine; bằng chứng chi tiết bên dưới | LOCAL_VERIFIED |
| AUD-11 | Đã chạy Codex thật + MCP local cho bug locale Archived; CLI hiệu lực read-only, run FAILED không có code; cần cấu hình quyền/production login | WAITING_CONFIGURATION |
| AUD-12 | Đối chiếu PR/workflow/SHA kế hoạch cũ và checklist release đã ghi; release nhánh mới chờ CI/deploy xác minh | LOCAL_VERIFIED |
| NEXT-01 | Bulk preview/execute có version/ACL/idempotency và explicit all-results selection | LOCAL_VERIFIED |
| NEXT-02 | Recurring schedules/timezone, transaction lock/idempotency, pause/run history và UI | LOCAL_VERIFIED |
| NEXT-03 | Business calendar, SLA pause/resume/escalation, policy revision và reports | LOCAL_VERIFIED |
| NEXT-04 | Archived center cho task/project/document/initiative; restore preview/version/dependency/audit; giữ dữ liệu, không purge | LOCAL_VERIFIED |
| NEXT-05 | CSV mapping/preview/validation/dedup, worker/resume/cancel; filtered scoped issue CSV và document/attachment ZIP | LOCAL_VERIFIED |
| NEXT-06 | Server reporting/flow/aging/WIP/reopen/workload và dashboard theo lịch sử thực | LOCAL_VERIFIED |
| NEXT-07 | Session binding/revoke, paged history/credential inventory và TOTP/recovery MFA cho password/Microsoft | LOCAL_VERIFIED |
| NEXT-08 | Workspace audit cursor/filter/export theo current ACL; source Web/AI/SYSTEM/UNKNOWN; admin UI | LOCAL_VERIFIED |
| NEXT-09 | Locale theo module cho luồng chính, week start/timezone, optional self-assignment, keyboard/mobile | LOCAL_VERIFIED |

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

AUD-06/07: portfolio page 100/55 trên 155 project, 100/25 trên 125 initiative;
project list tối đa 5 query, initiative list tối đa 7 query; 115 update đọc hết
qua cursor không trùng/mất. Task của team riêng trong shared project và private
project updates không lọt qua summary/detail/history. 9/9 portfolio recovery,
paging/history E2E trên ba engine. Full UI: 94/96 lần đầu; 2 Saved View WebKit
đạt khi chạy lại sau khi đợi request của document cũ hoàn tất (không bỏ qua
exception). Web production build và 17 unit pass; backend toàn bộ pass.

NEXT-04: API/service/repository và UI Archived riêng module. Restore kiểm tra
team/project/parent, updatedAt và quyền hiện tại; nội dung/relation được giữ,
document ghi actor/version; project restore không tự phục hồi task. Archive
project bị chặn nếu cascade gồm task ngoài quyền. DB regressions và 6/6 E2E
trên ba engine đạt, bao gồm dialog ở 390px. Build/lint/types pass. Không có purge.

AUD-11 thử thật: project `c6wyb59dubbg2x0tucgipjshe`, bug `GEN-9`
(`clbbtlagt7isgjovxqj3bjwrb`) trên API loopback với source thật `e305db7`.
MCP inspect không claim; run `c1jlsc2cb5of2l2chpalc2sga` claim được, gọi Codex CLI
0.154.0 thật (default model gpt-6-astra), nhưng CLI hiệu lực read-only dù truyền
workspace-write. Không có diff/commit/PR, run được ghi FAILED và connection
`ckpsau4xafwzl658m4gjozydz` đã revoke. Ba test local chạy trên source không đổi
không được xem là bằng chứng sửa bug. Checkout và log thử nằm trong `.venv`,
không đưa credential vào Git. Hai probe thật xác nhận model gọi được nhưng
không có quyền ghi. CT107 chưa nghiệm thu: browser đang ở login và chưa có token.

NEXT-08: audit union có cursor và lọc actor/entity/source/UTC, current ACL kể cả
archived, metadata allowlist và export cùng scope. Test 125 sự kiện được đọc /
125 riêng tư, grant/revoke, cursor binding, nguồn không giả mạo và CSV đạt;
MCP/source contracts 35 passed, 10 subtests; document/archive/audit 12 passed.
Audit recovery/filter/load-more/CSV thật 3/3 engine; web production build pass.
Scope lịch sử không chứng minh được bị loại, legacy source là UNKNOWN. Chưa deploy.

NEXT-05: CSV 1–1000 record/2 MB, mapping và lỗi từng dòng, preview 15 phút,
confirm chỉ nhập dòng hợp lệ; request/external key idempotency, duplicate race,
rollback sau domain write, cancel sau một dòng, reference đổi và revoke quyền
đã kiểm tra trên PostgreSQL thật. Kết quả 105 dòng đọc hết qua paging.
Issue CSV dùng chung query/ACL, chặn >10000/10 MB; ZIP document/attachment
đường dẫn theo ID, không fetch URL ngoài, byte budget và quyền hiện tại.
7 focused backend tests và 6/6 E2E ba engine đạt, mobile 390px đã xem ảnh.
91 migrations chạy mới trên flowie_product_20261015, Prisma diff không có khác biệt;
DB cũ giữ nguyên evidence AI. Web build/generate pass. Chưa deploy.

Checkpoint sau NEXT-05: toàn bộ backend 145 passed, 2 optional storage/rehearsal
skipped, 10 subtests. Storage/backup acceptance thật đã có bằng chứng riêng ở AUD-08/09.

NEXT-02: lịch daily/weekly/monthly theo IANA, preview 5 lần, DST fold/gap và
cuối tháng/leap year/date-line skip có test. Row lock + occurrence key và
issue/history/next due commit cùng transaction; run-now replay, concurrent worker,
restart/stale due, rollback, cancel queued, reference đổi, member/manager và revoke
đã kiểm tra. 107 history records phân trang đủ; ba lỗi liên tiếp tự pause.
UI tạo bug thật, sửa mẫu, pause, reload/history: 3/3 engine đạt; đã sửa tên/nút
bị khuất trong ListItem và kiểm tra bounds từng nút tại 390px bằng ảnh + E2E.
Full backend 147 passed, 2 optional skips, 10 subtests; web build/lint/generate pass.
Migration và index riêng do Prisma quản lý; không cấu hình lịch production.

Nền NEXT-03/06: migration lifecycle capture mọi writer vào cùng transaction;
CREATED/CHANGED tách BASELINE của issue cũ tại thời điểm quan sát. Đã sửa việc
gửi lại cùng status làm reset completed/canceled timestamp. Nguồn/actor dùng
transaction-local context, writer chưa gắn nguồn là UNKNOWN; SLA-managed due
được đánh dấu riêng. 36 focused tests + 10 subtests và 2 upgrade/history tests
đạt; test upgrade chạy đúng thứ tự migration, chứng minh baseline không backdate.
94 migrations và Prisma diff đạt. Chưa có SLA consumer/reporting UI ở checkpoint này.

Dependency bảo mật NEXT-03: notification producer/Inbox/snooze/delivery metadata
dùng quyền entity hiện tại, outbox kiểm tra lại record/owner/workspace trước khi
phát realtime. Admin ngoài private team, grant/revoke và revoke sau staging đã test.
33 tests + 10 subtests (notification/MCP), 4 delivery/access/infrastructure tests
đạt (1 optional storage skip). Email vẫn chỉ gửi link chung; không suy ra quyền
Discord từ team membership. SLA alert/worker vẫn đang triển khai ở checkpoint này.

NEXT-03: calendar/holiday/DST, fractional pause, completion boundary, revision
isolation, manual override, explicit reapply, archive/restore/team move và durable
warning/breach/escalation đã hoàn tất. Concurrent workers không tạo trùng;
notification/outbox rollback cùng clock, revoke target bị bỏ qua, failure backoff
8 lần và generation chống lỗi cũ ghi đè edit/retry mới. Báo cáo 152 task dùng
server scope, lịch sử phân trang và mất quyền team cũ không lộ policy metadata.
Upgrade giữ policy BASELINE đúng thời điểm quan sát, không tạo SLA giả cho task cũ.
Toàn bộ backend 156 passed, 2 optional skips, 10 subtests; focused MCP/SLA 34
passed + 10 subtests, bổ sung retry test pass; Prisma 99 migrations không drift.
UI policy/calendar preview, revisions, team report filter và task pause/manual/
reopen/history/recovery: 3/3 engine đạt. Bounds 390px và ảnh calendar/task đã xem;
web production build pass. Năm migration SLA liên tiếp phải chạy trước API;
worker lifespan có heartbeat/lag, chưa deploy CT107 hoặc xác nhận SMTP delivery.

NEXT-06: dashboard chuyển sang server aggregate, định nghĩa current snapshot tách
khỏi period events. Lead/cycle mean/median/P85 chỉ lấy episode có lịch sử đầy đủ;
baseline completed không bị tính thành completion, status aging thiếu entry ghi
unknown, WIP theo local day kèm unknown/future coverage. Workload dùng planned
start week, không giả lập time log/capacity; project dùng quyền hiện tại, kể cả
khi task còn đọc được nhưng project riêng tư. Fixture 153 readable / 150 private,
151 project groups và 105 workload groups; cursor, grant/revoke, restricted
history và DST day bounds đạt. Full backend 158 passed, 2 optional skips,
10 subtests; web build/types và 17 unit pass. Reporting + SLA/Ask/request settings
6/6 E2E trên ba engine đạt, có drilldown, empty/retry, mobile bounds và ảnh đã xem.
Chưa deploy; dashboard dùng migration lifecycle đã commit, không cần DDL bổ sung.

Nền NEXT-07: JWT gắn sid/purpose/issuer/audience, refresh giữ device ID và proof
time, revoke/logout chặn JWT còn hạn; account→session locks chặn refresh replay.
Idle socket revalidate, cookie cũ upgrade và proof cũ không được backdate/freshen
đã test. Inventory/history 107+ mục, current owner, mất workspace vẫn revoke token,
ẩn metadata/hash và legacy issuance 410 đạt; regression MCP/notification 33 tests
+10 subtests và upgrade test đạt. Full backend 159 passed, 1 Operations failure
do >100 heartbeat cũ; đã sửa độc lập (d0f2763), regression 120 stopped rows pass.
Security tabs/device revoke còn hạn/credential revoke/history/retry: 3/3 engine
đạt, ảnh mobile và bounds đã kiểm tra; build/types pass. 100 migrations/schema
diff/generate/validate đạt. Chưa deploy, chưa có MFA enrollment ở checkpoint này.

NEXT-07: MFA TOTP/recovery đã nối cả password và Microsoft callback. Kiểm tra RFC
vectors, mã/counter dùng lại và concurrent challenges, account-bound encryption,
key loss/recovery, giới hạn 5 lần sai, expiry/authVersion, rollback sau session
write, thay recovery, disable và password reset đạt. Microsoft boundary dùng mock,
không tuyên bố tenant thực đã nghiệm thu. UI setup/enable/replay/recovery/disable
3/3 engine đạt; session/history/inventory 3/3 đạt, đã xem ảnh mobile 390px.
Lần đầu selector alert trùng Next announcer đã sửa và chạy lại toàn luồng MFA.
Full backend 164 passed, 2 optional skips, 10 subtests; production web build pass;
101 migrations, schema diff/validate/generate đạt. Key độc lập phải cấu hình ngoài
Git trước enrollment; thiếu key không bỏ qua MFA. Chưa deploy hoặc bật MFA CT107.

NEXT-09 nền preferences: timezone IANA/alias, week start Monday/Sunday/Saturday và
optional self-assignment đã nối calendar/report/create form; bỏ chọn assignee
được giữ khi lưu. Đã sửa dialog tạo việc mount trùng ở sidebar/provider và bổ
sung tên truy cập bộ chọn assignee/nút tạo theo nhóm. API partial-write/version
và client cũ đạt; 20 web unit và production build pass. Hai luồng preference/
đồng bộ thiết bị 6/6 E2E ba engine đạt, ảnh 390px đã kiểm tra. Locale theo module
vẫn đang bổ sung ở checkpoint này; chưa deploy.

## Checkpoint bàn giao cuối — 2026-10-15

NEXT-09: catalogs Anh/Việt đặt cạnh từng feature cho task/bug, comment, tài liệu,
navigation, archive, import/export, recurring, SLA, reports và account security/MFA.
Astryx dùng locale tài khoản cho nhãn trường bắt buộc/control; nội dung người dùng
không bị dịch. Date-only không lệch ngày, relative time phân biệt tương lai/quá khứ,
timezone và quy ước thứ trong tuần được kiểm tra. Không tuyên bố toàn bộ nhãn
settings cũ hoặc thông báo kỹ thuật từ server đã Việt hóa. Xem
[phạm vi preferences/locale](account-time-preferences.md).

AUD-10: ma trận 132 ca trên Chromium/Firefox/WebKit có 125 passed ở lần chạy toàn
bộ. Bảy lỗi còn lại gồm sáu selector theo nhãn mới và một WebKit chuyển trang trước
workspace hydration; không bỏ qua pageerror. Chín ca thuộc ba file liên quan chạy
lại đều passed, bao gồm cả bảy ca đã lỗi. Kiểm tra ảnh mobile còn phát hiện trạng
thái MFA hiển thị cũ ngay sau enable; đã cập nhật cùng kết quả mutation, build lại
và chạy riêng toàn luồng MFA ba engine: 3/3 passed. Ảnh 390px của tài liệu tiếng
Việt, lịch định kỳ và MFA đã xem trực tiếp. Đây là các lần chạy có phạm vi rõ,
không phải tuyên bố một lần chạy cuối 132/132 hoặc đã smoke production.

Cổng local cuối: backend 165 passed, 2 optional storage/rehearsal skips và 10
subtests; web 23 unit passed, production build/lint/types passed; worker build và
Compose app config passed. Prisma 101 migrations trên DB synthetic, schema diff
không drift; từ base main có 13 migration bổ sung. Backend không thay đổi sau
lần kiểm tra toàn bộ cuối. Các kiểm tra MinIO/SMTP và rehearsal restic có bằng
chứng riêng ở trên; các ca skip không được tính thành pass.

AUD-09: đã đề xuất [Backblaze B2/S3](offsite-backup-decision.md), retention 7 daily /
4 weekly / 6 monthly và template credential ngoài Git. Chưa mua/provision tài
khoản/bucket, chưa kiểm kê backup CT107, chưa bật timer hoặc restore off-host thật.

AUD-12: [hồ sơ release](release-evidence-2026-10-15.md) đã đối chiếu PR 1–4 và
workflow đúng merge SHA qua GitHub API chỉ đọc; kế hoạch cũ ghi rõ checkpoint lịch
sử. Build identity và checklist version/deploy/migration/readiness/tag đã có.
LOCAL_VERIFIED của mục này là tài liệu/quy trình; release mới chưa thực hiện.

AUD-11 giữ WAITING_CONFIGURATION: đã tự chọn GEN-9 và chạy CLI thật; quyền hiệu
lực read-only khiến run FAILED, không có diff/commit/PR. Không tính bản sửa locale
do triển khai trực tiếp thành AI acceptance. Cần Codex có quyền ghi và kết nối
Flowie thực để nghiệm thu tiếp; token thử đã revoke.

Tại checkpoint local trước khi được cho phép push, nhánh chưa có PR/CI và chưa
merge/deploy CT107. Trước phát
hành phải review đúng head, xác minh nâng cấp migration và điều kiện backup,
storage/MFA key ngoài Git. API, worker và Web phải nâng cấp cùng contract; Compose
`migrate` hoàn tất trước API/worker. Không tạo tag trước khi đúng release commit
đã deploy và xác minh thành công.

### Review GitHub và sửa CI

Người dùng đã cho phép push nhánh và sửa CI cùng nhánh; [PR nháp 5](https://github.com/hoangtu0812/Flowie/pull/5)
được tạo với head `adba73d`. [Push CI 38739725443](https://github.com/hoangtu0812/Flowie/actions/runs/38739725443)
success với 132/132 E2E; [PR CI 38739794356](https://github.com/hoangtu0812/Flowie/actions/runs/38739794356)
đạt các gate migration/backend/storage/restore/build nhưng E2E 130/132.
Trace cho thấy Chromium mở history trước PUT policy kết thúc, rồi onSaved đóng
history; WebKit hủy request team/notification khi hard-navigation ngay sau login.
Đã chặn history trong lúc edit/list reload và thêm kiểm thử chờ revision đã commit,
chờ workspace hydration; không lọc bỏ pageerror hoặc tăng retry để che lỗi.
Production build/lint/types và 3/3 luồng SLA local sau bản sửa đã đạt.
CI đúng head bản sửa phải đạt trước khi đánh dấu bàn giao review hoàn tất.

Head `c4221f1`: PR CI `38742894796` success toàn bộ; push CI `38742888135` đạt
131/132, Firefox recurring poll đọc count ngay sau refresh khi hook vừa clear
rows. Artifact cuối vẫn hiển thị DONE và issue đã tạo. Kiểm thử chuyển sang chờ
durable run state trong cùng 15 giây, rồi refresh một lần và auto-wait đúng một
dòng DONE trên UI; vẫn kiểm tra đúng một bug và dữ liệu severity, không thêm retry.
Ba engine local sau bản sửa đều đạt; TypeScript và whitespace check đạt.
