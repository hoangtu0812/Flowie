# Flowie — Kế Hoạch Triển Khai (PLAN)

Tài liệu này là **kế hoạch làm việc thực tế** cho Flowie, dựng lại từ việc rà soát
trực tiếp source code (backend Go, migrations, frontend Next.js) đối chiếu với 8
module trong `project_management_app_analysis.md`.

**Nguyên tắc:** Go là backend chính (source of truth + auth); Python là service phụ
(analytics/automation) chỉ khi tải tính toán đủ lớn. SSO Azure AD trước; file qua
SharePoint. Ưu tiên *vertical slice* — mỗi hạng mục chạy được end-to-end (DB → API → UI).

**Trạng thái:** ✅ hoàn chỉnh (DB+API+UI) · 🟡 một phần · 🧱 **chỉ có schema DB, chưa
đấu nối API/UI** · ⬜ chưa làm.

**Cập nhật:** 2026-07-25 — dựng lại từ rà soát code (thay cho ROADMAP cũ).

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

### Thiếu hoàn toàn ⬜ (chưa có DB lẫn code)
- Time tracking bấm giờ Start/Stop · Custom status per project · MoSCoW/RICE ·
  Sprint capacity · Project templates · trường Budget/Client · Portfolio CRUD.
- Burndown/Velocity · Custom dashboard/widget · Báo cáo tự động (email/Slack).
- WebSockets real-time · Webhooks out · tích hợp native (Slack/Teams/GitHub/Figma).
- 2FA/MFA · đa dạng phương thức đăng nhập · Desktop/Mobile app · keyboard shortcuts.

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

### A3. Chat (Module 7.2)
- Store + handler channel/message per project; read receipts.
- API: `GET/POST /projects/{id}/channels`, `GET/POST /channels/{id}/messages`.
- UI: panel chat trong project (polling trước; nâng real-time ở Phase C).
- **DoD:** hai user nhắn tin trong 1 project, thấy tin và unread count.

### A4. Session/Device Management (Module 1.1)
- Ghi `user_sessions` khi login (device, ip, last_seen); API xem/thu hồi.
- API: `GET /me/sessions`, `DELETE /me/sessions/{id}`.
- UI: Account › Sessions — danh sách thiết bị + "đăng xuất từ xa".
- **DoD:** thu hồi phiên làm cookie/token phiên đó vô hiệu ngay.

### A5. Custom Roles + Teams (Module 1.2 / 1.3)
- Custom Roles: CRUD role + tick permission; middleware kiểm tra permission
  (`task.create`, `budget.view`…) thay vì so role tĩnh.
- Teams: CRUD team, gán thành viên; cho phép assign/mention theo team.
- API: `GET/POST /workspaces/{id}/roles`, `/teams`; `PUT /members/{id}/role`.
- UI: Settings › Roles, Settings › Teams.
- **DoD:** user thuộc custom role bị chặn/cho phép đúng theo permission đã tick.

---

## Phase B — Task lõi còn thiếu (Module 3) ⬜

- **Custom Status per project (3.1):** bảng `workflow_statuses` (name, category
  todo/in_progress/done, order, wip_limit); Board render theo status của project.
- **Time tracking Start/Stop (3.3):** endpoint start/stop timer, ghi `worklog` với
  `source=timer`; widget đồng hồ trên task.
- **@mention trong comment (3.5):** parse `@user` → notification; đính kèm file (nối
  SharePoint, xem Phase E).
- **Prioritization (3.2):** trường MoSCoW/RICE; sắp xếp backlog theo điểm ưu tiên.
- **Sprint capacity (3.2):** tổng story point vs capacity team, cảnh báo quá tải.
- **DoD:** tạo status tuỳ biến + WIP limit; bấm giờ ra worklog; @mention bắn noti.

---

## Phase C — Views & Real-time (Module 4 + NFR) ⬜

- **List View đầy đủ:** group-by / filter / sort / inline edit + ảo hoá dòng
  (virtualization) cho backlog lớn.
- **Kanban nâng cấp:** kéo-thả thật (dnd-kit), WIP limit, swimlane.
- **Gantt/Timeline:** vẽ dependencies + **Critical Path** (tính CPM ở backend).
- **Workload:** cảnh báo >8h/ngày, kéo task sang người rảnh.
- **Saved Views:** `saved_views` (filter/sort/group JSON) per user/project.
- **Real-time:** WebSocket hub (Go) + (tuỳ chọn) Redis pub/sub; broadcast thay đổi
  task/comment/chat; optimistic UI. → nâng cấp Chat (A3) lên real-time.
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

### D2. Còn lại ⬜
- **Agile reports:** Burndown, Velocity (từ sprint + worklog).
- **Custom Dashboards:** `dashboards`, `widgets` (type/query/layout JSON): pie theo
  status, bar theo assignee, line tiến độ.
- **Tài chính:** mở rộng cost hiện có — estimate vs actual, chi phí theo sprint/người.
- **Báo cáo tự động:** cron gửi Daily/Weekly qua Email/Slack.
- **Kiến trúc:** phần aggregate nặng (burndown/forecast) có thể tách service Python
  (FastAPI + pandas) đọc read-replica; Go giữ CRUD/auth.
- **DoD:** burndown/velocity đúng số; dashboard kéo-thả widget; email đúng lịch.

---

## Phase E — File, Automation nâng cao & Integrations (Module 3.5 + 6) ⬜

- **File SharePoint đầy đủ:** upload session chunked (>4MB), đính kèm theo task
  (`04_Tasks/<KEY-123>/`), trình duyệt file, bảng `attachments`; siết `Sites.Selected`.
- **Automation engine:** nâng rule MVP thành **Trigger → Condition → Action** (JSON
  DSL); nhiều loại action (assign, đổi status, gửi noti, tạo subtask).
- **Public API + Webhooks out:** API key/OAuth cho bên thứ ba; webhook khi sự kiện.
- **Native integrations:** Slack/MS Teams (noti), GitHub/GitLab (link commit/PR ↔
  task), Figma.
- **DoD:** upload file vào task hiện trên SharePoint; rule đa điều kiện chạy đúng;
  webhook bắn khi task đổi trạng thái.

---

## Phase F — Bảo mật, Compliance & Đa nền tảng (NFR) ⬜

- **Auth nâng cao:** 2FA/MFA (TOTP), refresh token luân phiên, invite qua email.
- **Bảo mật:** audit log, mã hoá at-rest, secrets qua Key Vault, rà soát OWASP.
- **Compliance:** GDPR (export/xoá dữ liệu), chuẩn bị SOC2.
- **Quan sát:** metrics (Prometheus), tracing (OTel), structured logs.
- **CI/CD:** GitHub Actions (lint, test, build, migrate check), staging.
- **Đa nền tảng:** Desktop (Electron), Mobile (React Native/Expo), Dark/Light mode,
  keyboard shortcuts.
- **Test:** unit (store/handlers), integration (testcontainers), e2e (Playwright).
- **DoD:** CI xanh; export/xoá dữ liệu chạy; bản desktop đóng gói chạy.

---

## 3. Bảng ánh xạ Module → Phase

| Module (spec) | Hiện trạng | Phase hoàn thiện |
|---------------|-----------|------------------|
| 1. IAM | 🟡 SSO+RBAC tĩnh | A4, A5 → F (2FA/invite) |
| 2. Workspace/Project | 🟡 thiếu portfolio/template/budget | B, E |
| 3. Core Task | 🟡 thiếu deps/custom field/timer/status | A1, A2, B |
| 4. Views | 🟡 có 5 view cơ bản | C |
| 5. Reporting | 🟡 chỉ cost cơ bản | D |
| 6. Automation/Integration | 🟡 automation MVP | E |
| 7. Communications | 🟡 noti xong, chat 🧱 | A3, C |
| 8. NFR | ⬜ | C (real-time), F |

## 4. Rủi ro & lưu ý kỹ thuật
- **Azure/SharePoint chưa test creds thật** — smoke test sớm với 1 tenant.
- **6 bảng mồ côi (Phase A)** là nợ kỹ thuật rõ nhất; ưu tiên wire trước khi thêm schema mới.
- **Kỷ luật migration:** mọi đổi schema qua file `NNNN_*.sql` mới, không sửa file đã apply.
  Lưu ý có **2 migration trùng số 0011** (`0011_system_admin.sql` và
  `0011_task_participant_ids.sql`) — cần đánh số lại để tránh xung đột thứ tự apply.
- **Tách Python** chỉ khi tải tính toán đủ lớn (Phase D/E) — giữ ranh giới: Go = source
  of truth + auth, Python = compute stateless.
