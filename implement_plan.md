# Kế hoạch triển khai Circle thành Project Management Platform hoàn chỉnh

> **Trạng thái bàn giao cập nhật: 2026-08-24**  
> Đây là phần phải đọc đầu tiên khi agent khác tiếp tục công việc. Các checkbox trong kế hoạch
> lịch sử phía dưới chưa được dùng làm nguồn trạng thái; bảng kiểm ở phần này mới là trạng thái
> thực tế đã xác minh bằng source, test và Docker.

## Quy ước bắt buộc

1. Baseline giao diện là `upstream/master` của `ln-dev7/circle`.
2. Không thiết kế lại màn hình. Giữ nguyên component tree, khoảng cách, bảng, panel, popover và
   dark/light theme của UI gốc; chỉ thay record mock và action giả bằng API/backend.
3. Chỉ thêm loading/error/empty state hoặc control thật cho tính năng UI gốc chưa có action.
4. `mock-data` chỉ được giữ làm type/presentation catalog (icon, màu, priority/status metadata),
   không được dùng làm record nghiệp vụ runtime.
5. Agent và Code Reviews đang cố ý unavailable; không dùng canned response/review fixture.
6. Không có Slack, email và desktop app. Discord là kênh notification/integration đang hỗ trợ.
7. Hoàn thành một lát chức năng phải build/test, rebuild Docker từ cache, commit và push lên
   `origin/codex/foundation`.

## Tiến độ thực tế

### Đã nối backend và giữ cấu trúc UI gốc

- Authentication: register/login/refresh/logout, route protection, profile thật.
- Platform admin: tài khoản bootstrap và giao diện quản trị người dùng/workspace.
- Workspace, Teams, Members: danh sách, tạo/sửa team, thành viên và phân quyền cơ bản.
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
  labels, milestones, templates, statuses, favorite theo user và project settings.
- Initiatives: list/detail/create/update/archive, project links, real progress chart, resources,
  updates và activity; Settings Initiatives đã thay placeholder bằng CRUD thật.
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

### Kiểm tra gần nhất

- API Jest: **20 suites, 44 tests passed** trong Docker image, gồm validation Ask, workflow
  chuyển Ask thành Issue thật, Pulse, Emoji, personal state, move và classification của Issue.
- NestJS build: passed.
- Next.js 15 production build: passed.
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
- Audit frontend đã đối chiếu **308 file baseline** trong `app/components/hooks/lib/store` với
  `upstream/master`. Đã xóa 18 component `real-*` rút gọn không còn route nào dùng; runtime chỉ
  còn cây component gốc được nối API.
- Docker dependency install dùng cache; không tải package mới trong các checkpoint trên.
- Audit runtime mới nhất không còn route dùng `SettingsPlaceholder` và không còn import mảng
  record nghiệp vụ mock; các import từ `mock-data` chỉ còn type hoặc catalog icon/màu/status.
- Lưu ý môi trường host hiện thiếu binary `jest`/`prettier` trong `node_modules`, dù lockfile có
  khai báo; không cài lại package chỉ để chạy test vì Docker build đã kiểm tra compile bằng đúng
  dependency graph. DTO spec cho Issue Templates đã được thêm để chạy ở lần cài dependency đầy đủ.

## Phần chưa hoàn thành — không được đánh dấu là đã triển khai

| Ưu tiên | Phần còn lại | Trạng thái/chỉ dẫn |
| --- | --- | --- |
| P0 | Visual parity toàn route | So sánh từng route với `upstream/master`; visual acceptance cần một phiên đăng nhập workspace-member. Phiên browser kiểm thử hiện chưa đăng nhập nên mới xác nhận được route guard/login, chưa chụp được các màn hình nội bộ. |
| P1 | Issue actions còn thiếu | Convert-to-comment còn cần semantics/backend. Duplicate/Won't Fix, move team, favorite và reminder đã hoàn thành; taxonomy issue type không có control tương ứng trong UI gốc hiện tại. |
| P1 | Team settings nâng cao | Cycle cadence, triage, auto-close/archive, hierarchy và template defaults chưa có schema; UI hiện ghi Unavailable. |
| P1 | Account security | Session management, passkeys, personal API keys và signing keys chưa có backend. |
| P1 | Project extras | Favorite project đã hoàn thành. Attachment cho project update chưa có persistence. |
| P2 | Automation/webhook | Worker/Redis foundation có, nhưng rule builder, persisted automation và generic webhook chưa hoàn chỉnh. |
| P2 | OAuth/enterprise identity | Google, Microsoft Entra, OIDC/SAML chưa triển khai; local email/password đang hoạt động. |
| Excluded | AI Agent, Code Reviews | Cố ý unavailable theo phạm vi sản phẩm hiện tại; fixture/canned-response cũ đã được xóa khỏi source. |

## Thứ tự tiếp tục đề xuất

1. Tạo user workspace-member/phiên test và chụp đối chiếu các route chính với UI gốc.
2. Bổ sung attachment cho Project Update, sau đó xác định semantics cho Convert-to-comment.
3. Hoàn thiện team automation/cycle policy và Account Security.
4. Tiếp tục audit visual bằng phiên workspace-member và ghi lại screenshot acceptance cho từng route.

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
