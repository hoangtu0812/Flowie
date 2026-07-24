# Flowie — Roadmap Triển Khai Chi Tiết

Tài liệu này chia việc xây dựng Flowie thành các **giai đoạn (phase)** có thể giao
được, ánh xạ tới 8 module trong `project_management_app_analysis.md`. Mỗi phase có
mục tiêu, hạng mục công việc, thay đổi schema/API, và tiêu chí hoàn thành (DoD).

**Nguyên tắc:** Go là backend chính; Python là service phụ (analytics/automation)
khi cần. SSO Azure AD trước; file qua SharePoint (auto subfolder). Ưu tiên vertical
slice — mỗi phase chạy được end-to-end (API + UI).

**Chú thích trạng thái:** ✅ xong · 🟡 một phần · ⬜ chưa làm.

> **Cập nhật 2026-07-24 (Update 2):** Đã điều chỉnh toàn bộ UI theo thiết kế mới (Sidebar, Topbar, Project List View, Calendar View).
> Đã khởi tạo cấu trúc DB (Migrations) cho các tính năng còn thiếu trong Roadmap:
> - **Phase 1**: Custom Roles, Teams, User Sessions, User Rates (`0010_iam_advanced.sql`)
> - **Phase 2 & 3**: Custom Fields, Task Dependencies (`0008_custom_fields_deps.sql`)
> - **Phase 6 & 7**: Chat Channels, Chat Messages, WebSockets chuẩn bị (`0009_chat.sql`)
> Còn follow-up: Đấu nối API Go handlers cho các module vừa migrate và hoàn thiện Frontend binding. Azure/SharePoint chưa test creds thật.

---

## Phase 0 — Nền tảng & Hạ tầng ✅ (đã xong, Milestone 1)

**Mục tiêu:** khung dự án chạy được, có auth và phân cấp dữ liệu cốt lõi.

| Hạng mục | Trạng thái |
|----------|-----------|
| Monorepo (backend Go, frontend Next.js, docker-compose, .env) | ✅ |
| PostgreSQL + migration runner (embed) | ✅ |
| Azure AD SSO (OIDC login/callback/session JWT cookie) | ✅ (chưa test creds thật) |
| RBAC Workspace/Project + membership checks | ✅ |
| CRUD Workspace → Project → Task | ✅ |
| SharePoint Graph client + auto folder tree | ✅ (chưa test creds thật) |
| Frontend: login, workspace, project Kanban | ✅ |
| Dev tooling: `run.ps1`, `cmd/devtoken`, healthcheck | ✅ |

**DoD:** `go build`/`vet` sạch, `npm run build` pass, luồng tạo WS→Project→Task→đổi
status verified qua HTTP, RBAC chặn người ngoài (404). ✅

---

## Phase 1 — Hoàn thiện IAM & Nền tảng vận hành ⬜

**Mục tiêu:** biến auth/RBAC thành production-ready, sẵn cho nhiều người dùng.

### Backend
- **Session management (Module 1.1):** bảng `sessions` (device, IP, user-agent,
  last_seen), API xem/thu hồi phiên từ xa, refresh token luân phiên.
- **Custom Roles + quyền chi tiết (Module 1.2):** bảng `roles`, `permissions`,
  `role_permissions`; middleware kiểm tra permission thay vì so role tĩnh.
  Permission dạng `task.create`, `budget.view`, `comment.delete`…
- **Team/Department (Module 1.3):** bảng `teams`, `team_members`; assign/mention
  theo team.
- **Invite flow:** mời user vào workspace qua email (token), gán role khi accept.
- Refactor `RoleForUser` → `PermissionsForUser` (cache theo request).

### Frontend
- Trang **Settings › Members**: mời, đổi role, xoá thành viên.
- Trang **Settings › Roles**: tạo custom role, tick permission.
- Trang **Account › Sessions**: danh sách thiết bị, nút "đăng xuất từ xa".

### Schema/API mới
- `POST /workspaces/{id}/invites`, `POST /invites/{token}/accept`
- `GET/POST /workspaces/{id}/roles`, `GET /workspaces/{id}/members`
- `GET /me/sessions`, `DELETE /me/sessions/{id}`

**DoD:** mời được người mới, tạo custom role và người dùng role đó bị chặn/cho phép
đúng theo permission; thu hồi phiên làm token cũ vô hiệu.

---

## Phase 2 — Core Task Management nâng cao (Module 3) ⬜

**Mục tiêu:** task đủ giàu cho công việc thực tế.

### 2A. Cấu trúc & tương tác task
- **Rich fields:** description markdown, multiple assignees (`task_assignees`),
  labels/tags (`labels`, `task_labels`), start/due đã có.
- **Phân cấp Epic → Task → Sub-task → Checklist:** `parent_task_id` đã có; thêm
  `checklists`, `checklist_items`.
- **Custom Status per project (Module 3.1):** bảng `workflow_statuses`
  (project_id, name, category todo/in_progress/done, order, wip_limit).
- **Comments (Module 3.5):** `comments` (mention, attachment ref), `@mention`
  parse → notification.
- **Activity log:** `activity_events` (actor, entity, verb, diff, at) — ghi mọi
  thay đổi task.
- **Dependencies (Module 3.4):** `task_dependencies` (blocks/blocked_by) + cảnh báo.
- **Custom Fields (Module 3.4):** `custom_field_defs` (type text/number/dropdown/
  url/date/formula), `custom_field_values` (JSONB).

### 2B. Agile: Backlog & Sprints (Module 3.2)
- `sprints` (project_id, name, goal, start, end, state), `story_points` đã có.
- Backlog view + kéo thả task vào sprint; MoSCoW/RICE priority fields.
- Sprint capacity = tổng story point vs capacity team.

### 2C. Worklog & Timesheet (Module 3.3)
- `worklogs` (task_id, user_id, minutes, note, started_at, source timer/manual).
- Timer start/stop endpoint; nhập tay; **timesheet** tổng hợp theo ngày/tuần.
- **Submit for approval:** trạng thái worklog draft→submitted→approved (cho PM duyệt).

### Frontend
- Task detail drawer: description editor, checklist, comments, activity, custom fields.
- Backlog + Sprint board; timesheet grid.

**DoD:** tạo sprint, kéo task vào, log giờ, PM duyệt timesheet; comment @mention bắn
notification; dependency chặn cảnh báo đúng.

---

## Phase 3 — Hệ thống Views (Module 4) ⬜

**Mục tiêu:** cùng dữ liệu, nhiều góc nhìn. Chú trọng hiệu năng (virtualization).

- **List View:** bảng có group-by / filter / sort / inline edit; ảo hoá dòng.
- **Kanban:** nâng cấp bản hiện tại — kéo-thả thật (dnd-kit), WIP limit, swimlane.
- **Gantt/Timeline:** thư viện (vis-timeline / custom SVG); vẽ dependencies +
  Critical Path (tính CPM ở backend).
- **Calendar View:** theo due/start date.
- **Workload View:** dựa worklog + estimation, cảnh báo >8h/ngày, kéo task sang
  người rảnh.
- **Saved Views:** `saved_views` (filter/sort/group JSON) per user/project.

### Backend
- Query builder linh hoạt cho filter/sort (an toàn, whitelist cột) + phân trang keyset.
- Endpoint `GET /projects/{id}/tasks` nhận query params filter/sort/group.
- WebSocket cho cập nhật real-time (xem Phase 6).

**DoD:** 4 view render mượt với vài nghìn task; Gantt hiển thị dependency + critical
path; workload cảnh báo quá tải.

---

## Phase 4 — Tích hợp File SharePoint đầy đủ (Module 3.5 + hạ tầng) ⬜

**Mục tiêu:** đính kèm/duyệt file thật trên SharePoint (mở rộng nền tảng Phase 0).

- **Upload lớn:** upload session Graph (>4MB, chunked) thay PUT đơn.
- **Đính kèm theo task:** tạo `04_Tasks/<KEY-123>/` khi task cần file; bảng
  `attachments` (task_id, drive_item_id, name, size, web_url).
- **Trình duyệt file:** UI liệt kê/duyệt/tải file từ folder project/task.
- **Đồng bộ ngược (tuỳ chọn):** Graph webhook (subscription) để phát hiện file thêm
  trực tiếp trên SharePoint → cập nhật metadata.
- **Retry/queue:** hàng đợi tạo folder khi Graph lỗi lúc tạo WS/Project (hiện best-
  effort, chỉ log) → job nền đồng bộ lại.
- **Sites.Selected:** siết quyền xuống site cụ thể thay vì `.All`.

**DoD:** upload file vào task hiển thị trên SharePoint đúng cây thư mục; file thêm
trên SharePoint xuất hiện trong app (nếu bật webhook).

---

## Phase 5 — Reporting, Dashboard & Tài chính (Module 5) ⬜  ← ứng viên tách Python

**Mục tiêu:** đo lường hiệu suất và chi phí.

- **Custom Dashboards:** `dashboards`, `widgets` (type, query, layout JSON).
- **Widget:** pie (task theo status), bar (theo assignee), line (tiến độ).
- **Agile reports:** Burndown, Velocity (từ sprint + worklog).
- **Báo cáo tài chính:** cost = Σ worklog_minutes × hourly_rate (bảng
  `user_rates`); estimate vs actual.
- **Báo cáo tự động:** cron gửi Daily/Weekly qua Email/Slack.

> **Kiến trúc:** phần tổng hợp nặng (aggregate, burndown, forecast) nên tách thành
> **`analytics/` service Python** (FastAPI + pandas), đọc read-replica Postgres,
> expose REST cho Go gọi hoặc frontend gọi trực tiếp qua gateway. Go vẫn giữ CRUD
> và auth; Python chỉ tính toán.

**DoD:** dashboard kéo-thả widget; burndown/velocity đúng số; báo cáo chi phí khớp
worklog; email tự động gửi đúng lịch.

---

## Phase 6 — Real-time, Automation & Tích hợp (Module 6 + 7 + NFR) ⬜

### 6A. Real-time (NFR)
- **WebSocket hub** (Go: gorilla/nhooyr) + Redis pub/sub; broadcast thay đổi
  task/comment tới client trong project.
- Optimistic UI + reconcile.

### 6B. Notifications & Chat (Module 7)
- `notifications` (user_id, type, entity, read_at); Inbox/Notification Center có
  lọc "được nhắc" / "quá hạn".
- Chat nhóm per project (`channels`, `messages`) — có thể tái dùng WebSocket hub.

### 6C. Automation (Module 6.1) ← ứng viên Python
- **Rule engine Trigger → Condition → Action:** `automation_rules` (JSON DSL).
- Ví dụ: task → "QA" thì auto-assign QA + mention.
- Chạy bằng worker (Go) hoặc **service Python** cho DSL/branch phức tạp.

### 6D. API & Integrations (Module 6.2/6.3)
- **REST API công khai** + API key/OAuth cho bên thứ ba (đồng bộ ERP).
- **Webhooks out** cho sự kiện.
- Native: Slack, MS Teams, GitHub/GitLab (link commit/PR ↔ task), Figma.

**DoD:** hai client thấy thay đổi real-time; rule tự động chạy đúng; webhook out
bắn khi task đổi trạng thái; tích hợp Slack post thông báo.

---

## Phase 7 — Bảo mật, Compliance & Đa nền tảng (NFR) ⬜

- **Bảo mật:** rate limiting, audit log truy cập, mã hoá at-rest (Postgres TDE/
  disk), secrets qua Key Vault; rà soát OWASP.
- **Compliance:** GDPR (export/xoá dữ liệu người dùng), chuẩn bị SOC2 (audit trail,
  least privilege).
- **Quan sát:** structured logs (đã có slog), metrics (Prometheus), tracing (OTel),
  health/readiness.
- **CI/CD:** GitHub Actions (lint, test, build, migrate check, docker push), staging.
- **Đa nền tảng:** Desktop (Electron wrap frontend), Mobile (React Native/Expo dùng
  chung API), Dark/Light mode + keyboard shortcuts (power-user).
- **Test:** unit (store/handlers), integration (testcontainers Postgres), e2e
  (Playwright).

**DoD:** pipeline CI xanh; export/xoá dữ liệu người dùng hoạt động; app đóng gói
desktop chạy; coverage mục tiêu đạt.

---

## Bảng ánh xạ Module → Phase

| Module (spec) | Phase |
|---------------|-------|
| 1. IAM | 0 (cơ bản) → 1 (đầy đủ) |
| 2. Workspace/Project | 0 |
| 3. Core Task | 0 (cơ bản) → 2 (đầy đủ) → 4 (file) |
| 4. Views | 3 |
| 5. Reporting | 5 |
| 6. Automation/Integration | 6 |
| 7. Communications | 6 |
| 8. NFR | xuyên suốt → 7 (đóng gói) |

## Đề xuất thứ tự thực hiện tiếp theo
1. **Phase 2A** (task giàu: status tuỳ biến, comment, activity, checklist) — giá trị
   sử dụng cao nhất, xây trên nền đã có.
2. **Phase 3** (List + Kanban DnD thật) — trải nghiệm rõ rệt.
3. **Phase 1** (custom roles, invite) khi bắt đầu có nhiều người dùng thật.
4. **Phase 4** (file SharePoint đầy đủ) khi cần đính kèm.
5. Sau đó Phase 5/6/7 theo nhu cầu vận hành.

## Rủi ro & lưu ý kỹ thuật
- **Azure/SharePoint chưa test creds thật** — ưu tiên smoke test sớm với 1 tenant.
- **Next transitive CVE** (`postcss`/`sharp`) — theo dõi bản Next mới để nâng.
- **Tách Python** chỉ khi tải tính toán đủ lớn (Phase 5/6) — tránh phức tạp sớm;
  giữ ranh giới rõ: Go = source of truth + auth, Python = compute stateless.
- **Migration kỷ luật:** mọi đổi schema qua file `NNNN_*.sql`, không sửa file cũ đã
  apply.
