# Flowie — Kế Hoạch Triển Khai (PLAN)

Tài liệu này là **kế hoạch làm việc thực tế** cho Flowie, dựng lại từ việc rà soát
trực tiếp source code (backend Go, migrations, frontend Next.js) đối chiếu với 8
module trong `project_management_app_analysis.md`.

**Nguyên tắc:** Go là backend chính (source of truth + auth); Python là service phụ
(analytics/automation) chỉ khi tải tính toán đủ lớn. SSO Azure AD trước; file qua
SharePoint. Ưu tiên *vertical slice* — mỗi hạng mục chạy được end-to-end (DB → API → UI).

**Trạng thái:** ✅ hoàn chỉnh (DB+API+UI) · 🟡 một phần · 🧱 **chỉ có schema DB, chưa
đấu nối API/UI** · ⬜ chưa làm.

**Cập nhật:** 2026-07-25 — dựng lại từ rà soát code (thay cho ROADMAP cũ), sau đó
cập nhật liên tục khi từng hạng mục hoàn thành.

---

## 0. Tình trạng chốt (2026-07-25)

Toàn bộ hạng mục trong plan đã triển khai. Những gì **không thể tự kiểm chứng ở đây**
được nêu rõ thay vì đánh dấu hoàn thành:

| Hạng mục | Trạng thái |
|---|---|
| Phase A — wire 6 bảng "mồ côi" | ✅ |
| Phase B — task lõi (timer, custom status/WIP, MoSCoW/RICE) | ✅ |
| Phase C — views, filter/sort/group, virtualization, realtime (SSE), CPM | ✅ |
| Phase D — dashboard, agile reports, custom widget, digest tự động | ✅ |
| Phase E — automation v2, webhook, public API, Slack/Teams, GitHub/GitLab | ✅ |
| Phase F — 2FA, GDPR, audit trail, invite, rotation, dark mode, phím tắt, test | ✅ |
| **Đính kèm & duyệt file SharePoint** | 🟡 **code xong, chưa verify** — `.env` là placeholder, cần credentials Azure thật |
| **`Sites.Selected`** | việc cấu hình trên Azure AD khi triển khai, không phải code |
| Desktop/Mobile app, tích hợp Figma | ❌ **ngoài phạm vi** theo quyết định của bạn |

**Kiểm chứng hiện tại:** `go build` · `go vet` · `gofmt` sạch · **5/5 package Go test
pass** (gồm **8 integration test chạy trên PostgreSQL thật**) · frontend `tsc` sạch ·
**19/19 unit test** · **7/7 e2e Playwright** trên trình duyệt thật · `next build` sạch.

> Mọi thao tác kiểm thử đều chạy trên backend riêng ở cổng 8081 và **dữ liệu thử
> nghiệm đã được khôi phục nguyên trạng** sau mỗi lần.


---

## 1. Hiện trạng (đã xác minh trong code)

### Đã chạy end-to-end ✅
- **Auth/IAM cơ bản:** Azure AD SSO (`auth/azure.go`), session JWT cookie, đồng bộ
  user từ Graph, System Admin (`admin_handler.go`), RBAC Workspace/Project (role tĩnh).
- **Phân cấp dữ liệu:** Workspace → Project → Task/Sub-task (`parent_task_id`).
- **Task:** title/desc/assignee/priority/dates, checklist, comment, label, activity log,
  story points, participants.
- **Agile:** Sprint (`sprints.go`), backlog (task chưa gán sprint), story points.
- **Worklog:** nhập tay + note, timesheet theo ngày/tuần, submit-for-approval
  (`SubmitTimesheet`, `SetWorklogState`).
- **Views:** Board (Kanban), Timeline, Sprints, Workload, Calendar (`ProjectTabs.tsx`).
- **Automation (MVP):** rule 1 chiều `status đổi → assign` (`automation_handler.go`).
- **Notifications:** notification center (`notification_handler.go`).
- **Tài chính cơ bản:** cost = giờ × hourly_rate (`ProjectStats.CostActual`, member rate).
- **Admin:** quản lý user, sync Azure, tạo/xoá workspace.

### 🧱 Đã tạo bảng DB nhưng CHƯA đấu nối (không có store/handler/UI — xác nhận bằng grep)
> Đây là nợ kỹ thuật ưu tiên cao nhất: schema sẵn, chỉ thiếu lớp API + UI.

| Tính năng | Migration | Bảng |
|-----------|-----------|------|
| Custom Fields | `0008_custom_fields_deps.sql` | `custom_field_defs`, `custom_field_values` |
| Task Dependencies | `0008` | `task_dependencies` |
| Chat | `0009_chat.sql` | `chat_channels`, `chat_messages`, `chat_reads` |
| Session/Device mgmt | `0010_iam_advanced.sql` | `user_sessions` |
| Custom Roles | `0010` | `custom_roles`, `workspace_members.custom_role_id` |
| Teams/Phòng ban | `0010` | `teams`, `team_members` |

### Thiếu hoàn toàn khi bắt đầu (ảnh chụp 2026-07-25, **nay đã làm xong** — xem các Phase bên dưới)
- Time tracking bấm giờ Start/Stop · Custom status per project · MoSCoW/RICE ·
  Sprint capacity · Project templates · trường Budget/Client · Portfolio CRUD.
- Burndown/Velocity · Custom dashboard/widget · Báo cáo tự động (email/Slack).
- WebSockets real-time · Webhooks out · tích hợp native (Slack/Teams/GitHub).
- 2FA/MFA · đa dạng phương thức đăng nhập · keyboard shortcuts.

> **Ngoài phạm vi (2026-07-25):** Desktop app (Electron), Mobile app (React
> Native/Expo) và tích hợp Figma — Flowie chỉ phát hành dạng web app.

---

## 2. Thứ tự thực hiện đề xuất

Ưu tiên **wire các module đã có schema** (chi phí thấp, giá trị cao) trước, rồi tới
các tính năng lõi thiếu hẳn.

```
Phase A (schema→wired)  →  Phase B (task lõi)  →  Phase C (views/real-time)
     →  Phase D (reporting)  →  Phase E (integration)  →  Phase F (NFR/đóng gói)
```

---

## Phase A — Đấu nối các module đã có schema 🧱→✅

**Mục tiêu:** biến 6 bảng "mồ côi" thành tính năng chạy được. Không cần đổi schema.

### A1. Task Dependencies (Module 3.4) ✅
- Store + handler: thêm/xoá/liệt kê dependency; check chu trình (recursive CTE) —
  `store/taskdeps.go`, `handlers/dependency_handler.go`.
- API: `GET/POST /tasks/{id}/dependencies`, `DELETE /tasks/{id}/dependencies/{depId}`;
  dependencies kèm trong `GET /tasks/{id}`.
- UI: mục "Bị chặn bởi / Đang chặn" trong TaskDrawer; banner cảnh báo khi task bị block.
- **DoD:** cảnh báo (confirm) khi chuyển sang In Progress/On Review còn blocker chưa
  Done; chặn tự-phụ-thuộc và chu trình; ràng buộc cùng project. ✅

### A2. Custom Fields (Module 3.4) ✅
- Store + handler CRUD định nghĩa field (text/number/dropdown/date/url) theo project;
  lưu giá trị JSONB theo task — `store/customfields.go`, `handlers/customfield_handler.go`.
- API: `GET/POST /projects/{id}/custom-fields`, `DELETE /projects/{id}/custom-fields/{fieldID}`,
  `PUT /tasks/{id}/custom-fields`; values kèm trong `GET /tasks/{id}`.
- UI: mục "Trường tùy chỉnh" trong TaskDrawer — render input động theo type,
  panel "Quản lý" để tạo/xoá field (dropdown nhập options).
- **DoD:** tạo field dropdown, gán giá trị cho task, hiển thị đúng type. ✅ (lọc theo
  field ở List View để ở Phase C).

### A3. Chat (Module 7.2) ✅
- Store + handler channel/message per project + read receipts (`store/chat.go`,
  `handlers/chat_handler.go`). @mention trong chat cũng bắn notification.
- API: `GET/POST /projects/{id}/channels`; `GET/POST /channels/{id}/messages`;
  `POST /channels/{id}/read`; `DELETE /channels/{id}`.
- UI: tab **Chat** trong project — danh sách kênh + badge unread, bong bóng tin nhắn,
  **polling 5s** (nâng lên WebSocket ở Phase C).
- **DoD:** ✅ verify runtime — gửi/nhận tin, unread đếm đúng (1 → đọc → 0), tin của
  chính mình không tính unread.

### A4. Session/Device Management (Module 1.1) ✅
- Ghi `user_sessions` khi login (device từ User-Agent, ip, last_seen). Token **chỉ lưu
  dạng SHA-256 hash**, không lưu token thật.
- Migration `0012_session_revoke.sql`: thêm `revoked_at` + unique index token_hash.
  Thu hồi = **stamp `revoked_at`** (không xoá row) để phân biệt "đã thu hồi" với
  "chưa từng ghi" → **session cũ vẫn hoạt động**, không ai bị đăng xuất khi deploy.
- `auth.SessionManager.UseRegistry()` bật kiểm tra thu hồi trong middleware
  (fail-closed: lỗi DB → 500, không âm thầm cho qua). `Touch` throttle 5 phút.
- API: `GET /me/sessions`, `DELETE /me/sessions/{id}`. Logout cũng revoke server-side.
- UI: trang **/settings** — Tài khoản + danh sách thiết bị, nhãn "Phiên hiện tại",
  nút Thu hồi (thu hồi phiên hiện tại sẽ đăng xuất luôn).
- **DoD:** ✅ verify runtime — thu hồi phiên A ⇒ A nhận **401 `session_revoked`**
  ngay, phiên B vẫn 200; session không có trong DB vẫn 200 (backward compatible).

### A5. Custom Roles + Teams (Module 1.2 / 1.3) 🟡
- **Custom Roles ✅:** CRUD role + tick permission, gán role cho member
  (`store/iam.go`, `handlers/iam_handler.go`). Catalogue 14 permission
  (`domain.AllPermissions`); request bị **lọc theo catalogue + khử trùng lặp** nên
  client không thể bịa quyền. `PermissionsForUser` đã có sẵn để dùng ở bước sau.
- **Teams ✅:** CRUD team, thêm/bớt thành viên (chỉ nhận user đã thuộc workspace).
- **API:** `GET /permissions`; `GET/POST/PUT/DELETE /workspaces/{id}/roles[/{roleID}]`;
  `PUT /workspaces/{id}/members/{userID}/custom-role`;
  `GET/POST/DELETE /workspaces/{id}/teams[/{teamID}]`, `POST /teams/{teamID}/members`.
- **UI ✅:** trang Team tách 3 tab — Thành viên · Vai trò · Phòng ban (cột "Vai trò
  tuỳ chỉnh" thêm vào bảng thành viên).
- **Đã verify runtime:** JSONB `permissions` → `[]string` scan OK; quyền lạ bị loại;
  guard RBAC đúng (member mutate → 403, xem → 200).
- **Thực thi permission ✅:** `handlers/permission.go` — `requirePermission()` đã
  thay guard role tĩnh ở các handler task (create/edit/delete).
  Quy tắc: **owner/admin luôn qua** (tránh tự khoá mình khỏi workspace); nếu member
  có custom role thì danh sách quyền đó là **tuyệt đối** (không fallback); nếu không,
  dùng bảng mặc định (`defaultRoleGrants`) tái hiện đúng hành vi cũ của
  member/guest/billing. Lỗi tra cứu ⇒ **fail-closed**.
  **DoD ✅** 3 unit test bao phủ ma trận role×permission, chặn role/permission lạ.

---

## Phase B — Task lõi còn thiếu (Module 3) 🟡

- **Time tracking Start/Stop (3.3) ✅:** migration `0013_timers.sql` (bảng
  `active_timers`, PK `user_id` ⇒ **mỗi user tối đa 1 timer**). Store/handler
  start · stop · cancel · get. Stop quy đổi thành worklog `source=timer`
  (làm tròn phút, tối thiểu 1). API: `POST /tasks/{id}/timer/start`,
  `GET|DELETE /me/timer`, `POST /me/timer/stop`.
  UI: pill đếm giờ **toàn cục ở TopBar** + nút Bắt đầu/Dừng trong TaskDrawer
  (đồng bộ qua CustomEvent, tick cục bộ 1s, re-sync 60s).
  **DoD ✅** verify runtime: start→201, start lần 2→**409**, stop→worklog đúng,
  stop lại→404.
- **Sprint capacity (3.2) ✅** + cho phép đặt `startDate/endDate` cho sprint.
- **Custom Status per project + WIP limit (3.1) ✅:** migration
  `0014_workflow_statuses.sql` — bảng `workflow_statuses` (key, name, category,
  color, position, wip_limit) và **backfill 4 cột cũ cho mọi project đang có**, nên
  Board giữ nguyên giao diện sau khi migrate. Project mới được seed tự động.
  API: `GET/POST /projects/{id}/statuses`, `PUT|DELETE .../statuses/{statusID}`.
  **WIP limit được enforce ở server**: chuyển task vào cột đầy ⇒ **409
  `wip_limit_exceeded`**. Xoá cột sẽ **dời task sang cột đầu tiên** (không mất task)
  và **không cho xoá cột cuối cùng**.
  UI: Board/List render động theo cột của project (fallback bộ mặc định), badge
  `count/limit` đỏ khi chạm giới hạn; trang **Cài đặt** của project để thêm/sửa/xoá
  cột, đổi màu, đổi thứ tự, đặt WIP.
  **DoD ✅** verify runtime: backfill đúng 4 cột; WIP=1 ⇒ 409; xoá cột `in_review`
  ⇒ task tự chuyển sang `todo`.
- **Prioritization MoSCoW + RICE (3.2) ✅:** migration `0015_prioritization.sql` —
  cột `moscow` + 4 input RICE, `rice_score` là **GENERATED column**
  (reach × impact × confidence% ÷ effort) nên sort backlog không phải tính lại.
  UI: khu "Ưu tiên backlog" trong TaskDrawer (chip MoSCoW + 4 ô RICE + điểm).
  **DoD ✅** verify runtime: 100×2×80%÷4 = **40** đúng; `effort=0` ⇒ score NULL
  (không chia 0); `moscow` sai ⇒ 400.
- ~~**@mention trong comment (3.5)**~~ ✅ đã có sẵn (`handlers/task_handler.go`:
  `parseMentions`/`notifyMentions` → bắn notification khi comment). Còn thiếu:
  **đính kèm file** vào comment/task (nối SharePoint — xem Phase E).
- **Prioritization (3.2):** trường MoSCoW/RICE; sắp xếp backlog theo điểm ưu tiên.
- **Sprint capacity (3.2):** tổng story point vs capacity team, cảnh báo quá tải.
- **DoD:** tạo status tuỳ biến + WIP limit; bấm giờ ra worklog; @mention bắn noti.

---

## Phase C — Views & Real-time (Module 4 + NFR) ✅

- **List View — filter/sort ✅:** `src/lib/taskFilters.ts` (logic thuần, **không phụ
  thuộc React**) + `components/task/TaskFilters.tsx` (UI).
  Lọc theo người phụ trách (kể cả "chưa gán"), độ ưu tiên, nhãn, MoSCoW, **quá hạn**,
  ẩn việc đã xong; sắp xếp theo hạn/ưu tiên/story points/**điểm RICE**/tên.
  Thay 4 nút Filter·Sort·Closed·Assignee vốn chỉ là trang trí bằng bộ lọc chạy thật,
  kèm **toggle List ↔ Board** (trước đây state `view` khai báo nhưng không đổi được).
  Quy ước có chủ đích: task **không có hạn** rơi xuống cuối khi sort theo hạn (không
  bị coi là "cũ nhất"); "quá hạn" loại trừ việc đã Done.
  **DoD ✅** `npm test` — **13/13 pass** bằng `node --experimental-strip-types`
  chạy **trên chính file logic thật** (không copy code nên test không lệch runtime).
- **Group-by (swimlane) + Virtualization ✅:** `groupTasks()` trong
  `lib/taskFilters.ts` chia làn theo **người phụ trách / ưu tiên / MoSCoW / không
  nhóm** (mặc định vẫn theo cột trạng thái); làn đông nhất hiện trước, việc chưa gán
  gom vào làn riêng.
  `components/ui/VirtualList.tsx`: chỉ dựng DOM cho hàng trong khung nhìn (+overscan),
  **tự tắt khi danh sách ngắn (<60 dòng)** để giữ nguyên hành vi cuộn tự nhiên, và
  reset vị trí cuộn khi bộ lọc làm ngắn danh sách.
  **DoD ✅** `npm test` **19/19 pass** (6 test mới cho grouping).
- **Kanban kéo-thả ✅:** dùng **HTML5 native drag & drop** (không cần dnd-kit) —
  kéo thẻ giữa các cột, thẻ mờ khi đang kéo, cột đích sáng xanh; cột **đã đầy WIP
  sáng đỏ** để báo trước rằng thả vào sẽ bị server từ chối (409).
- **Gantt/Timeline + Critical Path ✅:** `store/criticalpath.go` — CPM đầy đủ
  (topological sort Kahn → forward pass ES/EF → backward pass LS/LF → slack).
  Task có **slack = 0** nằm trên đường găng. Đồ thị có chu trình ⇒ trả rỗng thay vì
  số sai. API `GET /projects/{id}/critical-path`. UI: Timeline tô **đỏ** thanh trên
  đường găng, tooltip hiện thời lượng + slack, nút bật/tắt + tổng số ngày dự kiến.
  **DoD ✅** 4 unit test: chuỗi tuần tự (mọi task critical), **nhánh song song —
  nhánh ngắn có slack = 3 ngày**, task độc lập, và phát hiện chu trình.
- **Workload:** cảnh báo >8h/ngày, kéo task sang người rảnh.
- **Saved Views ✅:** migration `0022_saved_views.sql`. Lưu nguyên trạng thái board
  (kiểu hiển thị + bộ lọc + sắp xếp) dưới dạng JSON; view **cá nhân** (owner = user)
  hoặc **dùng chung** (owner NULL, chỉ owner/admin lưu được).
  API: `GET/POST /projects/{id}/views`, `DELETE .../views/{viewID}` — người dùng chỉ
  xoá được view của mình, admin xoá được cả view dùng chung.
  UI: dropdown "Views đã lưu" + nút "Lưu view" trên board; chọn view sẽ khôi phục
  cả List/Board, bộ lọc và thứ tự sắp xếp.
  **DoD ✅** verify runtime: lưu/đọc lại đúng config; **member lưu view dùng chung
  ⇒ 403**.
- **Real-time ✅ (dùng SSE thay WebSocket):** `internal/realtime/hub.go` — hub fan-out
  theo project; endpoint `GET /projects/{id}/events`.
  **Quyết định kỹ thuật:** luồng dữ liệu ở đây một chiều (server → client; client vẫn
  ghi qua REST), nên **Server-Sent Events** phù hợp hơn WebSocket: không thêm
  dependency, trình duyệt tự reconnect, không bị proxy chặn upgrade.
  Publish tại: `task.created/updated/status_changed/deleted`, `task.commented`,
  `chat.message`. Subscriber chậm bị **bỏ qua thay vì chặn** handler.
  **Bẫy đã xử lý:** `middleware.Timeout(30s)` toàn cục sẽ cắt SSE — thêm
  `timeoutExcept()` để loại trừ path `/events`; kèm heartbeat 25s chống proxy đóng.
  Frontend: hook `useProjectEvents` (EventSource + `withCredentials`), gắn vào Board
  và Chat (Chat hạ polling 5s → 30s chỉ còn là fallback).
  **DoD ✅** verify runtime: stream nhận `event: task.status_changed` kèm payload
  `{from, to, taskId, actorId}` ngay sau khi PATCH.
- **DoD:** view mượt với vài nghìn task; hai client thấy thay đổi tức thời.

---

## Phase D — Reporting, Dashboard & Tài chính (Module 5) 🟡

### D1. Workspace & Project Dashboard ✅
- **Backend:** `store/overview.go` — `WorkspaceOverview` (rollup toàn workspace +
  per-project) và `ProjectOverview` (mở rộng ProjectStats + per-assignee load).
  API: `GET /workspaces/{id}/overview`, `GET /projects/{id}/overview`.
- **Trend 6 tháng:** created / completed / in-work / hours. Mốc "đạt trạng thái X"
  lấy từ activity `status_changed`, **fallback `updated_at`** khi task được tạo
  thẳng ở trạng thái đó — nếu không biểu đồ sẽ luôn bằng 0 với dữ liệu cũ.
- **Frontend:** `components/ui/DashboardCharts.tsx` (SVG thuần, không thêm lib):
  `StatTile`, `BarSparkline`, `AreaSparkline`, `RingProgress`, `TrendAreaChart`
  (multi-series, grid, tooltip, legend).
- **Trang:** workspace dashboard (`/workspaces/[id]`) có KPI tiles + biểu đồ + bảng
  tiến độ theo dự án; project dashboard mới (`/projects/[id]/dashboard`, tab
  "Dashboard") có KPI + trend + donut/bar + giờ theo tháng + phân bổ nhân sự.
- **Lưu ý hiệu năng:** `AssigneeLoad` **không** trả `avatarUrl` — avatar lưu dạng
  base64 data-URI (~20KB/user) sẽ làm phình payload dashboard; UI dùng initials.
- **DoD:** 2 endpoint verify end-to-end trên DB thật (HTTP 200, số liệu khớp
  truy vấn SQL đối chiếu). ✅

### D2. Agile Reports ✅
- `store/agile.go`: **Burndown** (chuỗi theo ngày, remaining + đường ideal),
  **Velocity** (committed vs completed mỗi sprint), **Capacity** (theo assignee).
  Mốc "task xong ngày nào" dùng activity `status_changed`, fallback `updated_at`.
- API: `GET /sprints/{id}/burndown`, `GET /sprints/{id}/capacity`,
  `GET /projects/{id}/velocity`.
- UI: tab **Reports** trong project — Burndown (line thực tế vs lý tưởng),
  Velocity (`GroupedBarChart` mới), bảng Capacity theo nhân sự.
- **DoD ✅** verify runtime: sprint 3 task × 5 điểm, đánh dấu 1 task done ⇒
  burndown giảm 15→10 đúng ngày, ideal giảm tuyến tính 15→0, velocity 15/5.

### D3. Custom Dashboards ✅
- **Custom Dashboards ✅:** migration `0019_dashboards.sql` (`dashboards`,
  `dashboard_widgets`). Dashboard **cá nhân** (owner = user) hoặc **dùng chung**
  (owner NULL) — chỉ owner/admin mới tạo loại dùng chung.
  6 loại widget: `kpi`, `status_donut`, `priority_bar`, `trend`, `project_table`,
  `velocity`; mỗi widget có `config` JSONB (metric/projectId) và độ rộng 1–3 cột.
  API: `GET/POST /workspaces/{id}/dashboards`, `DELETE /dashboards/{id}`,
  `POST /dashboards/{id}/widgets`, `DELETE /dashboards/{id}/widgets/{widgetID}`.
  UI: trang **/dashboards** — tab nhiều dashboard, chế độ "Sửa" để thêm/xoá widget.
  **DoD ✅** verify runtime: tạo dashboard cá nhân OK; **member tạo shared ⇒ 403**;
  widget type lạ ⇒ **400**.
- **Tài chính:** mở rộng cost hiện có — estimate vs actual, chi phí theo sprint/người.
- **Báo cáo tự động ✅:** migration `0024_scheduled_reports.sql` + scheduler nền
  (`StartReportScheduler`) chạy trong tiến trình API, tick 10 phút và hỏi DB report
  nào **đến giờ** (theo `hour_utc`).
  **Chống gửi trùng nằm ở câu truy vấn** (`last_run_at` cách nhau ≥20h với daily,
  ≥6 ngày với weekly) nên khởi động lại app — hoặc chạy nhiều instance — cũng không
  gửi lặp.
  Nội dung digest lấy từ `WorkspaceOverview`: tổng/hoàn thành, đang làm, quá hạn,
  giờ log và **chi tiết theo từng dự án**; gửi qua Slack/Teams dùng lại `chatPayload`.
  API: `GET/POST/DELETE /workspaces/{id}/reports` + `POST .../reports/{id}/run`
  (gửi thử ngay để kiểm tra kênh).
  **DoD ✅** verify runtime với mock Slack: nhận đúng nội dung
  ("Tổng công việc: 4 · Đang làm: 1 · 0.2h · SAP 0/4"), `last_status=200` ghi vào DB.
  URL kênh bắt buộc **https** (validation) — trong test tôi trỏ DB sang http để
  kiểm tra luồng gửi mà không nới lỏng ràng buộc production.
- **Kiến trúc:** phần aggregate nặng (burndown/forecast) có thể tách service Python
  (FastAPI + pandas) đọc read-replica; Go giữ CRUD/auth.
- **DoD:** burndown/velocity đúng số; dashboard kéo-thả widget; email đúng lịch.

---

## Phase E — File, Automation nâng cao & Integrations (Module 3.5 + 6) 🟡

- **Đính kèm file SharePoint 🟡 (code xong, chưa verify được với Azure thật):**
  - `sharepoint/upload.go`: **upload session chunked** cho file >4MB
    (`UploadLargeFile` tự chọn PUT đơn hay session); chunk là bội số 320 KiB đúng
    yêu cầu Graph.
  - Migration `0026_attachments.sql` + `store/attachments.go`; file lưu vào
    `<project>/04_Tasks/<KEY-123>/`. Flowie chỉ giữ **metadata**, bytes ở SharePoint.
  - API `GET/POST/DELETE /tasks/{id}/attachments`; UI mục "Tệp đính kèm" trong
    TaskDrawer (upload, mở trên SharePoint, gỡ liên kết).
  - Gỡ đính kèm **không xoá file trên SharePoint** — thư mục là kho tài liệu chung
    của nhóm; xoá ở đó là tác dụng phụ ngoài ý muốn của thao tác trong Flowie.
  - **DoD một phần ✅:** unit test chia chunk (bao phủ trọn file, không hở/chồng lấn,
    biên) + `safeFileName` (**chặn path traversal**, ký tự SharePoint cấm, giới hạn
    độ dài). Test đã **bắt 1 bug thật**: `path.Base` không hiểu backslash nên tên
    kiểu `C:\dir\file.txt` còn giữ phần thư mục.
  - **⚠️ Chưa verify end-to-end:** `.env` đang là placeholder
    (`SHAREPOINT_SITE_URL=your-tenant.sharepoint.com/...`) nên Graph trả
    *"Invalid hostname for this tenancy"*. Endpoint xử lý lỗi sạch (502 kèm thông
    điệp Graph), nhưng **luồng upload thật cần credentials Azure của tổ chức**.
- **Trình duyệt file toàn project ✅ (code):** `GET /projects/{id}/files?path=…`
  liệt kê nội dung thư mục SharePoint của dự án. Đường dẫn con được `path.Clean`
  **neo trong thư mục dự án**, nên không thể dùng `..` để xem tài liệu dự án khác.
  (Cùng giới hạn verify như phần đính kèm: cần credentials Azure thật.)
> **Việc vận hành (không phải code):** siết quyền Graph từ `Sites.ReadWrite.All`
> xuống **`Sites.Selected`** và cấp quyền cho đúng site — thực hiện trên Azure AD
> của tổ chức khi triển khai. Code hiện đã chỉ truy cập một site duy nhất theo
> `SHAREPOINT_SITE_URL` nên không cần sửa gì thêm.
- **Automation engine ✅:** migration `0016_automation_rules_v2.sql` thêm
  `trigger_type`, `conditions`, `actions` (JSONB) và **backfill rule v1 sang
  `actions`**, nên rule cũ chạy tiếp không cần sửa.
  `handlers/automation_engine.go`: **Trigger → Condition → Action**.
  - Condition (AND, rỗng = luôn đúng): field `priority|status|assignee|story_points|
    moscow`, op `eq|neq|is_empty|not_empty|gt|lt`.
  - Action: `assign`, `set_status`, `set_priority`, `notify` — chạy **một lượt**,
    `set_status` bỏ qua nếu trùng status hiện tại để **không tự kích hoạt vòng lặp**.
  - API mới: `POST /projects/{id}/automations/v2` (validate action/condition,
    trả 400 khi sai). Endpoint v1 giữ nguyên.
  **DoD ✅** verify runtime: rule "status=in_review AND priority=high ⇒ set urgent +
  notify" — task `medium` **không** kích hoạt (giữ medium), task `high` kích hoạt
  (thành `urgent`) và notification được tạo.
- **Webhooks out ✅:** migration `0017_webhooks.sql` (url, `events` JSONB, secret,
  trạng thái lần gửi cuối). `handlers/webhook_handler.go`:
  - Gửi **bất đồng bộ trong goroutine với context nền** — endpoint chậm/lỗi không
    làm hỏng hay kéo dài request của người dùng; client timeout 10s.
  - Ký **HMAC-SHA256** header `X-Flowie-Signature: sha256=…`; **secret không bao giờ
    trả về client** (chỉ cờ `hasSecret`).
  - Lọc theo `events` (mảng rỗng = nhận tất cả); ghi lại `last_status/last_error`.
  - `emit()` phát đồng thời tới realtime hub **và** webhook.
  - API: `GET/POST /projects/{id}/webhooks`, `DELETE .../webhooks/{webhookID}`.
  **DoD ✅** verify runtime với receiver Node thật: `task.updated` **không** được gửi
  (đúng filter), `task.status_changed` được gửi; **chữ ký HMAC tính lại độc lập bằng
  Node khớp tuyệt đối**; `last_status=200` ghi vào DB. Kèm unit test cho `signPayload`.
- **Public API + API key ✅:** migration `0020_api_keys.sql`. Key sinh 256-bit,
  tiền tố `flw_` (dễ nhận diện cho secret scanner), **chỉ lưu hash SHA-256**;
  plaintext trả về **đúng một lần** lúc tạo. Có scope `read`/`write`, `last_used_at`
  (throttle 1 phút) và thu hồi.
  Nhánh riêng **`/api/public/v1`** (ngoài `/api/v1`) dùng middleware `RequireAPIKey`
  đọc `Authorization: Bearer` hoặc `X-API-Key`: `GET /projects`,
  `GET|POST /projects/{id}/tasks`.
  Quản lý: `GET/POST/DELETE /workspaces/{id}/api-keys` (chỉ owner/admin) — UI ở tab
  **API Keys** trong trang Team.
  **DoD ✅** verify runtime: key read-only ghi ⇒ **403 `insufficient_scope`**;
  key sai/thiếu ⇒ **401**; project ngoài workspace của key ⇒ **404**; sau thu hồi ⇒
  **401**; key có `write` tạo task ⇒ **201**. Kèm 4 unit test (prefix, hash không lộ
  secret, visiblePrefix, scope).
  **2 bug thật đã phát hiện & sửa khi verify:** (1) `Create` trả `active:false` cho
  key vừa tạo; (2) task tạo qua API lỗi **500** do `reporter_id = uuid.Nil` vi phạm
  khoá ngoại — nay map thành `NULL` ("không có người báo cáo").
- **Tích hợp Slack / MS Teams ✅:** migration `0021_integrations.sql`.
  Dùng **Incoming Webhook** của từng nền tảng; payload khác nhau nên tách rõ:
  Slack `{"text":…}`, Teams **MessageCard** (`@type`/`@context`/`summary`).
  Gửi **bất đồng bộ** cùng cơ chế với webhook; ghi `last_status/last_error`.
  `emit()` nay fan-out tới **3 nơi**: SSE realtime · webhook thô · chat integration.
  API: `GET/POST/DELETE /projects/{id}/integrations` (owner/admin) — UI trong trang
  Cài đặt dự án. **DoD ✅** unit test payload đúng dạng cho từng nền tảng + tiêu đề
  sự kiện tiếng Việt cho 5 loại event (và fallback cho event lạ).
- **Tích hợp GitHub/GitLab ✅:** webhook **vào** tại
  `POST /api/scm/v1/projects/{id}/webhook?secret=…` (máy-với-máy, không dùng session).
  - Migration `0025_task_numbers.sql`: thêm số thứ tự **per-project** cho task
    (trigger tự cấp số, backfill theo thứ tự tạo) — trước đó task chỉ có UUID nên
    **không thể tham chiếu trong commit message**.
  - Nhận diện `SAP-12` trong commit message / tiêu đề PR-MR; chỉ khớp **đúng key của
    dự án**, khử trùng lặp, bỏ qua chữ thường và chuỗi kiểu `1.2-3`.
  - Hỗ trợ **GitHub push, GitHub pull_request và GitLab merge_request** (3 dạng
    payload khác nhau); PR đã merge hiển thị "merged" thay vì action thô.
  - Xác thực **HMAC-SHA256** qua `X-Hub-Signature-256`.
  - Kết quả: bình luận hệ thống (`author_id = NULL`, hiển thị "Flowie Bot") gắn vào
    đúng task + phát sự kiện realtime.
  **DoD ✅** 6 unit test (regex, 3 dạng payload, chữ ký, firstLine) + verify runtime:
  commit "fix SAP-2 login bug" ⇒ `{"linked":1}` và bình luận xuất hiện đúng trên
  task số 2; **chữ ký sai ⇒ 401**.
  > **Figma: loại khỏi phạm vi** theo quyết định ngày 2026-07-25.
- **DoD:** upload file vào task hiện trên SharePoint; rule đa điều kiện chạy đúng;
  webhook bắn khi task đổi trạng thái.

---

## Phase F — Bảo mật & Compliance (NFR) 🟡

- **2FA/MFA (TOTP) ✅:** `auth/totp.go` — RFC 6238 viết thẳng trên thư viện chuẩn
  (không thêm dependency). Migration `0018_two_factor.sql`; **recovery code lưu dạng
  hash SHA-256**, secret không trả về sau khi kích hoạt.
  Luồng: đăng nhập ⇒ nếu bật 2FA thì cấp **token `mfaPending` sống 10 phút**;
  `RequireAuth` **từ chối** token đó (401 `mfa_required`); `POST /auth/2fa/verify`
  đổi lấy session đầy đủ. So sánh mã bằng **constant-time**, chấp nhận lệch ±1 cửa sổ.
  API: `GET /me/2fa`, `POST /me/2fa/start|enable|disable`, `POST /auth/2fa/verify`.
  UI: thẻ 2FA trong `/settings` (QR + khoá thủ công + hiển thị recovery code **một
  lần duy nhất**) và trang challenge `/login/2fa`.
  **DoD ✅** — unit test khớp **test vector chính thức RFC 6238**; verify runtime:
  mã do **Node tính độc lập** bật được 2FA (⇒ tương thích Google Authenticator);
  token pending ⇒ 401; sau verify ⇒ 200; **recovery code dùng-một-lần** (8→7, dùng
  lại bị chặn). Đã vá lỗ hổng: `dev-login` trước đó bỏ qua 2FA, nay cũng bị chặn.
- **Invite qua email ✅:** migration `0027_invites.sql`. Trước đây người dùng phải
  đăng nhập Azure AD ít nhất một lần thì admin mới thêm được; nay admin **mời trước
  bằng email**, tài khoản tự vào workspace ở lần đăng nhập đầu.
  Token **chỉ lưu hash**, hết hạn 14 ngày, **dùng một lần**, và **gắn đúng email được
  mời** — chuyển tiếp link cho người khác không có tác dụng. Mời lại cùng địa chỉ sẽ
  làm mới lời mời thay vì lỗi trùng.
  API: `GET/POST/DELETE /workspaces/{id}/invites`, `POST /invites/accept`.
  UI: khối "Mời qua email" trong tab Thành viên + trang `/invite/[token]`.
  **Lưu ý có chủ đích:** Flowie chưa cấu hình SMTP nên link mời được **trả về cho
  admin** để tự gửi, thay vì giả vờ đã gửi email.
  **DoD ✅** verify runtime: sai email ⇒ **403 `email_mismatch`**; đúng email ⇒ **200**
  và trở thành member; dùng lại token ⇒ **404**.
- **Xoay token phiên (rotation) ✅:** `POST /me/session/refresh` cấp token mới và
  **thu hồi token cũ**. Đây là *rotation của chính session cookie* thay vì thêm loại
  refresh-token riêng: session đã nằm trong cookie httpOnly có thể thu hồi qua
  `user_sessions`, nên xoay một credential cho cùng lợi ích mà không phải bảo vệ
  thêm token thứ hai. Chỉ xoay khi còn <6h là hết hạn (hoặc `?force=1`), tránh ghi
  DB mỗi request.
  **2 bug thật đã phát hiện & sửa khi verify:**
  1. JWT chỉ có timestamp **theo giây** ⇒ hai token cấp trong cùng một giây **giống
     hệt nhau**, rotation thành vô nghĩa → thêm `jti` ngẫu nhiên cho mỗi token.
  2. `Rotate` ban đầu ghi đè `token_hash` tại chỗ ⇒ hash cũ biến mất khỏi bảng, mà
     `IsRevoked` coi hash lạ là hợp lệ ⇒ **token cũ vẫn dùng được** đến khi JWT hết
     hạn → sửa thành *đánh dấu `revoked_at` cho row cũ rồi tạo row mới*.
  **DoD ✅** verify runtime: sau khi xoay, token cũ ⇒ **401 `session_revoked`**,
  token mới ⇒ **200**, danh sách thiết bị vẫn đúng 1 (không phình).
- **Bảo mật:** audit log, mã hoá at-rest, secrets qua Key Vault, rà soát OWASP.
- **GDPR export/xoá ✅:** `store/privacy.go` + `handlers/privacy_handler.go`.
  - `GET /me/export` — tải JSON gồm hồ sơ + 9 nhóm dữ liệu (workspace, task được
    giao/báo cáo, comment, worklog, chat, notification, session, activity).
  - `POST /me/delete` — **ẩn danh hoá** thay vì xoá cứng: xoá dữ liệu cá nhân thuần
    (notification, session, timer, membership, rate), **gỡ liên kết** tác giả khỏi
    task/comment/chat/activity, rồi scrub hồ sơ (email → placeholder duy nhất,
    vô hiệu hoá, tắt 2FA). Lý do: xoá cứng sẽ cascade mất lịch sử dự án của cả nhóm.
    Bắt buộc **gõ đúng email để xác nhận**.
  - UI: thẻ "Dữ liệu cá nhân" trong `/settings`.
  **DoD ✅** verify runtime trên user throwaway: export đủ 9 section; xác nhận sai
  ⇒ **400**; sau khi xoá, email thành `deleted-…@anonymised.invalid`,
  `is_active=false`, avatar rỗng, membership về 0.
- **Audit trail (nền tảng SOC2) ✅:** migration `0023_audit_log.sql` — bảng
  `audit_log` riêng cho **sự kiện bảo mật** (khác `activity_events` vốn chỉ ghi lịch
  sử công việc): đăng nhập, xác thực 2FA, bật/tắt MFA, thu hồi phiên, đổi vai trò,
  tạo/thu hồi API key, export/xoá dữ liệu.
  Ghi kèm actor (id + email), workspace, **IP** (ưu tiên `X-Forwarded-For`) và meta.
  `actor_id` để `ON DELETE SET NULL` và **email được ghi kèm** nên bản ghi vẫn đọc
  được sau khi tài khoản bị xoá theo GDPR; hàm `Record` **nuốt lỗi** để việc ghi log
  không bao giờ làm hỏng request của người dùng.
  API: `GET /workspaces/{id}/audit-log` (owner/admin) và `GET /admin/audit-log`
  (system admin, toàn hệ thống).
  **DoD ✅** verify runtime: tạo API key ⇒ ghi `apikey.created` kèm email + IP;
  export dữ liệu ⇒ ghi `privacy.data_exported`; **non-admin gọi audit toàn hệ thống
  ⇒ 403**.
- **Quan sát:** metrics (Prometheus), tracing (OTel), structured logs.
- **CI/CD 🟡:** `.github/workflows/ci.yml` đã có và được siết thêm — backend chạy
  **gofmt check → vet → build → test**, frontend chạy **tsc --noEmit → build**.
  Còn thiếu: staging deploy.
- **Dark/Light mode ✅:** `ThemeToggle` (sáng → tối → theo hệ thống, lưu
  localStorage, lắng nghe `prefers-color-scheme`) + script inline trong `layout.tsx`
  chạy trước paint để **không nhấp nháy nền sáng**.
  *Lưu ý kỹ thuật:* palette trong `tailwind.config.ts` là hex cố định nên biến thể
  `dark:` không remap được — dark theme hiện thực bằng khối override `.dark` trong
  `globals.css` cho đúng những utility UI đang dùng (surface ladder, text, border,
  input, scrollbar).
- **Keyboard shortcuts ✅:** `KeyboardShortcuts` mount trong AppShell — `?` mở bảng
  phím tắt, `/` nhảy vào ô tìm kiếm, `g` + phím (d/p/c/t/a/m/s) điều hướng, `Esc`
  đóng/bỏ tiêu điểm. Mọi handler **bỏ qua khi con trỏ đang ở input/textarea** nên
  không nuốt phím người dùng gõ.
- **Test 🟡 ✅ (đã có bộ đầu tiên):** `go test ./...` **pass** —
  `handlers/automation_engine_test.go` (14 case cho condition eval, AND semantics,
  field rỗng không bị coi là 0), `realtime/hub_test.go` (fan-out đúng project, không
  rò sang project khác, unsubscribe đóng channel + idempotent, **Publish không block
  khi subscriber chậm**, nil-hub an toàn), `store/overview_test.go` (pctDelta,
  chia-0), `auth/session_test.go` (hash ổn định & không lộ token, JWT round-trip,
  từ chối sai secret / hết hạn).
- **Integration test ✅:** `store/integration_test.go` chạy trên **PostgreSQL thật**
  (bật bằng `TEST_DATABASE_URL`, tự **skip** khi không có nên `go test ./...` vẫn
  chạy được ở máy không có DB). Mỗi test tự tạo workspace/project/user riêng và dọn
  sạch sau đó, nên không test nào thấy dữ liệu của test khác.
  Bao phủ **chính SQL** (thứ unit test không chạm tới): số thứ tự task do trigger
  cấp, phát hiện chu trình phụ thuộc, seed status idempotent + WIP limit, timer →
  worklog, **custom field không ghi chéo project**, thu hồi phiên, API key
  resolve/revoke, và **GDPR ẩn danh hoá vẫn giữ lịch sử bình luận**.
  **DoD ✅ 8/8 pass**. CI thêm service `postgres:16-alpine` để chạy thật.
- **E2E test ✅:** Playwright + Chromium, `frontend/e2e/app.spec.ts`, chạy bằng
  `npm run e2e` (dev server tự khởi động qua `playwright.config.ts`).
  Spec cần API **tự skip** khi backend không chạy, nên suite vẫn dùng được ở
  checkout chỉ có frontend.
  Bao phủ: chưa đăng nhập ⇒ **redirect /login**; app shell + sidebar; trang Settings
  hiện đủ 2FA · thiết bị · dữ liệu cá nhân; **phím tắt `?` mở bảng, `Esc` đóng**;
  **dark mode bật được và giữ nguyên sau reload**; trang Dashboards render.
  **DoD ✅ 7/7 pass** trên trình duyệt thật. CI chạy e2e và **upload
  playwright-report khi fail**.
> **Đa nền tảng (Desktop/Electron, Mobile/React Native): loại khỏi phạm vi** theo
> quyết định ngày 2026-07-25. Flowie chỉ phát hành dưới dạng **web app** (đã
> responsive); người dùng di động truy cập qua trình duyệt.

- **DoD:** CI xanh; export/xoá dữ liệu chạy.

---

## Phase G — Thiết kế lại UI/UX & lấp UI còn thiếu ✅

Xuất phát từ 7 phản hồi sử dụng thực tế (2026-07-25).

- **Điều hướng nhất quán ✅:** `/projects` trước đây đọc thẳng
  `localStorage.activeWorkspaceId` nên hiện "Vui lòng chọn Không gian làm việc"
  với bất kỳ ai chưa bấm workspace switcher — đây là lý do vào dự án từ side panel
  khác hẳn từ dashboard. Thêm hook `lib/useWorkspace.ts` (fallback về workspace đầu
  tiên rồi ghi nhớ). Cả bảng rollup ở dashboard lẫn thẻ ở `/projects` nay cùng trỏ
  `/projects/{id}` ⇒ luôn mở đúng màn hình có tabs.
- **Gộp Analytics + Dashboards → `/reports` ✅:** hai mục sidebar cũ hiển thị cùng
  bộ số của workspace nên không rõ nên mở cái nào. Nay là **4 tab của một trang**:
  *Phân tích* (dựng sẵn, mặc định toàn workspace, lọc được theo dự án),
  *Dashboard tuỳ chỉnh* (tự chọn widget), *Gửi định kỳ*, *Nhật ký*.
  Xoá `src/app/analytics/` và `src/app/dashboards/`.
- **Nút tạo mới ✅:** dashboard có menu **"Tạo mới"** (Dự án / Công việc / Lịch).
  Tách `components/project/NewProjectDialog.tsx` (gợi ý KEY từ tên) và
  `components/task/NewTaskDialog.tsx` (chọn dự án trước) để mọi lối vào dùng chung
  một hộp thoại. Bỏ lưới thẻ dự án trùng lặp ở cuối dashboard.
- **Sprint tạo được ✅:** trước đây `newSprint()` chỉ đặt tên `Sprint ${n+41}`,
  không ngày, không mục tiêu ⇒ mọi task nằm lì ở backlog. Nay có form đầy đủ
  (tên · mục tiêu · ngày bắt đầu/kết thúc, mặc định 2 tuần), sửa tại chỗ, nút
  **Bắt đầu/Kết thúc**, và **chọn nhiều task ở backlog rồi chuyển hàng loạt**.
  Backend `CreateSprint` nhận thêm `startDate`/`endDate` (validate `YYYY-MM-DD`
  và end ≥ start) để client chỉ cần **một** request.
- **Bảng màu dark + bo góc ✅:** `globals.css` — dark chuyển sang **xám trung tính**
  (#16181d…#333945) thay cho navy ám xanh; các nền nhấn (blue/green/red/orange) có
  nền tối + chữ sáng riêng; `bg-gray-900` (nút đen) đổi thành màu nhấn vì trước đó
  tàng hình trên nền tối; đổ bóng làm phẳng. Bo góc siết lại toàn cục
  (3xl 24→12px, 2xl 16→10px, xl 12→8px).
- **Lấp UI cho backend đã có ✅:** đối chiếu 141 handler với client và các trang:
  - **Webhook ra ngoài** → thẻ mới trong Cài đặt dự án (chọn sự kiện, secret HMAC,
    hiện `lastStatus`/`lastError`).
  - **Tệp SharePoint** → tab **Tệp** của dự án (breadcrumb, mở file trên web).
  - **Gửi báo cáo định kỳ** + **Nhật ký (audit)** → 2 tab trong `/reports`.
  - **Duyệt worklog** (`setWorklogState`) → hàng chờ duyệt trong `/timesheet` khi
    xem theo dự án; trước đây chỉ có nửa "trình duyệt", không có nơi để duyệt.
  - **Tạo label** ngay trong TaskDrawer (trước chỉ gán được label đã có ⇒ dự án mới
    kẹt vĩnh viễn ở "Chưa có label").
  - **Huỷ timer** (không ghi giờ) trên TimerWidget.
  - **Đánh dấu đọc từng thông báo**; mở chuông **không còn tự xoá sạch unread**.
  - `createWorkspace` (client) trùng chức năng `adminCreateWorkspace` — giữ nguyên,
    không phải thiếu UI.
- **Vá thêm khi kiểm thử ✅:** `AdminCreateWorkspace` thiếu `owner_id` trả về lỗi
  FK thô từ Postgres — nay mặc định lấy admin đang thao tác + validate tên.
  `ApiError` mang thêm `code` để UI rẽ nhánh theo mã máy (`no_folder`) thay vì so
  chuỗi tiếng Việt.
- **🔴 Hai lỗi chặn đường vào Sprint (phát hiện khi người dùng báo "không thấy
  sprint ở đâu") ✅:**
  1. **`TopBar` nhận `title`/`actions` nhưng không render** — hai prop được
     destructure rồi bỏ quên, nên **mọi nút hành động cấp trang của toàn app đều
     vô hình**: *Sprint mới*, *Dự án mới*, *Tạo mới*, *Xuất Tuần/Tháng*, *Trình
     duyệt*… Đây là lý do các nút "đã có trong code" nhưng không ai thấy trên màn
     hình. Nay thêm hàng header (tiêu đề trái · hành động phải), chỉ render khi có.
  2. **Trang Board thiếu `ProjectTabs`** — Board là trang đích khi bấm vào một dự
     án, và là **trang dự án duy nhất** không có thanh tab ⇒ vào dự án xong là
     cụt đường, không tới được Sprints/Timeline/Reports. Đồng thời breadcrumb ghi
     "Dashboard" và 3 link giả `href="#"` (Help Chat · Docs · Print) đã gỡ.
  **Guard:** thêm 2 e2e chặn tái diễn — Board phải có link tới `/sprints`,
  `/timeline`, `/files`; trang Sprints phải có nút *Sprint mới* mở form thật
  (mục tiêu · ngày bắt đầu · kết thúc). Selector dùng `href` thay vì tên hiển
  thị vì accessible name có kèm ligature icon ("view_kanban Board") và "Board"
  là con của "Dashboard".
- **DoD ✅** — `go build`/`vet`/`test` xanh; `tsc --noEmit` sạch; `next build` xanh
  (24 route); 19 unit test; **10/10 e2e pass**. Xác minh runtime trên backend riêng
  cổng 8081: tạo sprint kèm ngày, **chặn end<start và sai định dạng ngày**, chuyển
  task backlog→sprint, tạo/liệt kê webhook, tạo lịch gửi báo cáo, duyệt worklog,
  huỷ timer **không sinh worklog**. **Toàn bộ dữ liệu thử đã xoá sạch** (workspace
  scratch + user dev + user e2e), dữ liệu thật giữ nguyên: 1 workspace · 1 project ·
  4 task.

> **Bài học:** các mục trước đó được đánh dấu ✅ dựa trên "code có tồn tại" +
> build/typecheck xanh. Nhưng `TopBar` bỏ quên `actions` khiến cả lớp nút bấm
> không bao giờ hiển thị — **compile sạch không chứng minh người dùng nhìn thấy
> được**. E2E từ nay phải khẳng định *đường đi tới tính năng*, không chỉ khẳng
> định trang render.

---

## 3. Bảng ánh xạ Module → Phase

| Module (spec) | Hiện trạng | Phase hoàn thiện |
|---------------|-----------|------------------|
| 1. IAM | 🟡 SSO+RBAC tĩnh | A4, A5 → F (2FA/invite) |
| 2. Workspace/Project | 🟡 thiếu portfolio/template/budget | B, E |
| 3. Core Task | 🟡 thiếu deps/custom field/timer/status | A1, A2, B |
| 4. Views | 🟡 có 5 view cơ bản | C |
| 5. Reporting | ✅ dashboard·agile·digest | D |
| 6. Automation/Integration | ✅ rule v2·webhook·API·SCM | E |
| 7. Communications | ✅ noti·chat·realtime | A3, C |
| 8. NFR | ✅ real-time·dark·shortcut·test | C, F |

## 4. Rủi ro & lưu ý kỹ thuật
- **Azure/SharePoint chưa test creds thật** — smoke test sớm với 1 tenant.
- **6 bảng mồ côi (Phase A)** là nợ kỹ thuật rõ nhất; ưu tiên wire trước khi thêm schema mới.
- **Kỷ luật migration:** mọi đổi schema qua file `NNNN_*.sql` mới, không sửa file đã apply.
  Có 2 file trùng số 0011 (`0011_system_admin.sql`, `0011_task_participant_ids.sql`)
  nhưng **không gây lỗi**: runner (`db.Migrate`) khoá theo *tên file đầy đủ* và chạy
  theo thứ tự lexical, cả hai đều đã apply và được ghi nhận riêng trong
  `schema_migrations`. Vẫn nên tránh trùng số cho dễ đọc.
- **Tách Python** chỉ khi tải tính toán đủ lớn (Phase D/E) — giữ ranh giới: Go = source
  of truth + auth, Python = compute stateless.
