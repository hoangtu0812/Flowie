# Flowie — Kế hoạch thực thi dành cho Terra

> **Đây là nguồn trạng thái và kế hoạch duy nhất cần đọc.**
> Tài liệu cũ đã chuyển vào `docs/history/`; chỉ đọc khi cần tra lịch sử.

## 0. Chỉ thị ngắn để giao Terra

Terra hãy tiếp tục repository Flowie từ branch `codex/foundation`. Mục tiêu không phải viết lại
frontend. Hãy dùng clone Circle local tại
`C:\Users\Hoang Tu\Desktop\BSR\1. Source Code\circle`, commit `7785985`, làm chuẩn tuyệt đối cho
UI. Khôi phục frontend theo từng route, bắt đầu với Project, và chuyển mọi request/mapping ra lớp
`features/<domain>`. Chỉ thay dữ liệu mock/no-op bằng backend thật; không thay JSX, `className`,
component tree hoặc interaction pattern nếu không bắt buộc. Mỗi lát phải test, so sánh light/dark,
rebuild Docker khi người dùng đang dùng 5G, commit và push riêng.

## 1. Mục tiêu cuối cùng

Biến UI gốc `ln-dev7/circle` thành Flowie — hệ thống quản lý nhiều loại dự án có backend thật —
với các điều kiện đồng thời:

1. UI nhìn và hoạt động giống Circle baseline tại commit `7785985`.
2. Record nghiệp vụ đến từ NestJS API/PostgreSQL, không từ fixture hoặc local state giả.
3. Mutation phải lưu thật, giữ nguyên sau refresh/restart Docker và tuân thủ workspace/RBAC.
4. Auth, admin, worker, Redis, MinIO và Docker hiện có tiếp tục hoạt động.
5. Startup trong mạng nội bộ không cài package, không pull image và không build lại.
6. Mỗi phần hoàn chỉnh được commit/push lên `origin/codex/foundation`.

## 2. Quy tắc không được vi phạm

- Baseline UI: `C:\Users\Hoang Tu\Desktop\BSR\1. Source Code\circle` (`7785985`).
- Không tự thiết kế lại bảng, card, panel, sidebar, header, popover, dialog hoặc empty state.
- Không thêm control vào list chỉ vì backend có field. Chỉ dùng affordance đã có trong UI gốc.
- Dialog bổ sung chỉ được mở từ affordance gốc chưa có action; không làm thay đổi màn hình khi đóng.
- Không import `@/mock-data` và không copy thư mục `mock-data` vào production.
- Không tạo user/team/project giả trong adapter để lấp field null. Dùng nullable/empty presentation
  hợp lệ của UI.
- Không đặt `fetch`, API DTO hoặc mapper lớn trong `components/common/**` hay header/sidebar.
- Không khôi phục banner quảng cáo open-source/Vercel/GitHub đã được người dùng yêu cầu bỏ.
- Agent và Code Reviews không có backend: không mang canned data trở lại.
- Slack, email, desktop notification không hỗ trợ; Discord là integration outbound thật.
- Không dùng `git reset --hard`, `git checkout --` hoặc copy đè toàn bộ `apps/web`.
- Trước khi install dependency, pull image hoặc rebuild Docker, phải báo người dùng chuyển 5G.

## 3. Trạng thái repository đã xác minh

| Hạng mục            | Giá trị                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| Workspace           | `C:\Users\Hoang Tu\Desktop\BSR\1. Source Code\Flowie`                         |
| Branch              | `codex/foundation`                                                            |
| Remote              | `https://github.com/hoangtu0812/Flowie.git`                                   |
| Baseline Circle     | commit `778598503e680b4c658d694dd9f65351ee48b3d3`                             |
| Checkpoint backend  | `3329f5b` — persisted Issue Label Groups                                      |
| Checkpoint kế hoạch | `91219ec` — audit và quyết định UI rebase                                     |
| Stack               | Next.js 15.2.8, NestJS, Prisma/PostgreSQL, Redis, MinIO, BullMQ worker        |
| Web/API             | `http://localhost:3000`, `http://localhost:4000/api/v1`                       |
| Health              | `http://localhost:4000/api/v1/health`                                         |
| Test gần nhất       | API **55 suites / 182 tests passed**; API/Web lint và production build passed |
| Docker gần nhất     | API/Web rebuilt; health và login HTTP 200                                     |
| Migration gần nhất  | `20260825030000_label_groups` đã apply trong PostgreSQL                       |

Worktree phải được kiểm tra lại bằng `git status --short` trước khi Terra sửa file. Không giả định
worktree sạch dựa trên tài liệu này.

## 4. Kết luận audit UI hiện tại

Clone local là repository Circle gốc và trùng `upstream/master`.

| Thư mục baseline | Tổng file | Giống hoàn toàn | Đã thay đổi | Thiếu |
| ---------------- | --------: | --------------: | ----------: | ----: |
| `app`            |        63 |              32 |          28 |     3 |
| `components`     |       221 |              64 |         144 |    13 |
| `hooks`          |         1 |               1 |           0 |     0 |
| `lib`            |         3 |               1 |           2 |     0 |
| `store`          |        20 |               8 |          10 |     2 |
| `public`         |         4 |               4 |           0 |     0 |

Riêng `components/common/projects` lệch khoảng **3.282 dòng thêm / 504 dòng xóa**. Nguyên nhân
chính là fetch, DTO, mapper và mutation được nhét trực tiếp vào component trình bày. Không tiếp tục
vá từng điểm trên cấu trúc này.

Các phần Project shell đã giống baseline hoặc chỉ có ngoại lệ hợp lệ:

- `app/[orgId]/projects/page.tsx`: giống baseline.
- `components/layout/main-layout.tsx`: giống baseline.
- Project header/header-options: giống baseline.
- `nav-workspace.tsx`: giống baseline.
- `app-sidebar.tsx`: khác vì đã bỏ banner quảng cáo — phải giữ khác biệt này.
- `nav-teams.tsx` và `org-switcher.tsx`: khác do dữ liệu/auth thật; phải giữ presentation gốc và
  chuyển logic sang hook/provider.

## 5. Backend hiện có — không viết lại trước khi đấu UI

Project backend đã đủ cho lát ưu tiên:

- Project list/create/get/update/archive.
- Status, priority, health, lead, team, start/target date, labels.
- Project issues, updates, attachments, resources.
- Members, milestones, favorite, subscription.
- Initiative links và custom-field values.
- Settings: project labels, statuses, templates, properties, update feed/display defaults.
- Workspace members và teams dùng làm option thật.

API chính nằm tại `apps/api/src/projects`, `apps/api/src/portfolio`, `apps/api/src/issues`,
`apps/api/src/workspace` và Prisma schema tại `packages/database/prisma/schema.prisma`.

Chỉ bổ sung backend khi một affordance tồn tại trong baseline nhưng không có contract thật. Trước
khi thêm schema/API, Terra phải ghi rõ affordance nào chứng minh nhu cầu đó.

## 6. Kiến trúc frontend đích

Mỗi domain dùng cấu trúc sau:

```text
apps/web/features/projects/
├── api.ts                 # HTTP request/response, credentials, error mapping
├── adapters.ts            # API record -> UI shape của Circle
├── types.ts               # API types, không chứa record
├── context.tsx            # data/action context khi nhiều component con dùng chung
└── hooks/
    ├── use-projects.ts
    └── use-project.ts
```

`apps/web/components/**` phải gần baseline nhất có thể:

- giữ nguyên JSX và `className`;
- nhận record/callback qua props hoặc context;
- không biết URL API, workspace loader hoặc JSON DTO;
- selector có thể nhận option/callback thật nhưng không đổi DOM/class khi đóng.

## 7. Backlog thực thi — làm đúng thứ tự

### T0 — Baseline guard và báo cáo diff

Mục tiêu: mọi thay đổi UI sau này có bằng chứng so với clone gốc.

Việc làm:

1. Tạo script read-only `scripts/audit-ui-parity.ps1` nhận hai tham số baseline/current.
2. Script báo `IDENTICAL/CHANGED/MISSING/EXTRA` theo route/domain và xuất summary JSON hoặc Markdown.
3. Có allowlist rõ ràng cho auth/admin, banner quảng cáo bị bỏ và file `features/**` mới.
4. Không tự động sửa/copy file.

Nghiệm thu:

- chạy được với baseline local và `apps/web`;
- output tái lập được;
- không cần Internet;
- commit: `chore: add circle ui parity audit`.

### T1 — Project List: khôi phục UI gốc và tách adapter

Đây là lát đầu tiên để người dùng chạy thử.

File baseline phải đọc trực tiếp trước khi sửa:

- `components/common/projects/projects.tsx`
- `projects-list.tsx`, `project-line.tsx`, `projects-board.tsx`
- `projects-timeline.tsx`, `projects-insights-panel.tsx`
- `health-popover.tsx`, `priority-selector.tsx`, `lead-selector.tsx`
- `status-with-percent.tsx`, `date-picker.tsx`
- `components/layout/headers/projects/**`

Việc làm:

1. Chuyển toàn bộ API type, `mapStatus`, `mapProject`, workspace/member/team loading và PATCH ra
   `features/projects/**`.
2. Khôi phục `projects.tsx` về composition gốc; container chỉ lấy hook result rồi truyền data.
3. Khôi phục `projects-list.tsx` về props `groups` như baseline; dùng context cho action chung.
4. Khôi phục `project-line.tsx` về DOM/class baseline.
5. Xóa `ProjectLabelSelector` khỏi Project List vì baseline chỉ hiển thị label, không có nút chỉnh
   label trong row. Việc gán label tiếp tục qua affordance gốc ở Project detail.
6. Selector status/priority/lead/date dùng option thật và PATCH thật nhưng giữ trigger/menu gốc.
7. Không tạo user `Unassigned` giả trong adapter; xử lý lead null bằng empty presentation.
8. Giữ list/board/timeline/insights, grouping/filter/order/display options như baseline.
9. Nút Create Project gốc gọi backend qua dialog hiện hữu; chuyển fetch ra feature service.

Contract dữ liệu tối thiểu:

- `GET /projects?workspaceId=...`
- `GET /projects/statuses`, `/projects/labels`
- `GET /teams`, `/workspaces/:id/members`
- `PATCH /projects/:id?workspaceId=...`
- `POST /projects`

Nghiệm thu:

- list có dữ liệu thật và empty state đều giống baseline;
- create/update survive refresh;
- không có mock import;
- audit script cho thấy mọi class/DOM khác biệt đều được giải thích;
- light/dark screenshot ở cùng viewport;
- commit: `refactor: restore original project list with api adapter`.

### T2 — Project Detail: Overview, Activity, Issues và Peek

File baseline bắt buộc:

- `components/common/projects/project-peek-panel.tsx`
- `components/common/projects/details/**`
- `components/layout/headers/project/**`
- ba route `app/[orgId]/project/[projectId]/**`

Việc làm:

1. Tạo `useProject(projectId)` và adapter detail riêng.
2. Khôi phục title, property rows, description, right panel và tab composition gốc.
3. Nối status, priority, lead, dates, team và description qua PATCH.
4. Nối update, attachment, resource, milestone, member, initiative và label từ affordance gốc.
5. Issues tab dùng Issue API thật; Activity dùng Project Update/Activity thật.
6. Không render row mới nếu baseline không có; row optional chỉ hiện theo điều kiện baseline.

Nghiệm thu:

- mọi mutation survive refresh;
- project ID khác workspace trả đúng 403/404;
- overview/activity/issues/peek screenshot light/dark;
- commit: `refactor: restore original project detail with api adapter`.

### T3 — Project Settings

Phạm vi:

- Project labels.
- Project statuses.
- Project templates.
- Project properties/custom fields.
- Project updates/display defaults.

Việc làm:

1. Khôi phục từng settings component từ baseline.
2. Tách request/mapping ra `features/project-settings/**`.
3. Dùng list/card/dialog/empty state gốc; không tạo trang quản trị mới.
4. Kiểm tra OWNER/ADMIN cho mutation; member thường chỉ đọc theo contract.
5. Project label group vẫn unavailable nếu chưa có schema riêng; không dùng Issue Label Group thay
   thế sai domain.

Nghiệm thu:

- CRUD thật, reload không mất dữ liệu;
- RBAC test;
- screenshot từng màn chính;
- commit: `refactor: restore original project settings with live data`.

### T4 — Nghiệm thu Project trước khi sang domain khác

Checklist bắt buộc:

- [ ] Project List light/dark parity.
- [ ] List, board, timeline và insights dùng cùng dữ liệu thật.
- [ ] Create/edit/archive hoạt động.
- [ ] Project Detail Overview/Activity/Issues/Peek hoạt động.
- [ ] Project Settings CRUD hoạt động.
- [ ] Không import mock record.
- [ ] API tests, Web/API lint/build passed.
- [ ] Docker API/Web chạy image mới; health/login HTTP 200.
- [ ] Người dùng chạy thử và xác nhận Project trước khi chuyển domain.

Commit tài liệu nghiệm thu: `docs: record project ui rebase acceptance`.

### T5 — Các domain tiếp theo

Chỉ bắt đầu sau T4:

1. Teams + Issues + Cycles.
2. Initiatives + Views + Members + Documents.
3. Profile/Security/Notifications/Discord và Settings còn lại.
4. Audit toàn route và loại mọi record mock/no-op còn lại.

Mỗi domain lặp lại pattern: baseline → feature adapter → test → screenshot → Docker → commit/push.

## 8. Verification commands

Không cần mạng:

```powershell
git status --short
rg -n "@/mock-data" apps/web -g "*.ts" -g "*.tsx"
pnpm --filter @circle/api run test -- --runInBand
pnpm --filter @circle/api lint
pnpm --filter @circle/web lint
pnpm --filter @circle/api build
pnpm --filter @circle/web build
git diff --check
```

Khởi động bình thường trong mạng nội bộ, không build/pull/install:

```powershell
.\scripts\start-local.ps1
```

Rebuild chỉ khi người dùng xác nhận đang dùng 5G:

```powershell
docker compose build api web
docker compose up -d --no-build --pull never api web
```

Smoke test:

```powershell
(Invoke-WebRequest -UseBasicParsing http://localhost:4000/api/v1/health).StatusCode
(Invoke-WebRequest -UseBasicParsing http://localhost:3000/auth/login).StatusCode
```

Visual reference:

- Circle gốc: chạy clone local tại port `3001`.
- Flowie: port `3000`.
- Dùng cùng viewport, route tương ứng và theme.
- Flowie cần phiên workspace-member đã đăng nhập; không dùng credential hard-code trong source/test.

## 9. Quy tắc commit và báo cáo

Sau mỗi task hoàn chỉnh:

1. `git diff --check`.
2. Stage đúng file của task, không stage cả workspace mù quáng.
3. Commit message đúng mục task.
4. Push `origin codex/foundation`.
5. Cập nhật phần **Nhật ký Terra** bên dưới bằng commit, test và phần còn thiếu.

Không commit `.env`, secret, `.next`, `node_modules`, cache hoặc ảnh tạm.

## 10. Nhật ký Terra

Terra thêm một dòng sau mỗi lát:

| Ngày       | Task            | Commit                   | Evidence                                           | Việc tiếp theo    |
| ---------- | --------------- | ------------------------ | -------------------------------------------------- | ----------------- |
| 2026-08-25 | Handoff cleanup | commit bàn giao hiện tại | Một kế hoạch authoritative; tài liệu cũ đã archive | T0 baseline guard |

## 11. Điều kiện dừng và hỏi người dùng

Chỉ dừng để hỏi khi:

- cần cài dependency/pull image mà người dùng chưa xác nhận 5G;
- một lựa chọn sẽ thay đổi product scope hoặc UI baseline;
- cần credential/session mà không thể kiểm chứng bằng source/test;
- phát hiện thay đổi người dùng chưa commit chồng lên file cần sửa.

Không dừng chỉ vì visual browser chưa login: tiếp tục source parity, test và adapter work; ghi rõ
visual acceptance đang chờ session.
