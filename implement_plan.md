# Kế hoạch triển khai Circle thành Project Management Platform hoàn chỉnh

> **Chiến lược frontend mới:** đọc [ui_rebase_plan.md](./ui_rebase_plan.md) trước. Baseline trực
> tiếp là clone local `C:\Users\Hoang Tu\Desktop\BSR\1. Source Code\circle` tại commit
> `7785985`. Từ checkpoint `3329f5b`, không tiếp tục vá parity từng điểm; chuyển từng route về
> component gốc và đặt API/mapper trong lớp adapter riêng.

> **Trạng thái bàn giao cập nhật: 2026-08-25**
> Đây là phần phải đọc đầu tiên khi agent khác tiếp tục công việc. Các checkbox trong kế hoạch
> lịch sử phía dưới chưa được dùng làm nguồn trạng thái; bảng kiểm ở phần này mới là trạng thái
> thực tế đã xác minh bằng source, test và Docker.

## Quy ước bắt buộc

1. Baseline giao diện là `upstream/master` của `ln-dev7/circle`.
2. Không thiết kế lại màn hình. Giữ nguyên component tree, khoảng cách, bảng, panel, popover và
   dark/light theme của UI gốc; chỉ thay record mock và action giả bằng API/backend.
3. Chỉ thêm loading/error/empty state hoặc control thật cho tính năng UI gốc chưa có action.
4. `apps/web/mock-data` đã bị xóa. Domain shape nằm trong `types`, còn icon/màu/priority/status
   metadata nằm trong `lib/*-presentations`; không được tái tạo fixture record cho production.
5. Agent và Code Reviews đang cố ý unavailable; không dùng canned response/review fixture.
6. Không có Slack, email và desktop app. Discord là kênh notification/integration đang hỗ trợ.
7. Hoàn thành một lát chức năng phải build/test, rebuild Docker từ cache, commit và push lên
   `origin/codex/foundation`.

## Tiến độ thực tế

### Đã nối backend và giữ cấu trúc UI gốc

- Authentication: register/login/refresh/logout, route protection, profile thật.
- Platform admin: tài khoản bootstrap và giao diện quản trị người dùng/workspace.
- Workspace, Teams, Members: danh sách, tạo/sửa team, thành viên và phân quyền cơ bản.
- Team membership: bảng Teams gốc hiển thị mọi team trong workspace và trạng thái joined thật;
  nút Join gọi API idempotent, còn sidebar/issue/cycle chỉ hiển thị team người dùng đã tham gia.
- Issues: danh sách/group/filter, create/update/archive, status/priority/assignee/label/project/
  cycle/due date, comment/activity, reaction, subscriber, relation/sub-issue, attachment.
- Issue templates: Prisma/API CRUD thật trong đúng màn hình Settings gốc; template được chọn và
  áp dụng vào dialog Create Issue gốc (title, description, status, priority, project, assignee,
  labels).
- Issue context menu: rename, due date, copy, create-related-and-link, convert to document,
  move team, mark completed, subscribe, favorite, reminder và archive đều gọi backend. Khi move,
  backend cấp lại identifier/number, ánh xạ status tương đương và loại liên kết cycle không còn
  hợp lệ. Reminder được xếp lịch qua Redis/BullMQ và Worker tạo notification thật đúng thời điểm.
- Duplicate/Won't Fix trong submenu `Mark as` gốc đã lưu resolution thật; Duplicate bắt buộc trỏ
  tới một issue mà người dùng có quyền xem và cả hai classification chuyển issue sang canceled.
- Issue detail: giữ cột nội dung/sidebar, typography mô tả và hàng sub-issue của UI gốc; relations
  nằm lại trong properties sidebar, nhưng dữ liệu/action đều từ API thật.
- Projects: list/board/timeline, create/update/archive, overview/activity/issues, update, health,
  labels, milestones, templates, statuses, favorite theo user, project settings và resource link
  entity thật được thêm từ chính hàng Resources/nút `+` trong Overview gốc.
- Project Update attachments: nút kẹp giấy trong composer Activity gốc đã upload tối đa 10 MB
  vào MinIO, metadata lưu qua bảng attachment hiện hữu, kiểm tra quyền theo project/team và hiển
  thị link tải trong update card sau khi reload.
- Team Settings: các row General, Templates, Workflows, Triage, Cycles và Team hierarchy trong
  layout gốc đã lưu cấu hình thật; backend kiểm tra template cùng workspace, ngăn hierarchy cycle
  và kiểm tra thứ tự auto-close/auto-archive. Worker quét theo lịch và thực thi hai retention
  policy bằng transaction/idempotent activity + notification thật. Slack/AI vẫn unavailable đúng
  phạm vi.
- Workspace context: mọi loader runtime khớp workspace `slug` trong URL thay vì lấy membership
  đầu tiên; Org Switcher, Inbox/My Issues, Back to app, Project badge và global Create Issue dùng
  workspace/team thật mà không thay composition UI gốc. Logout và chuyển workspace đã hoạt động.
- Account Security: khôi phục bốn section/card của UI gốc; Sessions list IP/browser thật, nhận diện
  current session và revoke session khác. Personal API Key lưu hash/prefix/expiry, secret chỉ trả
  một lần, hỗ trợ revoke và Bearer authentication; không còn record mẫu Paris/iOS/LNDEV key.
- Initiatives: list/detail/create/update/archive, project links, real progress chart, resources,
  updates và activity; update/resource là entity PostgreSQL riêng (không còn mượn AuditLog làm
  storage), dữ liệu cũ được backfill; Settings Initiatives đã thay placeholder bằng CRUD thật.
- Releases: Settings giữ nguyên shell/toolbar/empty-state gốc; list/filter/create/update/archive,
  trạng thái, target date và liên kết nhiều project đều dùng API/PostgreSQL thật với RBAC + audit.
- Customer requests: giữ shell/mô tả/toolbar/empty-state gốc; CRUD thật cho khách hàng, nguồn,
  trạng thái, ưu tiên và liên kết project/issue, có creator permission và audit.
- SLAs: giữ shell/mô tả/toolbar/empty-state gốc; policy theo team/priority, deadline và enabled
  được lưu thật. Khi tạo issue không có due date, backend áp dụng policy khớp cụ thể nhất.
- Asks: giữ shell/mô tả/toolbar/empty-state gốc; request theo team/project/priority được lưu thật
  và action Convert gọi Issue service để tạo issue thật, tiếp tục thừa hưởng SLA/notification.
- Pulse: giữ shell/mô tả/ô lọc/empty-state gốc; feed chỉ đọc được tổng hợp từ Activity và
  Project Update thật theo quyền truy cập team/project, không tạo thêm dữ liệu trùng lặp.
- Emojis: giữ shell/ô lọc/nút Upload/empty-state gốc; metadata lưu theo workspace trong
  PostgreSQL, ảnh riêng tư lưu ở MinIO, kiểm tra byte signature và RBAC OWNER/ADMIN khi upload/xóa.
- Cycles: list/create/issue assignment/document links; burn-up lấy từ `IssueCycle.createdAt`,
  `Issue.completedAt` và trạng thái thật, không còn curve mock.
- Documents: workspace/team list, create/edit/archive; cycle-document link.
- Views, Inbox, My Issues, Member Profile: dữ liệu API thật và cấu trúc UI gốc.
- Notifications/Integrations: inbox thật và Discord webhook; Slack/email/desktop không quảng cáo
  là đã hoạt động.
- Notification preferences: ba checkbox trong popover header gốc được lưu theo user + workspace;
  backend lọc thật các sự kiện issue created/moved, completed/canceled/auto-closed và triage, đồng
  thời ghi audit khi thay đổi. Footer Slack đã được bỏ mà không đổi composition của popover.
- Zero-workspace onboarding: tài khoản đăng nhập nhưng chưa thuộc workspace nào được đưa vào card
  tạo workspace dùng component auth hiện hữu, thay vì bị lặp về login; thứ tự admin/workspace/
  invitation vẫn giữ nguyên.
- UI parity checkpoint: Initiative Detail đã bỏ Edit/X tự thêm và trở lại title/project-row của
  upstream; Project Overview/Peek chỉ render các row có dữ liệu giống baseline. Nút `+` gốc của
  Views và Project Timeline nay mở dialog tạo thật, không thêm toolbar/control mới.
- Team danger zone: nút Leave và Retire trong layout upstream đã gọi backend thật. Self-leave kiểm
  tra active workspace/team membership; retire yêu cầu OWNER/ADMIN, giữ lịch sử bằng `archivedAt`;
  cả hai ghi audit và điều hướng khỏi team sau khi thành công.
- Project Members: entity/quan hệ thành viên dự án đã được lưu riêng trong PostgreSQL; hàng Members
  gốc ở Project Peek/Overview dùng avatar stack hoặc `Add members` như upstream và gọi API thật,
  không còn suy luận sai thành viên dự án từ assignee của issue.
- Issue Activity: API đã trả lại payload JSON được lưu cùng activity; feed chỉ format các event/key
  được whitelist, giữ layout upstream, có fallback an toàn và không render HTML/text tùy ý từ server.
- Team Documents: khôi phục folder `Collapsible`, icon, pin, creator, compact time và hàng header
  đúng upstream; folder/document metadata được lưu PostgreSQL, sort gốc đã hoạt động và Team
  Overview chỉ hiển thị document được pin. Dialog CRUD chỉ xuất hiện sau affordance gốc.
- Rich comments/reactions: comment body dùng document JSON có runtime validation; reaction được
  lưu riêng và toggle/aggregate bằng API. Activity Feed giữ card/reaction row upstream.
- Issue relations: quan hệ lưu hướng `RELATED`/`BLOCKS`, API trả perspective
  `RELATED`/`BLOCKS`/`BLOCKED_BY`; sidebar chỉ render đúng hai row upstream khi có dữ liệu.
- Team deletion: Delete và Retire là hai lifecycle riêng. Delete đặt `deletedAt` + `archivedAt`,
  OWNER/ADMIN có thể restore trong 30 ngày từ trang Join/Create Team; mọi action ghi audit.
- Initiative properties: status, priority, owner, target date và description đã nối PATCH thật
  qua đúng property row; danh sách owner lấy workspace member active.
- Team navigation: Team Projects resolve identifier URL sang database ID; Show empty groups dùng
  toàn bộ team thật. Menu ba chấm chỉ còn Settings/Copy link/Leave và cả ba đã có action thật.
- Project Detail properties: status, priority, lead, target date và description/summary dùng PATCH
  thật qua đúng property row/description region; các tab dùng chung live hook nên cập nhật nhất quán.
- Project Detail dates/team: hai row Dates và Teams vốn có ở sidebar/peek đã nối PATCH thật;
  start/target date có thể đặt hoặc xóa, team có thể chuyển/bỏ sau khi backend xác minh người thao
  tác thuộc team đích.
- Saved Views: description được lưu trong PostgreSQL, API trả avatar creator và row gốc hiển thị
  đúng hai dữ liệu này; dialog tạo view hiện hữu đã lưu description, không thêm toolbar mới.
- Member Profile: project list lấy trực tiếp từ `ProjectMember`, local time lấy timezone IANA của
  User được ghi khi login/register; chấm/trạng thái presence giả đã bị bỏ vì chưa có realtime
  presence backend.
- Team Settings dialogs: các row General, Template, Workflows, Cycles và Hierarchy giữ nguyên vị
  trí/composition nhưng dùng Dialog; Leave/Retire/Delete dùng AlertDialog, không còn prompt,
  confirm hoặc alert native trong màn hình này.
- Issue label parity/no-op cleanup: LabelBadge và nút Plus tròn có border đã trở lại đúng upstream
  trong Issue Detail trong khi action label vẫn gọi API; Inbox bỏ Show snoozed chưa có backend và
  Help bỏ search/keyboard shortcut giả.
- Native dialog cleanup: Account Security/API key, Profile workspace leave, tám Issue Context
  actions, Emoji/Label/Project Template/Saved View deletion đều dùng Dialog/AlertDialog qua đúng
  affordance hiện hữu. Audit toàn `apps/web` không còn `window.prompt/confirm/alert`.
- Team access: row `Access and permissions` gốc lưu join policy OPEN/INVITE_ONLY; API chặn
  workspace member thường tự join team invite-only nhưng vẫn giữ join idempotent cho thành viên
  hiện hữu và quyền quản trị member cho OWNER/ADMIN.
- Fixture cleanup: toàn bộ Issue/Inbox/View/Issue Detail/Document/Initiative/Team/Project/Cycle/User
  seed đã xóa cùng thư mục `apps/web/mock-data`. Domain shape nằm trong `types`; catalog UI nằm
  trong `lib/*-presentations`, sidebar static nằm trong `config`. Component tree/className và SVG,
  màu, thứ tự presentation của UI gốc không thay đổi.
- Docker Compose: Postgres, Redis, MinIO, API, worker, web; dependency layer đã cache nên
  `docker compose up` trong mạng nội bộ không tải lại khi lockfile/image base không đổi.

### Commit checkpoint đã push

- `1ede08b` — restore original project detail interface.
- `787e55c` — restore inbox and member profile interface.
- `8e8f082` — complete initiative activity and real progress.
- `b11c55d` — complete project settings interactions.
- `4d0bb37` — complete cycle progress and documents.
- `fb93014` — replace Documents/Initiatives settings placeholders.
- `3782230` — connect issue context actions.
- `2f525b2` — persist workspace Issue Templates and apply them in Create Issue.
- `aeb03dc` — restore original Issue Detail structure and remove 18 unused simplified UIs.
- `62f1b32` — restore live labels, status/priority presentation and milestone action in Project Peek.
- `9187041` — remove disabled Agent/Reviews fixture trees and other unused mock-only UI.
- `88a7127` — persist workspace Releases in the original Settings shell.
- `0b3f4cd` — persist Customer Requests with real project/issue links.
- `b98022f` — persist and apply workspace SLA policies.
- `33c8763` — persist workspace Asks and convert them to real Issues.
- `fdfe043` — connect the workspace Pulse feed to Activity and Project Update data.
- `761379f` — persist private workspace custom emojis with MinIO.
- `796abde` — persist issue favorites and delayed reminders.
- `620550b` — persist project favorites per user.
- `126f5db` — move issues between teams without changing the original menu.
- `94f5f3e` — persist Duplicate/Won't Fix issue classifications.
- `93e2341` — attach private MinIO files to project updates.
- `9fdca7f` — persist Team workflow settings in the original page.
- `6244e3b` — manage real sessions and personal API keys in the original Security shell.
- `554ff59` — enforce Team auto-close/archive retention policies in the Worker.
- `38ad4af` — resolve every runtime loader against the workspace slug in the current route.
- `05e8595` — isolate notifications by workspace and restore the original settings shells.
- `336a235` — persist team membership state and connect the original Join affordance.
- `0963ec7` — connect issue Move Team command and remove Agent as the default home.
- `03554c1` — persist Initiative updates/resources as first-class workspace entities.
- `0f2b21c` — persist Project resources through the original Overview `+` affordance.
- `fc30bf6` — persist typed Project custom-property values through the original Project Peek `+`.
- `d86d732` — manage Project custom-field definitions in the original Settings list/dialog shell.
- `f404306` — persist workspace Project display defaults through the original Display action.
- `29f868a` — connect the original Project Overview initiative/label `+` affordances to real APIs.
- `233f2ed` — persist workspace Issue display defaults through the original Display action.
- `ece6933` — connect the original Issue command palette Release picker to persisted releases.
- `50c81d2` — generate current/upcoming team cycles from the persisted cadence in the Worker.
- `de3690e` — convert an Issue into a real comment using the original context-menu action.
- `5ab6ac9` — connect workspace defaults/create/leave through existing affordances.
- `67ac9c5` — remove unavailable Agent/Code Review/Desktop/Slack product surfaces.
- `5d67e22` — onboard authenticated accounts that do not have a workspace yet.
- `685b082` — restore upstream Initiative/Project affordances and connect existing create buttons.
- `8f20e5b` — persist inbox notification preferences and enforce them in API/Worker events.
- `8c8fe34` — connect the original Team Leave/Retire buttons with authorization and audit.
- `02839bd` — persist Project Members through the original member affordance.
- `258ab82` — preserve and safely render persisted Issue Activity payloads.
- `64d37be` — restore original Initiatives/Views/Inbox/Settings affordances.
- `5091b2c` — persist Team Document folders, icons, pin and ordering.
- `5922a8c` — block comment and attachment access to retired teams.
- `9a61082` — connect the original Team Members sort affordance to live data.
- `df3828f` — persist rich Issue comments and reactions.
- `f894d97` — persist directional Issue relations.
- `a6ec42f` — add recoverable Team deletion with a 30-day restore window.
- `d90f19b` — restore empty-state Project affordances and remove excluded nav surfaces.
- `82fa916` — connect Initiative properties to live workspace data and PATCH.
- `54c257a` — fix Team Projects identifier resolution and connect Team menu actions.
- `65b1f11` — remove Project Agent/More no-ops and connect Copy link.
- `2dd3f58` — package the contracts workspace in the API runtime image.
- `db61402` — connect Project Detail status, priority, lead, target date and description.
- `acc2d49` — connect Project Detail start/target dates and team assignment.
- `0707979` — restore upstream Issue Labels affordance and remove small visible no-ops.
- `5c9085f` — persist Saved View descriptions and creator avatars.
- `4977e3c` — replace Team Settings native prompts with Dialog/AlertDialog.
- `6e664e2` — load real ProjectMember data and timezone in Member Profile.
- `14e9370` — persist each User's browser timezone through existing authentication flows.
- `eb82f5a` — replace Account Security/Profile native dialogs.
- `7f128fc` — route Issue Context actions through a global persisted-action dialog.
- `33ce636` — replace the remaining Settings/View native confirmations.
- `dd521de` — persist Team open/invite-only join permissions through the original Settings row.
- `a76ee16` — remove Issue/Inbox/View/Issue Detail fixture datasets and keep API-mapped types only.
- `3741752` — remove unused Document/Initiative/Team fixture datasets.
- `df008e0` — move Priority/Status presentation catalogs out of `mock-data`.
- `1452774` — update every workflow presentation import after the catalog move.
- `6497b86` — remove remaining Project/Cycle/User fixtures and the `mock-data` directory.

### Kiểm tra gần nhất

- API Jest: **54 suites, 176 tests passed**, gồm notification preferences, workspace isolation,
  Issue actions, Project attachment, Team settings, Personal API Key và Bearer guard.
- NestJS build: passed.
- Next.js 15 production build: passed.
- Worker production build và unit test cadence/Team policy: **7/7 passed**; runtime scan kết nối Redis và
  trả `0 teams, 0 closed, 0 archived` vì database hiện chưa bật retention policy cho team nào.
- Docker `api` và `web`: rebuilt; `http://localhost:4000/api/v1/health` và
  `http://localhost:3000/auth/login` trả HTTP 200.
- Migration `20260824180000_issue_templates` đã được apply trong Postgres Docker.
- Migration `20260824190000_releases` đã được apply; bảng `releases` và `release_projects` đã được
  xác minh trực tiếp trong Postgres Docker.
- Migration `20260824200000_customer_requests` đã được apply và bảng `customer_requests` đã được
  xác minh trực tiếp trong Postgres Docker.
- Migration `20260824210000_sla_policies` đã được apply và bảng `sla_policies` đã được xác minh
  trực tiếp trong Postgres Docker.
- Migration `20260824220000_asks` đã được apply và bảng `asks` đã được xác minh trực tiếp trong
  Postgres Docker.
- Migration `20260824230000_workspace_emojis` đã được apply và bảng `workspace_emojis` đã được
  xác minh trực tiếp trong Postgres Docker.
- Migration `20260824240000_issue_favorites_reminders` đã được apply; hai bảng
  `issue_favorites`/`issue_reminders`, bốn route và Worker kết nối Redis đã được xác minh.
- Migration `20260824250000_project_favorites` đã được apply; bảng `project_favorites` và hai
  route favorite/unfavorite đã được xác minh trực tiếp.
- Migration `20260824260000_issue_resolutions` đã được apply; enum resolution, self-reference
  duplicate target và route classification đã được xác minh trực tiếp.
- Migration `20260824270000_team_workflow_settings` đã được apply; sáu cột preference, hai foreign
  key và các index đã được xác minh trực tiếp trong PostgreSQL Docker.
- Migration `20260824280000_personal_api_keys` đã được apply; bảng/key index và sáu route
  session/API-key đã được xác minh trong Docker.
- Migration `20260824290000_notification_workspaces` đã được apply; notification được backfill,
  bắt buộc có workspace FK và toàn bộ list/read/delete được authorize + filter theo workspace.
- Migration `20260824300000_initiative_updates_resources` đã được apply; update/resource Initiative
  được backfill từ audit metadata sang hai bảng có workspace/initiative/user FK riêng.
- Migration `20260824310000_project_resources` đã được apply; bảng resource có workspace/project/
  creator FK và route tạo resource đã được kiểm tra bằng unit test + Docker runtime.
- Migration `20260824350000_workspace_issue_insight_defaults` và
  `20260824360000_notification_preferences` đã apply; bảng notification preference được xác minh
  trực tiếp trong PostgreSQL Docker.
- Project custom properties dùng schema sẵn có; hai route đọc/lưu giá trị kiểm tra quyền project,
  workspace ownership, kiểu TEXT/NUMBER/DATE/SELECT/MULTI_SELECT/BOOLEAN/URL và ghi Activity.
  Nút `+` trong card Properties của Project Peek gốc đã được bật, không thay layout khi chưa có
  custom field. Settings Projects/Properties quản trị định nghĩa field thật bằng shell/list/dialog
  gốc. Unit test validation/service mới **5/5 passed**; API/web/worker build và Docker API/web đều
  passed.
- Project Overview giữ nguyên Properties rows gốc; dấu `+` Initiative và Label đã gọi API quan hệ
  thật, hỗ trợ liên kết/gỡ liên kết và không thêm row khi workspace chưa có Initiative.
- Project và Issue Display defaults đều lưu JSONB theo workspace, chỉ OWNER/ADMIN được PATCH,
  member được GET, có DTO validation và audit. Migration
  `20260824320000_workspace_project_display_defaults` và
  `20260824330000_workspace_issue_display_defaults` đã apply/xác minh trực tiếp trong PostgreSQL.
  Test Issue defaults **6/6 passed**, API/Next production build và Docker API/web đều passed; các
  lớp cài dependency trong Docker đều dùng cache.
- Issue–Release dùng bảng liên kết PostgreSQL riêng; Issue options/list trả release thật và dòng
  `Add to release…` trong Command Palette gốc hỗ trợ liên kết/gỡ nhiều release atomically. Migration
  `20260824340000_issue_releases` đã apply/xác minh; test DTO/service **7/7 passed**.
- Worker đã thực thi `cycleCadenceWeeks`: tự tạo current/upcoming cycle, activate/complete theo UTC,
  idempotent khi scan lặp và ghi audit cho cycle được sinh. Cả cadence + retention test **6/6 passed**;
  runtime scan kết nối Redis thành công. Build kế tiếp đã xác nhận `pnpm install` là `CACHED`.
- `Convert into → Comment` trong context menu gốc tạo comment trên issue đích, ghi activity cho cả
  hai issue và archive issue nguồn trong một transaction; kiểm tra quyền trên cả nguồn/đích và cấm
  tự-convert. DTO/service test **5/5 passed**, API/web Docker trả HTTP 200.
- Audit frontend đã đối chiếu **308 file baseline** trong `app/components/hooks/lib/store` với
  `upstream/master`. Đã xóa 18 component `real-*` rút gọn không còn route nào dùng; runtime chỉ
  còn cây component gốc được nối API.
- Docker dependency install dùng cache; không tải package mới trong các checkpoint trên.
- Docker API/Web/Worker đã rebuild sau khi workspace contracts được thêm. Dependency layer bị
  invalidation một lần và tải trên 5G; build API kế tiếp đã xác nhận toàn bộ install/build layer
  `CACHED`. API runtime thiếu contracts đã được phát hiện bằng health check, sửa tại `2dd3f58`,
  sau đó API health và Web login đều trả HTTP 200.
- Ba migration `20260824390000_comment_bodies_reactions`,
  `20260824400000_issue_relation_types`, `20260824410000_team_soft_deletion` đã apply và xác minh
  trực tiếp trong PostgreSQL Docker; cột `teams.deleted_at` tồn tại.
- Migration `20260824370000_project_members` đã apply; bảng `project_members` được xác minh trực tiếp
  trong PostgreSQL Docker. API/web production build, Docker API/web và HTTP health/login đều pass.
- Project Members và Issue Activity đã được push lên `origin/codex/foundation` tại `258ab82`.
- Migration `20260824380000_team_document_folders` thêm folder/icon/pin/position và backfill ổn định;
  Prisma generate/format, toàn bộ API test/build và web lint/production build đều pass. Feature đã
  được push tại `5091b2c`; dependency graph không thay đổi.
- Comment/attachment authorization đã đồng bộ với lifecycle Team: issue/project/document thuộc
  team đã retire không còn đọc/ghi/upload được qua API trực tiếp; targeted Jest **4/4 passed**.
- Docker API/Web đã rebuild với dependency install layer `CACHED`; migration Team Documents apply,
  `document_folders` tồn tại và API health/Web login đều trả HTTP 200.
- Docker API/Web đã rebuild sau checkpoint `14e9370`; toàn bộ lớp `pnpm install` dùng cache. Hai
  migration `20260825000000_saved_view_descriptions` và `20260825010000_user_timezones` đã apply,
  cột `saved_views.description` nullable và `users.timezone` NOT NULL/default UTC được xác minh
  trực tiếp; API health và Web login cùng trả HTTP 200.
- Migration `20260825020000_team_join_policy` đã apply; enum/cột NOT NULL/default OPEN và bản ghi
  migration được xác minh trực tiếp. Docker API/Web rebuild với install layer `CACHED`; health và
  login cùng HTTP 200. Targeted Team test 15/15, toàn bộ API test 54 suite/176 test passed.
- Production build sau khi xóa Issue fixture passed; bảy dataset seed giả không còn consumer đã
  xóa tổng cộng hơn 5.000 dòng mà không đổi component markup/className.
- Production build và Docker Web rebuild sau khi xóa fixture còn lại passed; install layer
  `CACHED`, Web login HTTP 200. `rg` xác nhận không còn chuỗi `mock-data` trong TypeScript/TSX và
  thư mục `apps/web/mock-data` không còn tồn tại.
- Script `scripts/start-local.ps1` dùng `--no-build --pull never`, nên khởi động từ image hiện có
  chạy được trong mạng nội bộ. Rebuild web vẫn có thể cần internet vì baseline dùng
  `next/font/google`; lần build gần nhất retry TLS rồi thành công trên 5G, không phải cài package.
- Audit runtime mới nhất không còn route dùng `SettingsPlaceholder` và không còn import mảng
  record nghiệp vụ mock; các import từ `mock-data` chỉ còn type hoặc catalog icon/màu/status.
- Host hiện đã chạy được Jest/Prettier từ dependency cache. Prisma generate trên mạng nội bộ cần
  trỏ `PRISMA_SCHEMA_ENGINE_BINARY` tới binary đã cache để tránh checksum download; không cần cài
  thêm package. Docker build vẫn là kiểm chứng dependency graph chính thức.

## Phần chưa hoàn thành — không được đánh dấu là đã triển khai

| Ưu tiên | Phần còn lại | Trạng thái/chỉ dẫn |
| --- | --- | --- |
| P0 | Visual parity toàn route | Source parity đã khôi phục Initiative Detail, Project Overview/Peek, Views và Project Timeline; notification popover giữ layout gốc. Visual acceptance từng route vẫn cần phiên workspace-member trong in-app browser; phiên sạch hiện chỉ xác nhận guard/login. |
| P0 | Notifications đa workspace | Hoàn thành: notification có workspace FK, API/store scope đúng workspace và preview xử lý cả issue/project thật. |
| P0 | Settings Notifications/Integrations | Hoàn thành: shell/card/search gốc được giữ lại; Discord dùng row/dialog thật, không quảng cáo Slack/email/desktop. |
| P0 | Team membership | Hoàn thành: API trả all team + membership thật, self-join idempotent; join policy OPEN/INVITE_ONLY được persist và chặn self-join trái quyền mà không đổi bảng/nút gốc. |
| P0 | Visible issue command no-op | Hoàn thành trong phạm vi project-management: Move Team, Release picker, labels/project/cycle/due date và Agent default đều đã dùng dữ liệu thật hoặc bị loại khỏi default. Code Reviews vẫn unavailable theo phạm vi. |
| P1 | Issue actions còn thiếu | Hoàn thành: Convert-to-comment, Duplicate/Won't Fix, move team, favorite và reminder đều có backend. Taxonomy issue type không có control tương ứng trong UI gốc hiện tại. |
| P1 | Team settings nâng cao | Hoàn thành: cadence, triage, auto-close/archive, hierarchy và template default đều persistence/UI; Worker tự sinh cycle và thực thi retention policy. |
| P1 | Account security | Session management và Personal API Key đã hoàn thành. Passkeys cần WebAuthn dependency/RP configuration; signing key không có consumer và lệch phạm vi project-management nên vẫn unavailable. |
| P1 | Project extras | Hoàn thành: favorite, Update attachment, resource, typed custom-property values/definitions, workspace Display defaults và affordance Initiative/Label trong Overview đều dùng dữ liệu thật mà giữ layout gốc. |
| P1 | Issue display/insights | Workspace Display defaults đã hoàn thành. Footer `Set default for everyone` trong Insights vẫn là visible no-op; cần persistence cho cấu hình analytics trước khi bật. |
| P1 | Team danger zone | Hoàn thành: Leave, Retire và Delete là ba action riêng; Delete có soft-delete + restore 30 ngày và chỉ OWNER/ADMIN được thao tác. Permanent purge job sau ngày 30 vẫn là hardening P2 vì cần xóa object MinIO an toàn. |
| P1 | Project/member/detail parity | Hoàn thành: ProjectMember, rich comment/reaction, directional relation và Project Detail status/priority/lead/start/target/team/description đều dùng backend thật qua UI gốc. |
| P1 | Team documents | Hoàn thành: folder/icon/pin/position, CRUD, sort và Overview pinned dùng backend thật trong component tree upstream. |
| P1 | Saved Views parity | Hoàn thành: description/avatar creator được persist/mapping và hiển thị trong row gốc. |
| P1 | Member Profile parity | Project membership và timezone cá nhân đã dùng backend thật; presence giả bị bỏ. Realtime presence chỉ triển khai khi có transport/heartbeat thật. |
| P1 | Native browser dialogs | Hoàn thành: audit `apps/web` không còn `window.prompt`, `window.confirm` hoặc `window.alert`; mutation vẫn đi qua API/backend hiện hữu. |
| P1 | Fixture cleanup | Hoàn thành: toàn bộ fixture dataset và thư mục `apps/web/mock-data` đã xóa; domain type/presentation/config được tách đúng trách nhiệm, production build + Docker Web passed. |
| P1 | Visible no-op còn lại | Inbox snoozed, Help giả và Team access no-op đã xử lý. Label groups/recurring issue, một số Preferences/Passkeys/Sub-grouping vẫn disabled hoặc unavailable; chỉ bật khi schema/service thật tồn tại, nếu ngoài phạm vi thì ẩn. |
| P2 | Automation/webhook | Worker/Redis foundation có, nhưng rule builder, persisted automation và generic webhook chưa hoàn chỉnh. |
| P2 | OAuth/enterprise identity | Google, Microsoft Entra, OIDC/SAML chưa triển khai; local email/password đang hoạt động. |
| Excluded | AI Agent, Code Reviews | Cố ý unavailable theo phạm vi sản phẩm hiện tại; fixture/canned-response cũ đã được xóa khỏi source. |

## Thứ tự tiếp tục đề xuất

1. Quyết định semantics/persistence cho footer `Set default for everyone` trong Insights; hiện các
   selector analytics chỉ có một lựa chọn nên lưu cấu hình chưa mang thêm giá trị.
2. Audit các control disabled còn lại: tách rõ điều kiện hợp lệ, tính năng cố ý
   excluded và no-op.
3. Đăng nhập sẵn một phiên workspace-member trong in-app browser rồi chụp đối chiếu từng route
   chính với `upstream/master`; browser sạch hiện xác nhận route guard/login và console không lỗi.

## 1. Mục tiêu

Phát triển từ repository:

`ln-dev7/circle`

thành một hệ thống Project Management hoàn chỉnh có thể:

- [ ] Đăng ký tài khoản
- [ ] Đăng nhập bằng email/password
- [ ] Đăng nhập Google
- [ ] Đăng nhập Microsoft Entra ID / Azure AD
- [ ] Quản lý user
- [ ] Quản lý Organization/Workspace
- [ ] Quản lý team
- [ ] Quản lý project
- [ ] Quản lý issue/task
- [ ] Quản lý cycle/sprint
- [ ] Bình luận, mention, activity
- [ ] Notification
- [ ] File attachment
- [ ] RBAC/permission
- [ ] Audit log
- [ ] API token
- [ ] Webhook
- [ ] Automation
- [ ] SSO doanh nghiệp
- [ ] AI Agent sau này
- [ ] Self-host bằng Docker/Kubernetes

Mục tiêu đầu tiên:

> Giữ nguyên tối đa UI hiện tại của Circle và thay toàn bộ mock-data bằng dữ liệu/API thật.

---

# 2. Kiến trúc repository

Chuyển repository sang monorepo.

```text
circle/
│
├── apps/
│   ├── web/
│   │   └── Next.js - Circle hiện tại
│   │
│   ├── api/
│   │   └── NestJS
│   │
│   └── worker/
│       └── background jobs
│
├── packages/
│   ├── database/
│   ├── contracts/
│   ├── auth/
│   ├── permissions/
│   ├── events/
│   ├── sdk/
│   └── config/
│
├── infrastructure/
│   ├── docker/
│   └── kubernetes/
│
├── docker-compose.yml
│
└── pnpm-workspace.yaml
```

Không sửa UI Circle nhiều trong giai đoạn đầu.

Frontend hiện tại được chuyển vào:

```text
apps/web
```

Backend mới:

```text
apps/api
```

---

# 3. Các service cơ bản

Ban đầu KHÔNG xây microservice.

Dùng modular monolith:

```text
NestJS
│
├── AuthModule
├── UserModule
├── OrganizationModule
├── WorkspaceModule
├── MembershipModule
├── TeamModule
├── ProjectModule
├── IssueModule
├── CycleModule
├── CommentModule
├── NotificationModule
├── ActivityModule
├── FileModule
├── SearchModule
├── AuditModule
├── IntegrationModule
└── AutomationModule
```

Tất cả chạy trong một backend.

Sau này module nào thực sự cần scale mới tách service.

---

# PHASE 0 — Foundation

## 4. Chuẩn hóa project

- [ ] Chuyển Circle thành pnpm monorepo
- [ ] Tạo `apps/web`
- [ ] Tạo `apps/api`
- [ ] Tạo `apps/worker`
- [ ] Thiết lập shared TypeScript config
- [ ] Thiết lập ESLint/Prettier
- [ ] `.env.example`
- [ ] Docker Compose
- [ ] PostgreSQL
- [ ] Redis
- [ ] MinIO local
- [ ] Health check
- [ ] API versioning `/api/v1`
- [ ] Swagger/OpenAPI

Local environment:

```text
localhost:3000
Circle Web

localhost:4000
NestJS API

localhost:5432
PostgreSQL

localhost:6379
Redis

localhost:9000
MinIO
```

---

# PHASE 1 — Authentication & User Management

Đây nên là phase đầu tiên thực sự implement.

## 5. User model

Tạo:

```text
users

id
email
name
username
avatar_url

password_hash

email_verified_at

status
created_at
updated_at
last_login_at
```

Status:

```text
ACTIVE
INVITED
SUSPENDED
DISABLED
```

Không gắn role trực tiếp vào `users`.

Role sẽ phụ thuộc Workspace.

---

# 6. Identity model

Để hỗ trợ nhiều phương thức đăng nhập:

```text
user_identities

id
user_id

provider
provider_account_id

email

created_at
updated_at
```

Provider:

```text
LOCAL
GOOGLE
MICROSOFT
OIDC
SAML
```

Ví dụ một user:

```text
User
│
├── LOCAL
│   └── user@gmail.com
│
├── GOOGLE
│   └── google-account-id
│
└── MICROSOFT
    └── entra-object-id
```

Điều này cho phép:

> Một tài khoản Circle có thể đăng nhập bằng cả password, Google và Microsoft.

---

# 7. Registration

Implement:

```text
POST /auth/register
```

Input:

```json
{
  "email": "user@example.com",
  "password": "...",
  "name": "User Name"
}
```

Flow:

```text
Register
   ↓
validate email
   ↓
check existing user
   ↓
hash password
   ↓
create user
   ↓
send verification email
   ↓
verify email
   ↓
create first workspace
```

UI cần thêm:

```text
/auth/register
```

Fields:

- [ ] Name
- [ ] Email
- [ ] Password
- [ ] Confirm password
- [ ] Google login
- [ ] Microsoft login

---

# 8. Login bằng Email/Password

Endpoint:

```text
POST /auth/login
POST /auth/logout
POST /auth/refresh
```

Khuyến nghị:

```text
Access token
~15 phút

Refresh token
~30 ngày
```

Refresh token:

- [ ] rotate mỗi lần sử dụng
- [ ] lưu hash trong database
- [ ] revoke được
- [ ] lưu device/session
- [ ] support logout all devices

Không lưu access token trong localStorage.

Ưu tiên:

```text
Secure
HttpOnly
SameSite cookie
```

---

# 9. Session Management

Database:

```text
sessions

id
user_id

refresh_token_hash

ip_address
user_agent

expires_at
revoked_at

created_at
last_used_at
```

Trang:

```text
Settings
→ Security
→ Sessions
```

Hiển thị:

```text
Edge - Windows
Ho Chi Minh City
Active now

Chrome - MacOS
2 days ago
```

Cho phép:

- [ ] Logout session
- [ ] Logout tất cả devices

---

# 10. Forgot Password

Implement:

```text
POST /auth/forgot-password

POST /auth/reset-password
```

Table:

```text
password_reset_tokens
```

Token:

- [ ] random
- [ ] single-use
- [ ] expiry
- [ ] lưu hash thay vì plaintext

UI:

```text
/auth/forgot-password
/auth/reset-password
```

---

# 11. Email verification

Implement:

```text
POST /auth/verify-email
POST /auth/resend-verification
```

Email phải verify trước khi:

```text
invite member
create API token
configure SSO
```

---

# PHASE 2 — Google & Microsoft SSO

## 12. Google Login

Sử dụng:

```text
OpenID Connect
OAuth 2.0 Authorization Code Flow
```

UI:

```text
Continue with Google
```

Backend:

```text
GET /auth/google
GET /auth/google/callback
```

Sau callback:

```text
Google
   ↓
validate ID token
   ↓
read identity
   ↓
find provider identity
   │
   ├── found
   │      ↓
   │     login
   │
   └── not found
          ↓
       match verified email
          ↓
       link account/create user
```

---

# 13. Microsoft Entra ID / Azure AD

Support ngay từ đầu:

```text
Continue with Microsoft
```

Protocol:

```text
OIDC
OAuth 2.0
Authorization Code Flow
```

Backend:

```text
GET /auth/microsoft
GET /auth/microsoft/callback
```

Không phụ thuộc Microsoft Graph chỉ để đăng nhập.

Các claim ban đầu chỉ cần:

```text
sub
email
name
preferred_username
tenant ID
```

Lưu:

```text
provider = MICROSOFT
provider_account_id
tenant_id
```

---

# 14. Hai loại Microsoft login

Cần phân biệt.

### Personal/social login

Ví dụ:

```text
user@outlook.com
```

### Enterprise SSO

Ví dụ công ty:

```text
employee@company.com
```

thuộc Microsoft Entra tenant:

```text
company.onmicrosoft.com
```

Hai trường hợp có thể dùng cùng protocol nhưng logic Workspace khác nhau.

---

# PHASE 3 — Organization & Workspace

## 15. Domain hierarchy

Dùng:

```text
Organization
      │
      └── Workspace
              │
              ├── Teams
              ├── Projects
              ├── Issues
              └── Members
```

Không nên để `orgId` hiện tại của Circle chỉ là slug giả nữa.

---

# 16. Organization

Table:

```text
organizations

id
name
slug
logo_url
owner_id

created_at
updated_at
```

---

# 17. Workspace

```text
workspaces

id
organization_id

name
slug
description

timezone

created_at
updated_at
```

URL hiện tại:

```text
/[orgId]/...
```

có thể dần chuyển thành:

```text
/[workspaceSlug]/...
```

Ví dụ:

```text
/acme/
```

---

# 18. Workspace member

```text
workspace_members

id
workspace_id
user_id

role_id

status

joined_at
invited_by
```

Status:

```text
INVITED
ACTIVE
SUSPENDED
```

---

# PHASE 4 — User Administration

## 19. Admin UI

Circle hiện đã có Members/Settings UI, tận dụng lại.

Thêm:

```text
Settings
  └── Members
```

Admin có thể:

- [ ] xem users
- [ ] tìm user
- [ ] filter theo role
- [ ] filter active/invited
- [ ] invite user
- [ ] resend invite
- [ ] change role
- [ ] suspend
- [ ] reactivate
- [ ] remove
- [ ] transfer ownership

---

# 20. Invitation

Endpoint:

```text
POST /workspaces/:id/invitations
```

Flow:

```text
Admin enters email
       ↓
create invitation
       ↓
send email
       ↓
user clicks invite
       ↓
existing account?
   ↙             ↘
yes              no
 ↓                ↓
login           register
   ↘             ↙
    join workspace
```

Table:

```text
workspace_invitations

id
workspace_id
email

role_id

token_hash

expires_at
accepted_at

invited_by
```

---

# PHASE 5 — RBAC

Không hard-code:

```text
if (user.role === 'admin')
```

## 21. Permission model

```text
roles

id
workspace_id
name
is_system
```

```text
permissions

id
code
```

```text
role_permissions

role_id
permission_id
```

System roles:

```text
Owner
Admin
Member
Guest
```

---

# 22. Permissions

Ví dụ:

```text
workspace.read
workspace.update
workspace.delete

member.read
member.invite
member.update
member.remove

team.create
team.update
team.delete

project.create
project.read
project.update
project.delete

issue.create
issue.read
issue.update
issue.delete

cycle.create
cycle.update
cycle.delete

audit.read

integration.manage

sso.manage
```

Frontend chỉ dùng permission để hide/disable UI.

Backend mới là nơi enforce permission thực sự.

---

# PHASE 6 — Teams

Circle đã có UI Teams.

Thay mock-data bằng:

```text
GET    /teams
POST   /teams

GET    /teams/:id
PATCH  /teams/:id
DELETE /teams/:id
```

Data:

```text
teams

id
workspace_id

name
identifier
description

icon
color

created_at
updated_at
```

Example:

```text
Engineering
identifier = ENG

Backend
identifier = BE
```

---

# 23. Team Membership

```text
team_members

team_id
user_id

role
```

Team role có thể:

```text
LEAD
MEMBER
```

---

# PHASE 7 — Project Management

Circle đã có Projects UI khá hoàn chỉnh.

## 24. Project

```text
projects

id
workspace_id
team_id

name
identifier
description

status
priority

lead_id

start_date
target_date

created_at
updated_at
archived_at
```

Endpoints:

```text
GET    /projects
POST   /projects

GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id

POST /projects/:id/archive
```

---

# PHASE 8 — Issue Management

Đây là module quan trọng nhất.

Circle hiện có gần 300 fake issues và tất cả CRUD issue đã funnel qua Zustand issue store.

Do đó đây là module nên migrate đầu tiên sau auth/workspace.

## 25. Issue schema

```text
issues

id
workspace_id
team_id
project_id

identifier
sequence_id

title
description

status_id
priority

creator_id

parent_id

estimate

start_date
due_date

rank

created_at
updated_at
completed_at
archived_at
```

Identifier:

```text
ENG-1
ENG-2
ENG-3
```

---

# 26. Issue API

```text
GET    /issues

POST   /issues

GET    /issues/:id

PATCH  /issues/:id

DELETE /issues/:id
```

Filters:

```text
?team=
?project=
?status=
?priority=
?assignee=
?label=
?cycle=
?search=
```

---

# 27. Assignee

Support nhiều assignee ngay từ database:

```text
issue_assignees

issue_id
user_id
```

Dù UI ban đầu chỉ cần một người.

---

# 28. Labels

```text
labels

id
workspace_id
name
color
```

```text
issue_labels

issue_id
label_id
```

---

# PHASE 9 — Workflow / Status

Circle hiện đã có nhiều status categories.

Giữ concept:

```text
Triage
Backlog
Unstarted
Started
Completed
Canceled
```

Nhưng status phải nằm database.

```text
issue_statuses

id
workspace_id
team_id

name

category

color
icon

position
```

Ví dụ:

```text
category = STARTED

statuses:

In Progress
Code Review
QA
```

---

# PHASE 10 — Cycles / Sprint

Circle đã có:

```text
active cycle
upcoming cycle
cycles timeline
burn-up chart
```

Backend:

```text
cycles

id
team_id

name
description

start_date
end_date

status
```

Relations:

```text
issue_cycles

issue_id
cycle_id
```

Functions:

- [ ] create cycle
- [ ] upcoming cycle
- [ ] active cycle
- [ ] move issue to cycle
- [ ] remove issue
- [ ] calculate burn-up
- [ ] calculate scope
- [ ] calculate completed issues

---

# PHASE 11 — Comments & Activity

## 29. Comments

```text
comments

id
issue_id
author_id

content

created_at
updated_at
deleted_at
```

Support:

- [ ] Markdown / rich text
- [ ] edit
- [ ] delete
- [ ] mention
- [ ] attachment

---

# 30. Activity

Không tự tạo activity bằng frontend.

Backend sinh Domain Event:

```text
issue.created

issue.updated

issue.status_changed

issue.assigned

comment.created
```

Ví dụ:

```json
{
  "type": "issue.status_changed",
  "actorId": "...",
  "entityId": "...",
  "data": {
    "from": "Todo",
    "to": "In Progress"
  }
}
```

---

# PHASE 12 — Notification

Circle đã có notifications store/UI.

Thay bằng backend.

```text
notifications

id
user_id

type

entity_type
entity_id

data

read_at

created_at
```

Notification khi:

```text
assigned issue
mentioned
comment added
project update
cycle changed
invitation
```

---

# PHASE 13 — Real-time

Sau khi notification/activity hoạt động:

```text
WebSocket
```

hoặc:

```text
Server-Sent Events
```

Các event:

```text
issue.created
issue.updated
issue.deleted

comment.created

notification.created

project.updated
```

Hai browser đang mở cùng project phải thấy thay đổi gần như ngay lập tức.

---

# PHASE 14 — Attachments

Storage abstraction:

```text
StorageService
```

Providers:

```text
MinIO
AWS S3
Azure Blob
```

Table:

```text
attachments

id

workspace_id
uploaded_by

object_key
filename
mime_type
size

created_at
```

Cho phép file gắn với:

```text
Issue
Comment
Project
Document
```

---

# PHASE 15 — Search

Ban đầu dùng PostgreSQL.

Search:

```text
issues
projects
members
comments
documents
```

API:

```text
GET /search?q=authentication
```

Sau này mới cân nhắc:

```text
Meilisearch
OpenSearch
Elasticsearch
```

Không cần ngay MVP.

---

# PHASE 16 — Saved Views

Circle hiện đã có filter/sort URL state rất tốt.

Thêm ability lưu nó.

```text
views

id
workspace_id
owner_id

name

filters JSONB
sorting JSONB
display JSONB

visibility
```

Ví dụ:

```text
My bugs

High priority issues

Backend backlog

Release blockers
```

Visibility:

```text
PRIVATE
TEAM
WORKSPACE
```

---

# PHASE 17 — Documents

Circle có UI documents.

Implement:

```text
documents

id
workspace_id
team_id

title
content

created_by
updated_by

created_at
updated_at
```

Editor nên sử dụng:

```text
TipTap
```

hoặc editor block-based tương đương.

---

# PHASE 18 — Audit Log

Đây là enterprise foundation.

```text
audit_logs

id
workspace_id

actor_id

action

entity_type
entity_id

before JSONB
after JSONB

ip_address
user_agent

created_at
```

Ví dụ:

```text
USER_INVITED
USER_REMOVED

PROJECT_DELETED

ISSUE_UPDATED

ROLE_CHANGED

SSO_CONFIG_UPDATED
```

Không cho user sửa audit log.

---

# PHASE 19 — Enterprise SSO

Sau khi Google/Microsoft social login hoạt động, mới xây Workspace SSO.

## 31. SSO configuration

```text
sso_configurations

id
workspace_id

provider

enabled

issuer
client_id
encrypted_client_secret

tenant_id

allowed_domains

enforce_sso

created_at
updated_at
```

---

# 32. Azure AD / Entra SSO

Admin vào:

```text
Settings
→ Security
→ SSO
```

Chọn:

```text
Microsoft Entra ID
```

Nhập:

```text
Tenant ID
Client ID
Client Secret
Allowed domain
```

Ví dụ:

```text
Tenant:
xxxxxxxx-xxxx-xxxx

Domain:
company.com
```

---

# 33. Workspace-aware SSO

Ví dụ user truy cập:

```text
circle.company.com
```

hoặc:

```text
/company
```

Backend biết workspace yêu cầu:

```text
Entra ID
```

Flow:

```text
/company
   ↓
workspace lookup
   ↓
SSO enforced?
   ↓
Entra redirect
   ↓
Microsoft login
   ↓
callback
   ↓
validate tenant
   ↓
validate domain
   ↓
find/provision user
   ↓
workspace access
```

---

# 34. Just-In-Time Provisioning

Nếu enterprise bật:

```text
JIT provisioning
```

thì:

```text
first SSO login
      ↓
create Circle user
      ↓
create membership
      ↓
assign default role
```

Không cần admin invite từng nhân viên.

---

# 35. Domain verification

Không cho workspace đơn giản nhập:

```text
google.com
```

rồi claim domain.

Cần:

```text
workspace_domains
```

```text
id
workspace_id

domain

verified_at

verification_token
```

Có thể verify bằng:

```text
DNS TXT
```

---

# PHASE 20 — API Keys

Personal API token:

```text
api_tokens

id
user_id

name
token_hash

scopes

last_used_at
expires_at
```

Endpoint:

```text
Settings
→ API
```

Scopes:

```text
issues:read
issues:write

projects:read

users:read
```

---

# PHASE 21 — Webhooks

```text
webhooks

id
workspace_id

url
secret

events

enabled
```

Events:

```text
issue.created
issue.updated
issue.deleted

project.created

comment.created
```

Worker chịu trách nhiệm delivery + retry.

---

# PHASE 22 — Background Worker

BullMQ + Redis.

Jobs:

```text
EmailJob

NotificationJob

WebhookJob

FileProcessingJob

ImportJob

ExportJob

AutomationJob
```

Không gửi email/webhook trực tiếp trong HTTP request.

---

# PHASE 23 — Automation Engine

Concept:

```text
WHEN
   event

IF
   conditions

THEN
   actions
```

Ví dụ:

```text
WHEN issue.created

IF priority = urgent

THEN
assign Team Lead

AND
send notification
```

Database:

```text
automations

automation_triggers

automation_conditions

automation_actions
```

---

# PHASE 24 — Analytics

Sau khi dữ liệu thật đủ lớn.

Dashboard:

```text
Issues created

Issues completed

Cycle velocity

Lead time

Cycle time

Overdue issues

Workload by member

Workload by project
```

Không lưu số liệu chart fake nữa.

Backend tính từ dữ liệu thực tế.

---

# PHASE 25 — AI Agent

Circle đã có frontend Agent Chat.

Sau này biến thành chức năng thật.

Tools:

```text
searchIssues()

getIssue()

createIssue()

updateIssue()

getProject()

searchProjects()

getCycle()

createCycle()

getWorkspaceAnalytics()
```

User hỏi:

```text
"Liệt kê các task overdue của backend."
```

Agent:

```text
searchIssues({
   team: 'backend',
   overdue: true
})
```

---

# PHASE 26 — Security

Trước production cần:

- [ ] Argon2id password hashing
- [ ] rate limiting
- [ ] CSRF protection
- [ ] CORS policy
- [ ] CSP
- [ ] refresh-token rotation
- [ ] session revocation
- [ ] secure cookies
- [ ] brute-force protection
- [ ] email enumeration protection
- [ ] login audit
- [ ] SSO audit
- [ ] encrypt provider secrets
- [ ] file MIME validation
- [ ] upload size limit
- [ ] permission tests
- [ ] tenant isolation tests

Điểm cuối cực kỳ quan trọng:

> User của Workspace A tuyệt đối không thể lấy dữ liệu Workspace B bằng cách thay ID trong API.

---

# PHASE 27 — Frontend migration strategy

Không rewrite frontend Circle.

Thay từng module.

Hiện tại:

```text
Component
   ↓
Zustand
   ↓
mock-data
```

Chuyển thành:

```text
Component
   ↓
TanStack Query
   ↓
API Client
   ↓
NestJS
```

Zustand vẫn dùng cho:

```text
modal
sidebar
display preference
temporary UI state
command menu
```

Không dùng Zustand làm nguồn dữ liệu server chính.

---

# 36. Thứ tự migrate mock-data

Thực hiện chính xác theo thứ tự:

- [ ] User
- [ ] Authentication
- [ ] Workspace
- [ ] Members
- [ ] Teams
- [ ] Status
- [ ] Projects
- [ ] Issues
- [ ] Labels
- [ ] Cycles
- [ ] Comments
- [ ] Activity
- [ ] Notifications
- [ ] Documents
- [ ] Project updates
- [ ] Agent

Sau mỗi module:

```text
remove corresponding mock-data dependency
```

Mục tiêu cuối:

```text
mock-data/
```

không còn được import bởi production code.

Có thể giữ làm:

```text
seed/
fixtures/
storybook/
tests/
```

---

# 37. Database schema tổng thể

Phiên bản đầu nên có:

```text
users
user_identities
sessions
password_reset_tokens
email_verification_tokens

organizations
workspaces
workspace_domains
workspace_members
workspace_invitations

roles
permissions
role_permissions

teams
team_members

projects
project_members

issue_statuses
issues
issue_assignees
labels
issue_labels

cycles
issue_cycles

comments
attachments

documents

activities
notifications

audit_logs

api_tokens

webhooks

sso_configurations
```

---

# 38. API structure

Chuẩn:

```text
/api/v1
```

Ví dụ:

```text
/api/v1/auth

/api/v1/users

/api/v1/workspaces
/api/v1/workspaces/:workspaceId/members

/api/v1/teams

/api/v1/projects

/api/v1/issues

/api/v1/cycles

/api/v1/comments

/api/v1/notifications
```

Backend bắt buộc xác định:

```text
authenticated user
+
workspace
+
permission
```

trước khi query data.

---

# 39. Response format

Success:

```json
{
  "data": {}
}
```

List:

```json
{
  "data": [],
  "meta": {
    "cursor": "...",
    "hasMore": true
  }
}
```

Error:

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project not found"
  }
}
```

---

# 40. Phase triển khai thực tế

## Milestone 1 — Foundation

Hoàn thành:

- [ ] monorepo
- [ ] NestJS
- [ ] PostgreSQL
- [ ] Prisma
- [ ] Redis
- [ ] Docker
- [ ] Swagger

---

## Milestone 2 — Authentication

Hoàn thành:

- [ ] Register
- [ ] Login
- [ ] Logout
- [ ] Refresh token
- [ ] Forgot password
- [ ] Verify email
- [ ] Session management
- [ ] Google login
- [ ] Microsoft login

Sau milestone này Circle có user thật.

---

## Milestone 3 — Workspace

- [ ] Organization
- [ ] Workspace
- [ ] Members
- [ ] Invitations
- [ ] roles
- [ ] permissions

Sau milestone này app có multi-user/multi-tenant thật.

---

## Milestone 4 — Project core

- [ ] Teams
- [ ] Projects
- [ ] Issues
- [ ] Status
- [ ] Labels
- [ ] Assignees

Sau milestone này Circle bắt đầu sử dụng được thực tế.

---

## Milestone 5 — Planning

- [ ] Cycles
- [ ] Project overview
- [ ] Saved views
- [ ] Filters
- [ ] Issue relations
- [ ] Sub-issues

---

## Milestone 6 — Collaboration

- [ ] Comments
- [ ] Mention
- [ ] Activity
- [ ] Notifications
- [ ] Attachments
- [ ] Real-time updates

---

## Milestone 7 — Enterprise foundation

- [ ] RBAC
- [ ] Custom roles
- [ ] Audit log
- [ ] Workspace domain
- [ ] Enterprise Microsoft SSO
- [ ] JIT provisioning
- [ ] Enforce SSO

---

## Milestone 8 — Platform

- [ ] API token
- [ ] Webhook
- [ ] Import/export
- [ ] Worker
- [ ] Automation

---

## Milestone 9 — Intelligence

- [ ] Analytics
- [ ] Agent
- [ ] AI Search
- [ ] AI Project Summary
- [ ] AI Issue Creation
- [ ] AI Sprint Planning

---

# 41. Definition of Done cho mỗi module

Mỗi feature CHỈ được coi là hoàn thành khi có đủ:

- [ ] Database migration
- [ ] Prisma model
- [ ] Repository/service
- [ ] API
- [ ] validation
- [ ] permission
- [ ] unit test
- [ ] integration test
- [ ] Swagger
- [ ] frontend integration
- [ ] loading state
- [ ] empty state
- [ ] error state
- [ ] optimistic update nếu phù hợp
- [ ] audit event nếu cần
- [ ] remove tương ứng mock-data

Không được coi:

```text
"API chạy được"
```

là feature hoàn thành.

---

# 42. Nguyên tắc bắt buộc cho Agent phát triển

1. Không redesign Circle nếu không cần thiết.

2. Giữ component/UI hiện tại tối đa.

3. Không để business logic trong React component.

4. Không query database trực tiếp từ Next.js.

5. Mọi business operation đi qua NestJS API.

6. Không sử dụng mock-data cho production feature sau khi module đã migrate.

7. Không dùng Zustand làm server-state database.

8. Dùng TanStack Query cho server state.

9. Mọi database table multi-tenant phải liên hệ được với Workspace.

10. Backend phải kiểm tra permission, không tin frontend.

11. Không hard-code role.

12. Authentication và Authorization phải tách biệt.

13. Google/Microsoft account phải được coi là Identity của User, không phải User riêng.

14. SSO Enterprise phải được cấu hình theo Workspace.

15. Mọi mutation quan trọng phải có Activity/Event hoặc Audit Log thích hợp.

16. Không xây microservices ở giai đoạn này.

17. Thiết kế API trước rồi mới kết nối UI.

18. Mỗi phase phải chạy được độc lập trước khi sang phase tiếp theo.

---

# 43. Mục tiêu MVP đầu tiên

MVP chưa cần:

```text
AI
Automation
Webhook
Analytics nâng cao
SAML
SCIM
LDAP
```

MVP bắt buộc có:

```text
Register/Login
Google login
Microsoft login

Workspace
Members
Invitation

Teams
Projects
Issues
Cycles

Comments
Notifications

RBAC cơ bản

Attachments

Activity
```

Khi đạt trạng thái:

```text
Không còn mock users
Không còn mock projects
Không còn mock issues
Không còn mock teams
Không còn mock cycles
```

thì có thể xem Circle đã chuyển từ:

```text
UI Template
```

thành:

```text
Project Management Application
```

thực sự.

---

# 44. Enterprise V1

Sau MVP mới triển khai:

```text
Custom RBAC
Audit Logs

Microsoft Entra Workspace SSO
Google Workspace SSO

Domain verification
SSO enforcement
JIT provisioning

API Tokens
Webhooks
```

---

# 45. Enterprise V2

Sau đó:

```text
SAML 2.0

Generic OIDC

SCIM 2.0

Directory Sync

Group → Team mapping

Advanced audit export

IP restrictions

Session policies

Workspace security policies
```

Kiến trúc authentication từ đầu phải chuẩn bị cho V2 nhưng KHÔNG cần implement V2 trong MVP.
