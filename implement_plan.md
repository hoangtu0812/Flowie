# Flowie — Kế hoạch khôi phục UI Circle và chuyển backend sang Python

> **Tài liệu này là nguồn mục tiêu, trạng thái và thứ tự thực thi duy nhất để giao Terra.**
> Các kế hoạch cũ trong `docs/history/` chỉ dùng để tra cứu, không dùng làm chỉ thị triển khai.

## 0. Chỉ thị ngắn để giao Terra

Tiếp tục Flowie từ checkpoint `013c447` trên `codex/foundation`. Trước khi sửa, tạo branch
`codex/python-rebuild`; không xóa branch hoặc lịch sử hiện tại. Clone Circle local tại
`C:\Users\Hoang Tu\Desktop\BSR\1. Source Code\circle`, commit
`778598503e680b4c658d694dd9f65351ee48b3d3`, là chuẩn tuyệt đối của frontend.

Mục tiêu gồm hai luồng độc lập nhưng phối hợp:

1. Khôi phục presentation của `apps/web` về Circle gốc; chỉ giữ ngoại lệ đã được duyệt.
2. Dựng FastAPI song song với NestJS và chuyển từng domain qua Python bằng contract test.

Frontend luôn gọi `/api/v1` với contract ổn định. Trong giai đoạn chuyển tiếp, Python làm API
facade: endpoint đã chuyển chạy bằng Python, endpoint chưa chuyển được chuyển tiếp sang NestJS.
Không xóa NestJS, Prisma hoặc worker Node cho đến khi toàn bộ endpoint/domain liên quan đã đạt
parity và có bằng chứng nghiệm thu.

Lát chạy thử sớm nhất là **UI Project gốc dùng dữ liệu thật qua facade**. Thứ tự backend Python là:
Auth/Profile/Workspace → Teams → Projects → Issues/Cycles → Initiatives/Project Settings → phần
còn lại → worker/cutover.

## 1. Quyết định kiến trúc đã chốt

### 1.1. Điều sẽ làm

- Dùng nguyên UI Circle gốc, không thiết kế lại.
- Backend đích là Python/FastAPI.
- Chuyển dần theo domain, không big-bang rewrite.
- Tái sử dụng PostgreSQL, Redis, MinIO và dữ liệu hiện tại.
- Giữ API contract `/api/v1` để frontend không phụ thuộc backend đang là NestJS hay Python.
- Chỉ chuyển quyền migration từ Prisma sang Alembic sau khi NestJS đã ngừng ghi schema.
- Mỗi lát hoàn chỉnh phải test, chạy Docker, commit và push riêng.

### 1.2. Điều sẽ không làm

- Không xóa repository, lịch sử Git hoặc checkpoint `013c447`.
- Không xóa backend NestJS trước khi có parity test và rollback path.
- Không chạy Prisma migration và Alembic migration song song trên cùng schema.
- Không chuyển đổi mã TypeScript sang Python bằng dịch tự động rồi coi là hoàn tất.
- Không nhét fetch, DTO, mapper hoặc business state vào component UI gốc.
- Không thay JSX, `className`, component tree hoặc interaction pattern để thuận tiện cho backend.
- Không tạo record giả để lấp dữ liệu null/empty.
- Không cài dependency, pull image hoặc rebuild Docker nếu người dùng chưa xác nhận đang dùng 5G.

## 2. Mục tiêu cuối cùng

Flowie là hệ thống quản lý nhiều loại dự án, dùng UI Circle gốc và dữ liệu thật, với các điều kiện:

1. Các route nghiệp vụ nhìn và tương tác giống baseline Circle `7785985` ở light/dark mode.
2. Không còn fixture, mock record, canned response hoặc mutation no-op trong production path.
3. Dữ liệu tạo/sửa/xóa được lưu PostgreSQL và còn nguyên sau refresh/restart Docker.
4. Auth, workspace isolation, RBAC, audit và validation được thực thi ở backend Python.
5. Redis, MinIO, notification/Discord và background jobs hoạt động thật.
6. Docker đã build có thể start trong mạng nội bộ bằng `--pull never`, không cài thêm thư viện.
7. NestJS/Prisma chỉ được gỡ khi Python đã đạt 100% contract/behavior parity trong phạm vi đã chốt.

## 3. Trạng thái đã xác minh tại checkpoint

| Hạng mục | Giá trị |
| --- | --- |
| Workspace | `C:\Users\Hoang Tu\Desktop\BSR\1. Source Code\Flowie` |
| Branch hiện tại | `codex/foundation` |
| Checkpoint bàn giao | `013c447` — `docs: consolidate terra execution handoff` |
| Remote | `https://github.com/hoangtu0812/Flowie.git` |
| Circle baseline | `778598503e680b4c658d694dd9f65351ee48b3d3` |
| Frontend hiện tại | Next.js 15.2.8; đã lệch đáng kể so với Circle baseline |
| Backend hiện tại | NestJS, Prisma/PostgreSQL, Redis, MinIO, BullMQ worker |
| Quy mô API | 212 file TS, khoảng 13.469 dòng, 24 controller, 27 service |
| Data model | 60 Prisma model, 13 enum, 61 migration |
| Test gần nhất | 55 suite / 182 test API passed |
| Docker hiện tại | Web `3000`, API `4000`, PostgreSQL, Redis, MinIO, worker |

Backend hiện tại là nguồn hành vi tham chiếu và rollback, không phải mã bỏ đi ngay lập tức.

## 4. UI baseline và ngoại lệ được phép

### 4.1. Quy tắc baseline

- Mọi file presentation trước tiên phải so với file tương ứng trong clone Circle local.
- Nếu file tồn tại ở Circle, phiên bản Circle là mặc định; mọi khác biệt phải có mục trong allowlist.
- Logic dữ liệu mới đặt ngoài presentation tree, ưu tiên `apps/web/features/<domain>/**`.
- Component Circle chỉ nhận record, loading/error state và callback qua props/context/hook mỏng.
- Empty/loading/error state phải dùng affordance và ngôn ngữ thị giác của UI gốc.

### 4.2. Ngoại lệ UI được duyệt

- Bỏ banner quảng cáo open-source/Vercel/GitHub ở sidebar/footer.
- Thêm route auth và admin vì Circle baseline không cung cấp đầy đủ nghiệp vụ này.
- Không hiện Agent/Code Reviews như tính năng hoạt động khi chưa có backend thật.
- Không hiện Slack, email hoặc desktop notification như đã kết nối.
- Discord được phép bổ sung trong Integration/Notification bằng component pattern sẵn có.
- Có thể thêm file provider/hook/feature, nhưng không đổi presentation khi dialog/panel đóng.

Mọi ngoại lệ mới phải được người dùng duyệt trước khi code.

## 5. Kiến trúc đích

```text
apps/
├── web/                    # Next.js; presentation khôi phục từ Circle gốc
├── api-python/             # FastAPI — backend đích và facade chuyển tiếp
│   ├── app/
│   │   ├── main.py
│   │   ├── core/           # config, errors, logging, security, middleware
│   │   ├── db/             # session, mappings, repositories
│   │   ├── domains/        # auth, teams, projects, issues, ...
│   │   ├── legacy/         # proxy các endpoint chưa migrate
│   │   └── tests/
│   └── pyproject.toml
├── api/                    # NestJS legacy; giữ đến khi parity hoàn tất
└── worker/                 # BullMQ legacy; chuyển sau API

infrastructure/docker/
├── python-api.Dockerfile
├── api.Dockerfile          # legacy trong giai đoạn chuyển tiếp
├── web.Dockerfile
└── worker.Dockerfile
```

### 5.1. Python stack

- FastAPI + Pydantic cho HTTP contract/validation.
- SQLAlchemy async cho PostgreSQL mappings và transaction.
- Alembic cho migration **sau thời điểm chuyển quyền schema**.
- pytest cho unit, integration và contract tests.
- Redis client và S3-compatible client cho Redis/MinIO.
- Dependency được khóa trong `pyproject.toml` và lockfile; Docker image chứa sẵn dependency.

Không chốt package/version bằng suy đoán. Khi bắt đầu P1, kiểm tra version tương thích, cài lúc đang
dùng 5G, khóa version và commit lockfile.

### 5.2. Luồng request trong giai đoạn chuyển tiếp

```text
Circle UI /apps/web
        |
        | /api/v1 (một base URL ổn định)
        v
FastAPI facade :4000
        |-- domain đã migrate ------> Python service/repository ------> PostgreSQL/Redis/MinIO
        |
        `-- domain chưa migrate -----> NestJS legacy :4001 ----------> hạ tầng hiện tại
```

Facade phải chuyển tiếp method, query, body, cookie, authorization header, status, response body và
`Set-Cookie` cần thiết. Không được biến lỗi backend legacy thành HTTP 200.

### 5.3. Quyền sở hữu database migration

1. Khi còn domain NestJS: Prisma là nguồn migration duy nhất; Python chỉ map schema hiện hữu.
2. Trong thời gian này không chạy `alembic upgrade` vào database chung.
3. Sau khi tất cả domain ghi dữ liệu đã chuyển và NestJS ở read-only/off: chụp schema checksum,
   tạo Alembic baseline trùng schema đang chạy.
4. Từ cutover trở đi: Alembic là nguồn migration duy nhất; Prisma migration được archive/read-only.

## 6. Chiến lược contract và parity

Mỗi endpoint chuyển sang Python phải đi qua bốn lớp kiểm chứng:

1. **Contract fixture**: cùng request hợp lệ/không hợp lệ gửi vào NestJS và Python.
2. **Response parity**: status code, field, nullable behavior, pagination và error shape tương đương.
3. **Persistence parity**: transaction, unique constraint, workspace isolation và RBAC tương đương.
4. **Frontend acceptance**: UI Circle gốc chạy không cần nhánh JSX riêng cho Python.

Khác biệt có chủ đích phải ghi trong `docs/python-migration/contract-differences.md` và được duyệt.

## 7. Backlog thực thi bắt buộc

### P0 — Safety checkpoint và inventory — completed 2026-08-25

Việc làm:

1. Xác minh `git status --short` sạch và HEAD là `013c447` hoặc hậu duệ đã biết.
2. Tạo `codex/python-rebuild` từ checkpoint; push branch trước thay đổi lớn.
3. Ghi manifest route, endpoint, Prisma model, migration, job và external integration hiện có.
4. Tạo bảng mapping `endpoint → domain → Nest test → Python status → frontend route`.
5. Lưu schema dump/checksum chỉ chứa cấu trúc, không chứa secret hoặc dữ liệu người dùng.

Nghiệm thu:

- Có rollback rõ về `013c447`.
- Không file production nào bị xóa trong P0.
- Commit: `docs: baseline python migration inventory`.

Trạng thái hoàn thành:

- Branch triển khai `codex/python-rebuild` được tạo từ checkpoint sạch `38cca0b`.
- Inventory tại `docs/python-migration/inventory.md` ghi domain/API/schema/job/hạ tầng.
- Fingerprint của source schema, 61 migration và PostgreSQL schema-only đã được chụp; không có dữ liệu
  người dùng trong inventory.
- Script read-only `scripts/get-python-migration-fingerprint.ps1` tái lập fingerprint source offline
  và tương thích Windows PowerShell 5.1/PowerShell 7.

### P1 — Khôi phục UI Circle và dựng parity guard — completed 2026-08-25

Mục tiêu: giải quyết dứt điểm việc UI lệch trước khi viết thêm màn hình.

Việc làm:

1. Tạo script read-only `scripts/audit-ui-parity.ps1` so `apps/web` với clone Circle local.
2. Tạo allowlist cho auth, admin, banner bị bỏ và `features/**`.
3. Khôi phục toàn bộ file presentation theo manifest Circle, domain-by-domain; baseline luôn thắng.
4. Chuyển code dữ liệu Flowie cần giữ sang `features/<domain>/**`, không bỏ mất contract đang dùng.
5. Chạy Circle baseline ở `3001`, Flowie ở `3000`; chụp cùng route/viewport/theme.
6. Audit toàn production import: mock data, local fixture, random record, mutation no-op.

Nghiệm thu:

- Audit xuất `IDENTICAL/ALLOWED/CHANGED/MISSING/EXTRA`; không còn `CHANGED` chưa giải thích.
- Project list/detail và sidebar đạt parity light/dark, trừ ngoại lệ được duyệt.
- Chưa yêu cầu Python hoàn tất; UI có thể dùng NestJS qua facade/legacy để chạy thử sớm.
- Commit: `refactor: restore circle ui baseline`.

Tiến độ hiện tại:

- [x] `scripts/audit-ui-parity.ps1` so sánh read-only `app`, `components`, `hooks`, `lib`, `store`
  và `public` với Circle baseline; tương thích Windows PowerShell 5.1/PowerShell 7.
- [x] Kết quả baseline và thứ tự xử lý được lưu tại `docs/python-migration/ui-parity-baseline.md`.
- [x] Project List không còn control gán label ngoài baseline; label vẫn được quản lý qua affordance
  Project Detail/Settings.
- [x] Tách fetch, DTO mapper và mutation của Project List sang
  `apps/web/features/projects/projects-data.tsx`; `projects.tsx` chỉ còn provider mỏng +
  presentation Circle. Không còn error block riêng làm thay đổi bố cục; lỗi dùng toast toàn cục.
- [x] Project List giữ nguyên cây bảng/nhóm/cột của Circle; các props cập nhật dữ liệu thật không
  tạo DOM mới khi control đóng.
- [x] Ghi đè không phá huỷ toàn bộ cây presentation Circle (`app`, `components`, `hooks`, `lib`,
  `mock-data`, `public`, `store`) từ clone baseline. Audit sau khôi phục: **312 IDENTICAL,
  3 ALLOWED, 0 CHANGED, 0 MISSING**; 50 file EXTRA là adapter/route Flowie không được Circle UI
  gốc import ở preview mode.
- [x] Bật Circle UI preview không đăng nhập bằng middleware pass-through tạm thời; root route quay
  về `lndev-ui/team/CORE/all` đúng baseline để nghiệm thu UI trước.
- [x] Giữ 50 adapter Flowie EXTRA ngoài presentation (không xoá) và loại chúng khỏi type-check của
  Circle preview; adapter không được Circle import và sẽ được tái kết nối qua feature boundary ở
  các phase backend tiếp theo.
- [x] Build production và lint thành công; chỉ còn 2 warning vốn có của Circle baseline.

### P2 — FastAPI foundation và legacy facade — completed 2026-08-25

Việc làm:

1. Tạo `apps/api-python`, cấu trúc domain, config, structured logging và error middleware.
2. Kết nối PostgreSQL, Redis, MinIO bằng health/readiness checks.
3. Tạo proxy legacy an toàn tới NestJS; giới hạn host cố định từ config, không nhận URL từ user.
4. Chuyển NestJS nội bộ sang port `4001`; FastAPI giữ public API port `4000`.
5. Cập nhật Docker Compose: `api` là FastAPI facade, `api-legacy` là NestJS.
6. Thêm smoke test để toàn bộ endpoint chưa migrate vẫn hoạt động qua facade.
7. Khóa dependency và build image trong 5G; sau đó chứng minh start offline bằng `--pull never`.

Tiến độ hiện tại:

- [x] Tạo FastAPI facade tại `apps/api-python` với fixed-target proxy tới legacy; body, query,
  request cookie và nhiều `Set-Cookie` được bảo toàn.
- [x] Thêm CORS, structured app boundary, `/readyz` kiểm tra TCP PostgreSQL/Redis/MinIO + health
  legacy và test đơn vị cho proxy contract.
- [x] Cập nhật Compose để FastAPI public `:4000`, NestJS legacy internal `api-legacy:4001`.
- [x] Khôi phục middleware cookie gate: có `flowie_access` **hoặc** `flowie_refresh` thì F5 không
  bị đưa về login; trang Login/Đăng ký có logo Flowie và animation loading độc lập với Circle UI.
- [x] Build image Python, smoke test proxy/login qua Docker và kiểm tra offline start. Lần build
  5G đã pull `python:3.12-slim` và tải packages đã pin; `./scripts/build-and-test.ps1 -AllowNetwork`
  passed readiness, legacy proxy và login page. `./scripts/start-local.ps1` sau đó passed mà không
  build/pull/install; authenticated smoke test cũng xác minh login, profile và refresh-safe page.

Nghiệm thu:

- `/api/v1/health` và `/readyz` phản ánh đúng dependency health.
- Login hiện tại, cookie và Project legacy hoạt động qua facade không đổi UI.
- API legacy không public ra ngoài Docker network trừ khi bật profile debug.
- Commit: `feat: add fastapi facade with legacy routing`.

### P3 — Auth, Profile và Workspace bằng Python — completed (2026-08-25)

Phạm vi:

- Login/logout/current session, password hashing compatibility và cookie lifecycle.
- Profile read/update.
- Workspace list/current membership và workspace isolation.
- RBAC dependency dùng lại cho các domain tiếp theo.

Việc làm:

1. Map bảng hiện tại bằng SQLAlchemy, không tạo Alembic migration.
2. Viết contract tests song song NestJS/Python.
3. Chuyển route domain từ proxy sang Python khi test đạt.
4. Kiểm tra session cũ và session Python không làm người dùng bị logout bất ngờ.

Nghiệm thu:

- Login/logout/profile/update và protected redirect hoạt động từ UI gốc.
- 401/403/404 không làm lộ workspace khác.
- Password/session secret không log và không hard-code.
- Commit: `feat: migrate auth profile and workspace to python`.

Tiến độ hiện tại (P3a — completed 2026-08-25):

- [x] Native Python: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
  `GET/PATCH /users/me` và `GET /workspaces/me`; các route không liệt kê vẫn qua facade.
- [x] Session cookie `HttpOnly`/`SameSite=Lax`, JWT HS256 và bảng `sessions` dùng chung với
  NestJS; token Python được legacy guard chấp nhận trong authenticated regression.
- [x] Tương thích password hash Argon2 Node cũ: chuẩn hóa riêng thứ tự metadata `m,p,t` trước
  verify, không đổi hash hoặc buộc người dùng reset mật khẩu.
- [x] Docker persistence regression passed: native login/profile/profile update/workspace/refresh/
  logout, `401` sau logout, readiness, legacy proxy và offline-start.
- [x] P3b1: Native Python `POST /auth/register`, `GET /auth/sessions`, `DELETE /auth/sessions`
  và `DELETE /auth/sessions/:sessionId`. Register tạo atomically user/LOCAL identity/organization/
  workspace/owner membership/General team và sáu status mặc định, đúng contract NestJS; regression
  local đạt register `201`, login `200`, workspace `200`, 2 session, revoke `200`, logout `204`.
  Alias timezone Chrome/Windows `Asia/Saigon` được normalize thành `Asia/Ho_Chi_Minh` và có unit
  regression, nên form đăng ký không còn bị chặn bởi timezone cũ.
- [x] P3b2: Native Python `POST /workspaces`, member list, invite/accept/decline, role update,
  leave và remove member. Giữ response `organization.workspaces[0]` cho UI hiện có; kiểm tra owner/
  admin, workspace isolation và audit khi rời workspace. Docker regression hai tài khoản đạt toàn bộ
  lifecycle `200`; member remove bị chặn `403`, owner remove thành công `200`.
- [x] P3c: Native Python personal API keys và ba nhóm workspace display preferences. API key dùng
  SHA-256, token chỉ trả một lần lúc tạo và bị loại khỏi list; preference validate JSON, member chỉ
  đọc, owner/admin mới sửa và mọi write có audit log. Regression đạt create/list/revoke key và ba
  preference `200`; member write bị chặn `403`.
- [x] Toàn bộ route Auth/Workspace trong scope P3 đã native Python; facade giữ các domain kế tiếp
  không thuộc scope (Teams, Projects, Issues và worker) cho tới phase riêng.
- [x] P3d: Circle Workspace switcher đã đọc membership thật, đổi URL theo workspace slug, tạo
  workspace qua API, logout và tự refresh access session trước request Workspace đầu tiên. Tài
  khoản platform admin không có workspace hiển thị rõ trạng thái trống để tạo workspace đầu tiên.

### P4 — Teams bằng Python — completed (2026-08-25)

Phạm vi:

- Team list/detail/create/update/archive.
- Membership và role.
- Dữ liệu team ở sidebar/org switcher.

Nghiệm thu:

- [x] Native list/detail/create/update/archive/schedule deletion/restore, membership và role.
- [x] Team creation tạo Team documents folder; archive/delete/restore và leave có audit.
- [x] Docker two-account regression: create/list/detail/add/update/leave, invite-only `403`,
  deleted list/restore/archive đều đạt; duplicate identifier và workspace scope được database/RBAC bảo vệ.
- [x] UI Teams/sidebar không thay presentation Circle; chỉ nguồn API đã chuyển Python.
- [x] Commit: `18b3f9f feat: migrate teams to python`.
- [x] P4d: `/[orgId]/teams` đọc Team API thật, lọc/sắp xếp theo dữ liệu thật, tạo Team qua
  control Circle sẵn có và sidebar chỉ hiển thị membership thật. Các đường dẫn Team không còn
  hard-code workspace fixture.
- [x] P4d: `/[orgId]/members` đọc Workspace membership thật; Invite tạo lời mời qua Python,
  Owner đổi role, Owner/Admin xoá member. Không còn fixture user để điền danh sách Members.
- [x] P4e: Team chưa tham gia có action `Join`, gọi trực tiếp Python API và tuân theo `OPEN` /
  `INVITE_ONLY`. Workspace invitation hiển thị trong `Switch Workspace` và được accept/decline
  tại `/invitations`; không có cơ chế tự ý vào workspace không được mời.

### P5 — Projects bằng Python — mốc cho người dùng chạy thử

Phạm vi API:

- Project list/create/get/update/archive.
- Status, priority, health, lead, team, start/target date, labels.
- Detail Overview/Activity/Issues/Peek.
- Members, milestones, favorite, subscription, resources, attachments và updates.

Việc làm:

1. Giữ Project presentation đã khôi phục ở P1; chỉ đổi adapter/provider sang endpoint Python.
2. Port business rules và transaction từ NestJS, không port mù cấu trúc framework.
3. Dùng Team/Workspace Python làm dependency; endpoint chưa port tiếp tục legacy proxy.
4. Test list/board/timeline/insights cùng một nguồn dữ liệu thật.

Tiến độ thực hiện:

- [x] P5a: dựng router Python riêng tư `/_native/projects` cho list/create/detail/update/archive
  với workspace/team RBAC, status/lead/label validation, activity và transaction PostgreSQL.
  Router này chưa public nên Circle UI vẫn đi qua facade NestJS; không có chuyển đổi UI nửa chừng.
- [x] P5b: port Project read-side và mutation collaboration vào router riêng tư: activity, issues,
  members, milestones, favorite, subscription, resources và updates. Regression Docker tạo/sửa/xóa
  milestone, update, resource, member, favorite và subscription đã đạt.
- [x] P5c-precutover: đối chiếu response Project create/get của Python với facade Legacy trên cùng
  database; top-level và object Team không còn trường thiếu/thừa.
- [x] P5c-list/create: chuyển whitelist route public Projects sang Python cho list/detail/create/update,
  resource, members, milestones và favorite; các route chưa port tiếp tục facade. Màn hình Circle
  Projects và Team Projects đã đọc PostgreSQL thật; dialog Create project ghi record thật mà không
  thay layout/stylesheet baseline.
- [x] P5c-detail: nối nguyên cây Circle Project Overview, Activity và Issues với provider/adapter
  dữ liệu thật; header, side panel, cycle breakdown, tiến độ và timeline không còn đọc `mock-data`
  hay Zustand fixture. Activity post update ghi vào API/DB thật; các request chưa thuộc public
  whitelist vẫn đi an toàn qua facade. Web production build và FastAPI regression đạt.
- [x] P5c-audit: Project List, Board, Timeline, Insights và Timeline Peek cùng dùng Project
  provider/API thật; bỏ import fixture còn sót trong scope này. Status, priority, health, lead và
  target date trên List ghi trực tiếp vào Python API. Toàn bộ request ở Project detail đi qua
  `authenticatedFetch` để tự khôi phục access session sau refresh thay vì làm mất dữ liệu UI.
- [x] P5c-acceptance (dark): người dùng đã kiểm tra Project List, Overview, Activity và Issues với
  dữ liệu thật trên workspace của mình; ảnh nghiệm thu cho thấy project update được lưu/hiển thị lại.
  User đã cho phép tiếp tục P6. Light-mode được giữ lại trong full regression trước cutover cuối.

Nghiệm thu:

- Create/edit/archive và mọi property mutation survive refresh/restart Docker.
- Overview/Activity/Issues/Peek dùng record thật và giữ UI Circle.
- Không import `@/mock-data`, không fallback record giả.
- Contract, RBAC, API integration, Web build và screenshot light/dark đều passed.
- Người dùng xác nhận mốc chạy thử trước khi mở rộng domain.
- Commit: `feat: migrate projects to python with circle ui parity`.

### P6 — Issues, Comments, Attachments và Cycles bằng Python

Phạm vi:

- Issue CRUD, status, priority, assignee, labels và relations.
- Comments/activity/attachments.
- Cycles/current/upcoming và issue-cycle mapping.
- Inbox/My Issues data thật; không canned item.

Tiến độ thực hiện:

- [x] P6a-core: dựng router riêng tư `/_native/issues` trong FastAPI cho list/options/create/get/
  update/archive. Router thực hiện kiểm tra workspace/team membership, validate status/project/
  assignee/label, cấp số Issue bằng `teams.issue_sequence` trong transaction, lưu subscriber và
  activity. Public `/issues` chưa đổi và UI Circle tiếp tục đi qua facade cho đến khi contract test
  hoàn tất.
- [x] P6b-cycle-core: dựng router riêng tư `/_native/cycles` cho list/create/update/delete Cycle,
  thêm/xóa Issue khỏi Cycle và xem Cycle Issues. Ngày bắt đầu/kết thúc được validate, membership
  được kiểm tra trước mỗi action và burn-up được tính từ Issue/Cycle records thật. Document links,
  comments, attachments và public cutover vẫn chưa mở.
- [x] P6c-comment-core: dựng router riêng tư `/_native/comments` cho list/create/update/delete và
  toggle reaction. Comment kiểm tra quyền qua Issue/team, ghi activity, giữ body JSON thật và đọc
  attachment records hiện có. MinIO upload/download và public cutover vẫn chưa mở.
- [x] P6d-attachment-core: dựng router riêng tư `/_native/attachments` cho list/upload/download,
  phân quyền theo entity workspace/team và object storage MinIO ký AWS Signature V4. Thêm
  `python-multipart==0.0.20` để nhận multipart upload; Docker FastAPI build và OpenAPI xác nhận
  upload/download routes. Public cutover và end-to-end upload bằng người dùng vẫn chờ regression.
- [x] P6e-issue-personal-state: thêm subscribe/unsubscribe, favorite/unfavorite và reaction toggle
  cho Issue ở private API. Các action có workspace/team RBAC và ghi PostgreSQL thật, sẵn sàng cho
  Circle affordance khi public contract được mở.
- [x] P6p-public-core: whitelist Circle-safe public `/issues`, `/issues/options`, create, update và
  archive sang Python; workflow catalog Circle được seed/sync cho workspace cũ và mới.
- [x] P6q-create-dialog: dialog **Create issue** giữ nguyên JSX/class/UI của Circle; chỉ selector
  lấy options từ Python và submit `POST /issues`, sau đó reload danh sách Issue thật. Cần nghiệm
  thu Docker/browser trước khi nối các mutation Issue tiếp theo.
- [x] P6r-status-mutation: Circle Status selector giữ nguyên popup nhưng icon/count được map từ
  status thật; đổi status gọi `PATCH /issues/{id}` Python và chỉ cập nhật UI khi response thành công.
- [x] P6s-priority-mutation: Circle Priority selector giữ nguyên icon/catalog; đổi priority gọi
  `PATCH /issues/{id}` Python và chỉ cập nhật UI sau response thành công.
- [x] P6t-assignee-mutation: Issue options hydrate member thật vào store; Circle context menu và
  command palette dùng member thật, gán/bỏ gán gọi `PATCH /issues/{id}` Python.
- [x] P6u-label-mutation: Issue options hydrate labels thật vào store; Circle context menu và
  command palette thêm/xóa label bằng `PATCH /issues/{id}` Python.
- [x] P6v-project-mutation: Issue options hydrate project thật vào store; Circle context menu và
  command palette gán/gỡ Project bằng `PATCH /issues/{id}` Python.
- [x] P6w-label-management: chuyển Settings → Issue labels từ fixture sang Labels API Python;
  tạo/sửa/xóa label và label group có persistence, RBAC workspace administrator, issue count và
  last-applied thật. Layout bảng/toolbar Circle giữ nguyên; chỉ dialog được mở từ các nút sẵn có.
- [x] P6x-due-date-mutation: các action Circle **Set due date** trong Issue context menu và Command
  Palette gọi `PATCH /issues/{id}` Python; set/clear chỉ cập nhật UI sau response thành công và
  survive refresh.
- [x] P6y-cycle-read-cutover: whitelist `GET /cycles` sang FastAPI; active/upcoming Cycle adapter
  Circle đã có từ trước nên nhận list/progress/burn-up thật mà không thay JSX/CSS. Tạo/sửa/xóa
  Cycle vẫn giữ private staging cho đến khi UI mutation được audit; request cũng dùng durable-session
  retry để F5 không biến Cycle khi access token cần refresh.
- [x] P6z-comment-public-contract: whitelist Comments CRUD và reaction toggle sang FastAPI native,
  với author/workspace/team RBAC, attachment metadata và activity persistence đã có. Issue-detail
  hiện chưa được đổi presentation; adapter sẽ thay local comment state trong một slice riêng.
- [x] P6aa-activity-public-read: whitelist read-only `/activities` sang FastAPI native, kiểm tra
  Issue/Project scope trước query và trả actor/activity data persisted cho adapter Timeline sau này.
- [x] P6ab-attachment-public-contract: whitelist attachment list/upload/download sang FastAPI
  native; entity/team RBAC, giới hạn kích thước và signed MinIO storage giữ nguyên private contract.
- [x] P6ac-issue-personal-state-public: whitelist subscribe/unsubscribe, favorite/unfavorite và
  reaction list/toggle của Issue sang FastAPI; mỗi action vẫn kiểm Issue/team scope và persist user state.
- [x] P6ad-cycle-issue-mapping-public: whitelist xem/thêm/xóa Issue trong Cycle sang FastAPI;
  mapping kiểm Cycle/Issue cùng team, persist `issue_cycles` và không thay đổi selector Circle hiện tại.
- [x] P6ae-issue-relation-public: whitelist Issue relations và sub-issues read-side sang FastAPI;
  LINK CRUD bảo toàn directional semantics, kiểm cả hai Issue/team scope và ghi activity persisted.
- [x] P6af-issue-workflow-public: whitelist move giữa Team, classification duplicate/won't-fix và
  convert Issue thành Comment sang FastAPI; sequence/status/reference validation và activity giữ native.
- [x] P6ag-issue-reminder-public: whitelist set/cancel reminder sang FastAPI native; future-date
  validation, persisted `issue_reminders` và background delivery vẫn giữ Python worker.
- [x] P6ah-issue-template-public: whitelist Issue templates CRUD sang FastAPI native; manager RBAC
  và workspace status/project/assignee/label validation giữ nguyên trước adapter Settings.
- [x] P6ai-comment-activity-adapter: Issue detail giữ nguyên feed/composer Circle nhưng hydrate
  Activity/Comment từ FastAPI và tạo Comment qua PostgreSQL; không còn local in-memory comment state.

Nghiệm thu:

- Issue mutation từ Project tab và Team Issues dùng cùng contract.
- Upload/download MinIO có authorization.
- Cycle state/date constraints và pagination có test.
- Commit: `feat: migrate issues comments and cycles to python`.

### P7 — Initiatives và Project Settings bằng Python

Thứ tự trong phase:

1. Initiatives list/detail/project links.
2. Project labels.
3. Project statuses.
4. Project templates.
5. Project properties/custom fields.
6. Project update/display defaults.

Nghiệm thu:

- Chỉ dùng control/dialog tồn tại trong Circle baseline.
- CRUD thật, reload không mất dữ liệu và RBAC đúng.
- Không dùng Issue Label Group thay sai cho Project Label Group.
- Commit: `feat: migrate initiatives and project settings to python`.

### P8 — Các domain còn lại

Chuyển từng commit độc lập:

1. Views, Members, Documents.
2. Notifications inbox và preference.
3. Discord outbound integration; retry, timeout, secret masking và audit.
4. Customer Requests, Releases, SLAs, Pulse/Portfolio nếu còn trong product scope.
5. Admin management và audit log.

Slack/email/desktop/mobile không được hiển thị là enabled nếu chưa có implementation thật.

Nghiệm thu mỗi domain:

- UI baseline hoặc ngoại lệ đã duyệt.
- Không mock/no-op.
- Contract/RBAC/persistence test.
- Docker smoke test và commit/push riêng.

### P9 — Worker, schema ownership và final cutover

Việc làm:

1. Inventory từng BullMQ job: producer, payload, retry, idempotency và schedule.
2. Chuyển job sang Python worker hoặc thay bằng outbox/worker đã test; không để hai consumer xử lý
   cùng job ngoài bài test có chủ đích.
3. Freeze Prisma migration; checksum schema và tạo Alembic baseline.
4. Chạy rehearsal trên database clone/backup; xác minh rollback.
5. Tắt `api-legacy` và worker Node trong staging/local acceptance.
6. Xóa mã legacy trong commit riêng chỉ sau tối thiểu một vòng full regression passed.

Nghiệm thu:

- Không request production nào đi qua legacy proxy.
- Không queue/job nào còn phụ thuộc Node.
- Alembic là migration authority duy nhất và baseline trùng database.
- Full UI/API regression, restart Docker và offline-start passed.
- Commit 1: `chore: cut over database migrations and workers to python`.
- Commit 2 sau acceptance: `chore: remove legacy nestjs backend`.

## 8. Cổng nghiệm thu và ước lượng

Ước lượng là effort kỹ thuật, không phải cam kết lịch; Terra phải cập nhật sau mỗi phase.

| Mốc | Kết quả người dùng nhìn thấy | Ước lượng từ lúc bắt đầu |
| --- | --- | --- |
| P0–P1 | UI Circle được khôi phục, có báo cáo parity | 2–4 ngày làm việc |
| P2 | UI gọi qua FastAPI facade, chức năng legacy vẫn chạy | thêm 2–3 ngày |
| P3–P5 | Auth, Teams và Projects chạy native Python | thêm 7–12 ngày |
| P6–P8 | Các domain nghiệp vụ còn lại chạy Python | cần audit lại sau P5; nhiều tuần |
| P9 | Gỡ NestJS/Prisma/worker Node an toàn | chỉ ước lượng sau full parity |

Không đợi P9 mới cho người dùng kiểm tra. Bắt buộc demo/acceptance ở cuối P1, P2 và P5.

## 9. Mock/no-op audit checklist

Chạy lại cuối mỗi phase:

```powershell
rg -n "@/mock-data|mock-data|fixture|faker|Math\.random|setTimeout" apps/web apps/api-python
rg -n "TODO|not implemented|coming soon|sample data|no-op|placeholder" apps/web apps/api-python
rg -n "localStorage|sessionStorage" apps/web -g "*.ts" -g "*.tsx"
```

Không coi mọi kết quả là lỗi: static option/icon/demo test có thể hợp lệ. Mỗi kết quả production phải
được phân loại `REMOVE`, `REPLACE_WITH_API`, `STATIC_UI_ALLOWED` hoặc `TEST_ONLY` trong báo cáo.

## 10. Verification commands

Không cần Internet sau khi dependency/image đã được cache:

```powershell
git status --short
git diff --check
pnpm --filter @circle/web lint
pnpm --filter @circle/web build
pytest apps/api-python
docker compose config --quiet
```

Trong giai đoạn legacy còn tồn tại:

```powershell
pnpm --filter @circle/api run test -- --runInBand
pnpm --filter @circle/api lint
pnpm --filter @circle/api build
```

Start trong mạng nội bộ, không build/pull/install:

```powershell
.\scripts\start-local.ps1
docker compose --profile app up -d --no-build --pull never
```

Rebuild chỉ sau khi người dùng xác nhận 5G:

```powershell
docker compose --profile app build
docker compose --profile app up -d --no-build --pull never
```

Smoke test tối thiểu:

```powershell
(Invoke-WebRequest -UseBasicParsing http://localhost:4000/api/v1/health).StatusCode
(Invoke-WebRequest -UseBasicParsing http://localhost:4000/readyz).StatusCode
(Invoke-WebRequest -UseBasicParsing http://localhost:3000/auth/login).StatusCode
```

## 11. Quy tắc commit, push và báo cáo Terra

Sau mỗi phase hoặc vertical slice hoàn chỉnh:

1. Chạy test/lint/build tương ứng và `git diff --check`.
2. Stage đúng file của phase, không dùng `git add .` mù quáng.
3. Commit message theo mục kế hoạch.
4. Push branch `codex/python-rebuild` lên `origin`.
5. Cập nhật bảng nhật ký bằng commit, evidence, endpoint đã chuyển và endpoint còn proxy.

Không commit `.env`, secret, database dump có dữ liệu, `.next`, `node_modules`, virtualenv, cache hoặc
ảnh tạm.

## 12. Nhật ký thực thi

| Ngày | Phase | Commit | Evidence | Legacy còn lại | Việc tiếp theo |
| --- | --- | --- | --- | --- | --- |
| 2026-08-25 | Quyết định kiến trúc | `1736872` | Chốt UI Circle + FastAPI strangler migration | Toàn bộ NestJS/worker | P0 inventory |
| 2026-08-25 | P0 inventory | `5916b50` | API/schema/job inventory + structure fingerprints | Toàn bộ NestJS/worker | P1 UI parity guard |
| 2026-08-25 | P1 parity guard | `chore: add Circle UI parity audit` | 110 identical / 184 changed / 18 missing / 50 extra | Toàn bộ NestJS/worker | Restore Circle presentation |
| 2026-08-25 | Tool compatibility | `fix: support Windows PowerShell parity scripts` | Verified under Windows PowerShell 5.1 | Toàn bộ NestJS/worker | Restore Circle presentation |
| 2026-08-25 | P1 Project List | `refactor: remove non-baseline project label control` | Removed row-level label mutation UI | Toàn bộ NestJS/worker | Restore Project presentation |
| 2026-08-25 | P2 facade (local verification) | `bc05139` | Python proxy test + Web production build passed; Docker image smoke pending 5G | Toàn bộ NestJS/worker qua FastAPI facade | Build FastAPI image và smoke Docker |
| 2026-08-25 | P2 Docker acceptance | `cb3af6c` | Python image built on 5G; `/readyz`, legacy health, login, authenticated profile and offline start passed | Toàn bộ NestJS/worker qua FastAPI facade | P3 Auth/Profile/Workspace native Python |
| 2026-08-25 | P3a native session/profile/workspace | `3c45779` | Native session/profile/current-workspace + Node Argon2 compatibility and cross-token regression passed | Register, session management, workspace mutation/invitations | P3b auth/workspace mutations |
| 2026-08-25 | P3b1 native register/session management | `361d4cb` | Docker build, Python unit regression and isolated-account register/login/workspace/session revoke/logout regression passed | Workspace create/membership/invitations, API keys | P3b2 workspace mutations |
| 2026-08-25 | P3b1 timezone compatibility | `9473085` | Native register with browser `Asia/Saigon` persisted canonical `Asia/Ho_Chi_Minh`; 4 Python tests passed | Workspace create/membership/invitations, API keys | P3b2 workspace mutations |
| 2026-08-25 | P3b2 native workspace membership | `ae85f7d` | Docker smoke + two-account create/invite/pending/accept/role/leave/decline and owner/member RBAC regression passed | Personal API keys, workspace display preferences | P3c settings/security endpoints |
| 2026-08-25 | P3c native API keys/preferences | `a576d07` | API token one-time exposure/revoke, preference persistence/audit and member-write `403`; Docker smoke + unit regression passed | Teams, Projects, Issues, worker | P4 Teams |
| 2026-08-25 | P4 native Teams | `18b3f9f` | Docker smoke/unit + two-account team CRUD, membership, invite-only RBAC and deletion/restore regression passed | Projects, Issues, worker | P5 Projects |
| 2026-08-25 | P5a native Project core (private staging) | `f1ef4e9` | Docker regression: register/workspace/team, create/list/update/detail/archive Project passed | Public Projects contract, Issues, worker | P5b Project read-side and related mutations |
| 2026-08-25 | P5b native Project collaboration data | `4211c89` | Docker regression: members, favorite/subscription, milestone CRUD, updates/resources/activity and Project detail hydration passed | Project settings/templates/custom fields, public payload parity, Issues/worker | P5c compare Circle adapter and public cutover |
| 2026-08-25 | P5c pre-cutover Project contract | `1924448` | Docker parity audit: Legacy/Python Project create/get top-level và Team payload không có key thiếu/thừa | Route public, adapter Circle, settings/templates/custom fields, Issues/worker | Báo người dùng trước khi bắt đầu nối UI |
| 2026-08-25 | P5c Circle Project list/create cutover | `ebf5bab` | Public API regression + browser: unchanged Circle layout, real empty workspace state, Create project dialog opens, no console errors; web build passed | Project detail page adapters, Issue/Activity read-side, settings routes | Nối Overview/Activity/Issues theo whitelist |
| 2026-08-25 | P5c Circle Project detail cutover | `da19ae2` | Web production build, 4 FastAPI regression tests và Docker web rebuild/recreate đạt; Overview/Activity/Issues dùng provider + API adapter, không còn fixture data trong cây Project detail | Acceptance light/dark với workspace người dùng; endpoints P6/P7 chưa migrate vẫn facade | Người dùng tạo Project và kiểm tra ba tab |
| 2026-08-25 | P5c Create Project readiness fix | `d7132ce` | Dialog không còn submit khi `workspaceId` chưa tải xong; Docker browser smoke xác nhận nút bị khóa trong trạng thái chưa sẵn sàng, web production build đạt | Acceptance tạo Project sau đăng nhập | Refresh, chờ workspace tải rồi tạo Project |
| 2026-08-25 | P5c Project fixture audit | current change-set | List/Board/Timeline/Insights/Peek không còn Project fixture; property mutation và detail request dùng Python API + durable session helper | Cần production build/Docker và user acceptance light/dark | Rebuild rồi nghiệm thu toàn Project UI |
| 2026-08-25 | P5c Project user acceptance | user screenshots | List/Overview/Activity/Issues xác nhận dữ liệu thật trong dark mode; user cho phép mở P6 | Full regression light mode trước final cutover | P6a native Issues core |
| 2026-08-25 | P5d Project presentation parity correction | current change-set | Audit against `circle` found Project status selector had been changed to render API-configured options. Restored Circle's fixed status catalog/presentation; data adapter maps legacy values to that catalog and FastAPI persists missing baseline workflow definitions on change. Web production build + Python compile passed | Docker/browser acceptance pending rebuild | Rebuild when 5G is confirmed, then compare Project selector against Circle |
| 2026-08-25 | P6a native Issues core | current change-set | Private FastAPI list/options/CRUD, RBAC, reference validation, sequence và activity persistence; `py_compile` passed | Docker/API contract regression, comments, attachments, cycles và Circle adapter | Chạy native regression rồi mở public whitelist |
| 2026-08-25 | P6b native Cycles core | current change-set | Private FastAPI CRUD Cycle, issue-cycle mapping và persisted burn-up; `py_compile` passed | Docker/API contract regression, Cycle documents, comments/attachments và Circle adapter | Port comments/attachments trước public whitelist |
| 2026-08-25 | P6c native Comments core | current change-set | Private FastAPI comment CRUD/reactions/activity và attachment metadata read; `py_compile` passed | Docker/API contract regression, upload/download MinIO và Circle adapter | Port attachment authorization/streaming |
| 2026-08-25 | P6d native Attachments core | current change-set | S3-compatible signed MinIO upload/download + entity RBAC; Docker build, `/readyz` và OpenAPI routes passed | Authenticated upload/download regression và public contract/adapter | Chạy native attachment regression |
| 2026-08-25 | P6e native Issue personal state | current change-set | Private Issue subscription/favorite/reaction persistence + RBAC; `py_compile` passed | Docker/API contract regression, relations, public contract và Circle adapter | Port Issue relations rồi audit public payload |
| 2026-08-25 | P6f native Issue relations | current change-set | Private FastAPI list/link/change/unlink Issue relations, canonical `RELATED`, directional `BLOCKS`/`BLOCKED_BY`, both-Issue RBAC and activity persistence; Docker OpenAPI + `/readyz` passed | Authenticated relation regression, public contract và Circle adapter | Port Issue reminders/sub-issues rồi audit public payload |
| 2026-08-25 | P6g native Issue sub-issues | current change-set | Private FastAPI sub-issue list uses persisted parent-child Issue hierarchy; sub-issue creation records parent activity | Docker/API contract regression, reminders/releases and public contract/adapter | Port durable reminders rồi audit public payload |
| 2026-08-25 | P6h native Issue release links | current change-set | Private Issue options now expose persisted Releases; Issue update validates and replaces release links transactionally | Docker/API contract regression, reminders/templates and public contract/adapter | Port durable reminders rồi audit public payload |
| 2026-08-25 | P6i native Issue move | current change-set | Private Issue move assigns destination sequence/identifier, compatible status, clears invalid cycle/parent/project state and records activity | Docker/API contract regression, classification/reminders/templates and public contract/adapter | Port classification rồi audit public payload |
| 2026-08-25 | P6j native Issue classification | current change-set | Private Issue duplicate/won't-fix classification validates target access, resolves canceled status and persists resolution/activity | Docker/API contract regression, reminders/templates and public contract/adapter | Port durable reminders rồi audit public payload |
| 2026-08-25 | P6k native Issue templates | current change-set | Private FastAPI Issue template CRUD, manager RBAC, workspace reference validation and persisted label defaults | Docker/API contract regression, reminders and public contract/adapter | Port durable reminders rồi audit public payload |
| 2026-08-25 | P6l native Issue conversion | current change-set | Private Issue-to-comment conversion creates rich comment, records both activities and archives source Issue after target RBAC validation | Docker/API contract regression, reminders and public contract/adapter | Port durable reminders rồi audit public payload |
| 2026-08-25 | P6m native Issue reminders | current change-set | Private Reminder set/cancel uses persisted `issue_reminders`; FastAPI background loop atomically claims due rows, creates in-app notifications and marks delivered without new dependency | Docker/API contract and due-reminder delivery regression, public contract/adapter | Run authenticated reminder regression then audit public Issue payload |
| 2026-08-25 | P6n native Activities read-side | current change-set | Private FastAPI activity timeline supports authorized Issue/Project context with actor data; UI audit confirms Issue store still relies on fixture data, so no public cutover yet | Docker/API contract, authenticated regression and Circle Issue adapter | Build adapter that replaces Issue fixtures without presentation edits |
| 2026-08-25 | P6o Circle Issue list adapter | current change-set | `issues-store` starts empty then maps authenticated Python Issue API data into the existing Circle presentation model; All Issues triggers load without markup/style changes; active route Team scope is loaded from Python. Python now seeds/synchronizes the full Circle workflow catalog for new and existing workspaces so backend data cannot shrink or restyle the UI; offline catalog regression (2 tests) + Python compile passed | Docker/browser acceptance and mutation adapters (create/edit/status/etc.) | Rebuild web on 5G, then user verifies real Issue list |
| 2026-08-25 | P6p public Issue core contract | current change-set | FastAPI public `/issues`, `/issues/options`, `POST /issues`, `PATCH /issues/{id}` and `DELETE /issues/{id}` now expose native read/create/update/archive behavior. Advanced mutations remain private/legacy | Docker OpenAPI/API regression and adapter acceptance | Migrate one Circle mutation at a time |
| 2026-08-25 | P6q Circle Create Issue adapter | current change-set | Existing Circle Create Issue markup/class catalogue is retained; live status/member/project/label options come from Python, submit posts a persisted Issue and refreshes the real Team list. Web production build passed | Docker/browser acceptance: create Issue, refresh and verify it survives | Rebuild web on 5G, then test the Create Issue dialog |
| 2026-08-25 | P6r Circle Issue status mutation | current change-set | Status selector retains Circle presentation; live CUID status maps to the exact Circle status name (then category only as fallback), popup count resolves live IDs and `PATCH /issues/{id}` persists the selected status before the list is updated | Docker/browser acceptance of change + refresh | Rebuild web on 5G, change an Issue status and refresh |
| 2026-08-25 | P6s Circle Issue priority mutation | current change-set | Priority selector retains the Circle catalog and icons; its selected value is persisted through Python `PATCH /issues/{id}` before local state is refreshed from the returned record | Docker/browser acceptance of change + refresh | Rebuild web on 5G, change an Issue priority and refresh |
| 2026-08-25 | P6t Circle Issue assignee mutation | current change-set | Issue option hydration now includes real workspace members; unchanged Circle context menu and command palette assign/unassign them through Python `PATCH /issues/{id}` and refresh the returned Issue | Docker/browser acceptance of assign/unassign + refresh | Rebuild web on 5G and test a real workspace member |
| 2026-08-25 | P6u Circle Issue label mutation | current change-set | Issue option hydration now includes real labels; unchanged Circle context menu and command palette add/remove labels through Python `PATCH /issues/{id}` and refresh the returned Issue | Docker/browser acceptance of label add/remove + refresh | Rebuild web on 5G and test a real label |
| 2026-08-25 | P6v Circle Issue project mutation | current change-set | Issue option hydration now includes real Projects; unchanged Circle context menu and command palette assign/remove Projects through Python `PATCH /issues/{id}` and refresh the returned Issue | Docker/browser acceptance of project change + refresh | Rebuild web on 5G and test a real Project |
| 2026-08-25 | P6w Circle Issue label management | current change-set | Settings → Issue labels không còn `mock-data`; FastAPI Labels/Label groups CRUD giữ workspace RBAC, persisted count/last-applied. Nút Circle New label/New group nay mở dialog tạo record thật | Docker/browser acceptance create/edit/delete + Issue context menu hydration | Rebuild web, tạo label rồi mở Issue Labels để gán và refresh |
| 2026-08-25 | P6x Circle Issue due date mutation | current change-set | Context menu và Command Palette giữ nguyên Circle controls, nhưng set/clear due date dùng Python `PATCH /issues/{id}` thay vì Zustand-only state | Docker/browser acceptance set, clear và refresh | Rebuild web, set due date rồi refresh và clear |
| 2026-08-25 | P6y Circle Cycle read cutover | current change-set | `GET /cycles` chuyển khỏi legacy facade sang FastAPI native; active/upcoming adapter nhận đúng persisted progress/burn-up shape mà không sửa giao diện | Docker/browser acceptance Cycle active/upcoming | Rebuild web, mở active/upcoming Cycle và refresh |
| 2026-08-25 | P6z Comment public contract | current change-set | FastAPI public `/comments` nay cung cấp CRUD/reaction đã kiểm RBAC, persisted PostgreSQL và attachment metadata; chưa đổi Circle Issue-detail markup/data adapter | Contract regression và Issue-detail adapter | Port comment/activity adapter nguyên UI Circle |
| 2026-08-25 | P6aa Activity public read | current change-set | Public `/activities` chuyển sang FastAPI với Issue/Project scope RBAC và actor data persisted; chưa đổi Circle timeline UI | Contract regression và timeline adapter | Port activity timeline adapter nguyên UI Circle |
| 2026-08-25 | P6ab Attachment public contract | current change-set | Public `/attachments` cung cấp list/upload/download bằng native FastAPI + MinIO, entity/team RBAC và 10 MB guard; chưa đổi Circle attachment UI | Contract upload/download regression và adapter | Port attachment panel adapter nguyên UI Circle |
| 2026-08-25 | P6ac Issue personal state public | current change-set | Public Issue subscribe/favorite/reaction routes chạy FastAPI và persist theo user; chưa đổi Circle context/detail UI | Contract regression và personal-state adapter | Port favorite/subscribe/reaction adapter nguyên UI Circle |
| 2026-08-25 | P6ad Cycle issue mapping public | current change-set | Public Cycle issue list/add/remove routes chạy FastAPI, giữ team scope RBAC và persisted `issue_cycles`; chưa đổi Circle Cycle selector UI | Contract regression và Cycle adapter | Port Cycle selection/list adapter nguyên UI Circle |
| 2026-08-25 | P6ae Issue relation public | current change-set | Public sub-issue/relation APIs chạy FastAPI với RBAC hai Issue, relation semantics và activity persistence; chưa đổi Circle relation UI | Contract regression và relation adapter | Port relation/sub-issue adapter nguyên UI Circle |
| 2026-08-25 | P6af Issue workflow public | current change-set | Public Issue move/classification/conversion APIs chạy FastAPI với status/sequence/reference validation và activity persisted; chưa đổi Circle action UI | Contract regression và action adapter | Port action adapter nguyên UI Circle |
| 2026-08-25 | P6ag Issue reminder public | current change-set | Public set/cancel reminder APIs chạy FastAPI với future-date validation và durable worker delivery; chưa đổi Circle reminder UI | Contract regression và reminder adapter | Port reminder adapter nguyên UI Circle |
| 2026-08-25 | P6ah Issue template public | current change-set | Public Issue template CRUD chạy FastAPI với manager RBAC và workspace reference validation; chưa đổi Circle Settings template UI | Contract regression và template adapter | Port Issue template Settings adapter nguyên UI Circle |
| 2026-08-25 | P6ai Circle Comment/Activity adapter | current change-set | Issue detail Activity feed/composer giữ markup Circle, nhưng list từ `/activities` + `/comments`, submit comment persist FastAPI/PostgreSQL thay local state | Docker/browser acceptance comment + refresh | Rebuild web, post comment rồi refresh Issue detail |
| 2026-08-25 | P6aj Circle Issue Cycle display adapter | current change-set | Issue options đã có Cycle native; Issue row và properties sidebar nay hiển thị tên Cycle từ dữ liệu Python thay fixture, không đổi presentation Circle | Cycle filter/detail panel còn cần adapter riêng | Build web, sau đó refresh Issue có Cycle để nghiệm thu |
| 2026-08-25 | P6ak Circle Issue personal-state adapter | current change-set | Subscribe/Favorite trong context menu giữ nguyên Circle UI nhưng đọc trạng thái đã persist từ `/issues`, gọi FastAPI native và vẫn đúng sau refresh | Reminder UI vẫn cần nối dialog vào endpoint native | Build web, sau đó Subscribe/Favorite một Issue và refresh để nghiệm thu |
| 2026-08-25 | P6al Circle Issue reminder adapter | current change-set | “Remind me” mở dialog theo UI component sẵn có, lưu/xóa reminder qua FastAPI; Issue payload mang reminder chưa giao để dialog giữ đúng trạng thái sau refresh | Cần Docker/browser nghiệm thu notification thực tế khi đến giờ nhắc | Rebuild backend+web, đặt reminder 2–3 phút và refresh Issue |
| 2026-08-25 | P6am Circle Issue advanced-actions adapter | current change-set | Các action đã có API Python (Add link, Rename, Make a copy, Create related, Duplicate, Won't fix, Move, Convert into comment, Archive) nay được gắn vào dialog Circle có sẵn hoặc mutation native; session helper được dùng cho relation actions | Cần Docker/browser nghiệm thu từng action với workspace có hai Team/Issue | Rebuild web, thao tác action rồi refresh để xác nhận persistence |
| 2026-08-25 | P6an Circle Command Palette Issue adapter | current change-set | Cycle, Release và Team trong Command Palette nay gọi FastAPI native và giữ persistence sau refresh; due-date động theo ngày hiện tại thay hard-code; Issue detail reaction/relation/sub-issue dùng durable session helper | Cần Docker/browser nghiệm thu Command Palette trên Issue có Cycle/Release và hai Team | Rebuild web, dùng ⌘K/Ctrl+K gán Cycle/Release/Team rồi refresh |
| 2026-08-25 | P6ao Circle Issue templates Settings adapter | current change-set | Settings → Issue templates không còn record bịa; danh sách, tạo, sửa và xóa dùng FastAPI template CRUD với session durable và RBAC manager | Cần Docker/browser nghiệm thu manager và member 403 | Rebuild web, tạo/sửa/xóa template rồi refresh |
| 2026-08-25 | P6ap Circle Cycles create/list adapter | current change-set | Team → Cycles không còn đọc fixture: timeline và burn-up Circle giữ nguyên markup, dữ liệu/progress lấy FastAPI; thêm đúng entry point Create cycle để tạo Upcoming/Active Cycle thật, có date validation và RBAC. Đã sửa truy vấn list không-filter của PostgreSQL (nullable bind gây 500/CORS symptom trong browser) | Cần Docker/browser nghiệm thu tạo Cycle và gán Issue qua Command Palette | Rebuild API+web, tạo Cycle, rồi Ctrl/Cmd+K → Move to cycle trên một Issue và refresh |
| 2026-08-25 | P7a native Initiatives API | current change-set | FastAPI có contract Initiative thật: list/detail/create/update/archive, link/unlink Project, activity audit, updates và resources; mutations yêu cầu Owner/Admin, liên kết kiểm workspace scope và dữ liệu dùng PostgreSQL | Chưa chuyển trang Circle khỏi fixture; cần adapter nguyên UI baseline | Docker startup/OpenAPI passed; host unittest thiếu argon2 nên không dùng làm tín hiệu regression |
| 2026-08-25 | P7b Circle Initiatives list/create adapter | current change-set | Trang Initiatives, filter owner/health và side-panel giữ layout Circle nhưng list lấy FastAPI/PostgreSQL; nút Plus có sẵn trên header nay mở Create Initiative và gửi mutation native, sau đó reload list qua event | Initiative detail còn fixture, cần adapter riêng sau UI acceptance list | Web production build passed; Docker/browser nghiệm thu list trống/dữ liệu, tạo Initiative, refresh và filter |
| 2026-08-25 | P7c Circle Initiative detail read adapter | current change-set | Route Initiative detail (Overview/Activity/Projects) nay tìm Initiative thật thay fixture nên record vừa tạo mở được; overview/resources/updates/project count lấy payload native, Activity không còn event bịa, Progress tổng hợp các Issue/Project liên kết thay deterministic pseudo-random series | Các edit control (update/resource/link project) còn cần mutation dialog native riêng | Web production build passed; Docker/browser mở Initiative vừa tạo, đổi tabs và refresh |
| 2026-08-25 | P7d Circle Initiative detail mutation adapter | current change-set | Các control Circle có sẵn trên Overview nay gọi FastAPI/PostgreSQL: post update kèm health, add HTTP(S) resource và link Project trong workspace; sau save data reload qua event, resource hiển thị lại trong chính hàng Resources | Còn các property editor (status/priority/owner/target/labels), unlink Project và Initiative settings | Build web, rồi người dùng post update/add resource/link Project và refresh để nghiệm thu persistence |
| 2026-08-25 | P7e Initiative property and label persistence | current change-set | Initiative detail giữ Circle layout nhưng Status, Priority và Target date PATCH trực tiếp FastAPI; Label dùng bảng liên kết `initiative_label_links` có Prisma migration, API link/unlink và selector lấy workspace labels thật. ISO timestamps nay parse chuẩn, và nội dung update xuất hiện trên Overview/Activity | Owner, description, icon, unlink Project/Label và Initiative settings còn chưa có adapter | Rebuild api-legacy để deploy migration, api+web; sau đó nghiệm thu đổi property, add label và refresh |
| 2026-08-25 | P7f Initiative detail header parity repair | current change-set | Header Circle gốc (breadcrumb, Initiative title và Overview/Activity/Projects tabs) không còn return `null` với Initiative thật: thay lookup fixture bằng native Initiative hook/adapter | Các header action Star/More chưa có persistence adapter | Build web, mở Initiative thật và xác nhận hai thanh header xuất hiện đúng Circle |
| 2026-08-25 | P7g Initiative remaining property controls | current change-set | Các affordance Circle có sẵn nay persist Owner, Description và Icon bằng native PATCH; dialog link Project/Label cũng hiển thị liên kết hiện có và gỡ qua API DELETE đã kiểm RBAC | Favorite/header More và Settings Initiatives vẫn chưa có scope persistence | Build web, đổi owner/description/icon và gỡ một Label/Project, sau đó refresh để nghiệm thu |
| 2026-08-25 | P3d Circle Workspace UI cutover | `8a2ccd1` | Web build + FastAPI regression đạt; browser smoke ghi nhận `401 → /auth/refresh 200 → /workspaces/me 200`; switcher không còn hard-code workspace | Members presentation còn fixture; invite API native đã sẵn sàng | Tạo workspace đầu tiên rồi nối Members UI |
| 2026-08-25 | P3e Circle Profile UI cutover | current change-set | Settings → Profile dùng native Python `/users/me`; họ tên, chức danh và username lưu thật khi rời ô; avatar upload JPEG/PNG/GIF/WebP tối đa 5 MB vào MinIO, còn thiếu ảnh thì hiện chữ cái đầu trên màu xác định từ tên; Avatar primitive dùng chung cũng phân giải khóa MinIO thành endpoint ảnh nên ảnh xuất hiện ở Issue/Project/Member; Leave workspace dùng native API và confirmation dialog Circle | Email-change cần flow xác minh email riêng, không tự cho sửa trực tiếp | Build web, sau đó người dùng upload/chỉnh Profile và refresh để nghiệm thu |
| 2026-08-25 | P4d Circle Teams/Members UI cutover | current change-set | Web production build và Docker web build đạt; Team/Member list, tạo Team, invite, role và remove đều dùng Python API, không còn mock ở scope này | Cần một workspace có ít nhất hai tài khoản đã đăng ký để nghiệm thu UI thao tác thật | Người dùng tạo workspace, tạo Team và mời tài khoản Flowie thứ hai để test |
| 2026-08-25 | P4e Join Team/Workspace | current change-set | Web production build đạt; Join Team và Workspace invitation đã có entry point trong UI gốc | Cần tài khoản thứ hai để xác nhận invitation/join thực tế | Rebuild Docker, sau đó nghiệm thu hai-account flow |
| 2026-08-25 | P8a Project properties native cutover | current change-set | Settings → Project properties giữ nguyên UI Circle, nhưng CRUD custom fields nay chạy FastAPI/PostgreSQL và không qua legacy facade; chỉ Owner/Admin được đổi schema, type change xóa value không tương thích như contract cũ | Cần build/Docker/API regression và nghiệm thu tạo/sửa/xóa property | Rebuild API+web, tạo một property, refresh, sửa type rồi xóa |
| 2026-08-25 | P8b Project labels native cutover | current change-set | Settings → Project labels không còn placeholder: dùng lại component Circle Labels sẵn có, giữ layout/dialog nhưng list/create/edit/delete đi vào FastAPI/PostgreSQL `project_labels`; count là số Project đang gán label, không lẫn với Issue labels/groups | Cần Docker/browser nghiệm thu CRUD và Project label selector hydration | Rebuild API+web, tạo Project label, gán vào Project rồi refresh |
| 2026-08-25 | P8c Project statuses native cutover | current change-set | Settings → Project statuses giữ khung workflow Circle và icon catalog cố định; list/create/edit/delete nay đi FastAPI/PostgreSQL, đổi tên chuyển Project đang dùng status cũ và chặn xóa khi status còn Project | Cần Docker/browser nghiệm thu load catalog, tạo/sửa/xóa status chưa dùng và refresh | Rebuild API+web, mở Statuses, thay đổi một status trống rồi refresh |
| 2026-08-26 | P8d Project templates native cutover | current change-set | Settings → Project templates không còn placeholder: dùng component Circle sẵn có và CRUD FastAPI/PostgreSQL (`project_templates`), Owner/Admin quản lý template; đồng thời sửa import biểu tượng lỗi ẩn của component vốn chưa từng được route | Cần Docker/browser nghiệm thu tạo/sửa/xóa và refresh; Create Project chưa có entry point chọn template trong UI gốc | Rebuild API+web, tạo template rồi refresh |
| 2026-08-26 | P8e Project updates native cutover | current change-set | Settings → Project updates không còn placeholder: giữ component Circle có sẵn, feed workspace và Project detail read/create update đi FastAPI/PostgreSQL; author/avatar và Project được trả từ dữ liệu thật, static route `/projects/updates` được đăng ký trước dynamic Project detail route, và public CUID wrapper đã khôi phục đúng prefix để Project detail không 500/CORS giả | Cần Docker/browser nghiệm thu post update trên Project rồi xem Settings feed và refresh | Rebuild API+web, tạo một Project update, mở Settings → Projects → Updates và refresh |
| 2026-08-26 | P8f Project detail property/milestone cutover | current change-set | Giữ nguyên Project sidebar Circle nhưng gắn Status, Priority, Lead, Members, Dates, Team, Initiative và Labels vào FastAPI/PostgreSQL; tạo/toggle Milestone đã persist, serializer milestone dùng camelCase chuẩn; Issue status icon ưu tiên catalog Circle thay Lucide fallback | Custom field values và áp dụng template khi Create Project là lát kế tiếp; cần browser nghiệm thu mutations/reload | Rebuild API+web, đổi từng property, tạo/toggle milestone rồi refresh cả Overview và Issues |
| 2026-08-26 | P8g Project values/template cutover | current change-set | Giá trị Project custom property nay có endpoint FastAPI/PostgreSQL theo type/option validation và được sửa qua row Circle trong sidebar; Create Project hiển thị template có sẵn và backend áp dụng type/description/default config của template mà không thay bố cục dialog | Cần Docker/browser nghiệm thu field TEXT/SELECT/DATE/MULTI_SELECT và tạo Project từ template | Rebuild, tạo/sửa custom property rồi gán giá trị và tạo một Project với template |
| 2026-08-26 | P8h Project remaining actions audit | current change-set | Favorite, copy permalink, Resources (thêm link thật) và Activity “See all” đã nối mutation/navigation native; Members đã thuộc P8f. Slack/More vẫn là integration/menu chưa có backend scope, giữ nguyên affordance Circle thay vì giả lập thành công | Cần audit Settings, Views, Inbox theo phạm vi còn placeholder/mock | Lập inventory chính xác và ưu tiên vertical slice tiếp theo |
| 2026-08-26 | P8i Settings/Views/Inbox audit | current change-set | Audit source xác nhận Settings còn placeholder route: SLAs, Releases, Initiatives, Pulse, Asks, Emojis, Documents, Customer requests; Views còn fixture presentation ở một số issue-filter/display components; Inbox/My issues còn phụ thuộc issue fixture trong `use-my-issues`. Không đánh dấu là đã triển khai khi chưa có API/native adapter | Cần chọn thứ tự: Inbox/My issues trước để luồng dùng hàng ngày không còn mock; sau đó Saved views, rồi Settings placeholder theo module | P8j Inbox/My Issues native adapter, P8k Saved views, P8l Settings modules |
| 2026-08-26 | P8j Inbox/My issues native adapter | current change-set | Inbox không còn seed `mock-data/inbox`: FastAPI Python `/notifications` đọc/đánh-dấu-đã-đọc/xóa từ PostgreSQL, Circle markup giữ nguyên và ánh xạ thông báo Issue thật sau khi hydrate. My issues không còn suy luận owner/subscription từ fixture: lấy `/users/me`, Issue creator/subscription/status live và Team breakdown từ workspace thật. Inbox preview dùng mô tả Issue persisted thay rich detail fixture. | Cần Docker/browser nghiệm thu Inbox trống hoặc reminder, read/delete; kiểm My issues bốn tab sau refresh. | Rebuild API+web, tạo reminder gần hạn để tạo Inbox record; sau đó P8k Saved views. |
| 2026-08-26 | P8k Saved views native adapter | current change-set | FastAPI Python `/views` giờ giữ list/detail/create/delete SavedView với workspace scope, private/shared visibility và creator-only delete. Circle Views list, Create view và detail dùng records/filter persisted cùng Issue/Project live, không còn import `mock-data/views`; team route không bịa team filter vì schema SavedView hiện tại chưa có `team_id`. | Delete endpoint đã sẵn sàng nhưng More action của UI gốc chưa có affordance delete; team-scoped SavedView cần migration được phê duyệt riêng. | Docker/browser: tạo Issue/Project View, refresh, mở detail; sau đó P8l Settings modules hoặc audit Views actions. |
| 2026-08-26 | P8l Releases Python cutover | current change-set | Giữ nguyên màn hình Settings → Releases của Circle; FastAPI Python `/releases` nay có list/create/edit/archive, RBAC Owner/Admin cho mutation, liên kết Project được kiểm workspace và audit trail. UI chuyển sang `authenticatedFetch`, nên session được refresh đúng trước các request; không còn phụ thuộc route Nest cũ cho Releases. | Emoji/custom settings còn dùng contract Nest cũ; cần port từng module sang Python thay vì coi UI có sẵn là đã hoạt động. | Rebuild API+web, tạo/sửa/archive Release, liên kết Project rồi refresh; tiếp theo P8m Emojis Python cutover. |
| 2026-08-26 | P8m Emojis Python cutover | current change-set | Giữ nguyên Settings → Emojis; FastAPI Python `/emojis` nay list/upload/image/archive với Owner/Admin mutation, kiểm magic bytes PNG/JPEG/GIF/WebP, giới hạn 512 KB, MinIO private object và audit log. Upload cùng tên sau khi archive sẽ khôi phục record đúng contract cũ. UI dùng durable `authenticatedFetch`; ảnh vẫn qua authenticated endpoint cũ về mặt presentation. | Các Settings placeholder còn lại cần audit theo data model: SLAs, Asks, Customer requests, Pulse và Documents. | Rebuild API+web, upload một PNG/JPEG dưới 512 KB, refresh xem ảnh, xóa rồi upload lại tên cũ; tiếp theo P8n Customer requests/Asks. |
| 2026-08-26 | P8n Customer requests Python cutover | current change-set | Giữ nguyên Settings → Customer requests; FastAPI Python `/customer-requests` giờ có list/create/edit/archive, reference validation cho Project/Issue, creator-or-Owner/Admin authorization và audit log. UI cùng dialog Circle dùng `authenticatedFetch`, nên không còn route Nest cũ hoặc session dễ hết hạn. | Asks/SLA/Pulse chưa chuyển Python; Customer request cần browser acceptance sau Docker. | Rebuild API+web, tạo/sửa/archive một Customer request, link Project/Issue và refresh; tiếp theo P8o Asks Python cutover. |
| 2026-08-26 | P8o Asks Python cutover | current change-set | Giữ nguyên Settings → Asks; FastAPI Python `/asks` nay có list theo Team membership, create/edit/decline/archive, creator-or-Owner/Admin guard, Project/Team scope validation và audit. Action Circle “Create issue” dùng FastAPI Issue contract để tạo Issue thật, sau đó Ask được persist `accepted` + `convertedIssueId`; UI dùng `authenticatedFetch`. | SLA/Pulse và một số Settings non-core chưa có Python contract; cần browser acceptance chuyển Ask → Issue. | Rebuild API+web, tạo Ask, sửa/decline một Ask khác, chuyển Ask thành Issue và refresh cả Ask/Team Issue; sau đó P8p SLA audit/cutover. |
| 2026-08-26 | P8p SLA Python cutover | current change-set | Giữ nguyên Settings → SLAs; FastAPI Python `/slas` có list/create/edit/archive, Owner/Admin guard, Team validation và audit. Khi tạo Issue qua Python mà không chọn due date, resolver SLA chọn policy enabled cụ thể nhất (Team rồi Priority) và đặt deadline persisted; không còn chỉ hiển thị policy mà không áp dụng. | Pulse và các Settings non-core khác còn cần contract Python/audit. | Rebuild API+web, tạo SLA Team/Priority, tạo Issue không due date rồi refresh để kiểm deadline; tiếp theo P8q Pulse audit. |
| 2026-08-26 | P8q Pulse Python cutover | current change-set | Route Settings → Pulse đã dùng đúng màn Pulse Circle thay vì placeholder. FastAPI Python `/pulse` tổng hợp activity và Project update persisted, lọc theo membership/Team access, giữ actor/entity/date/health để UI read-only hiện có render nguyên vẹn; UI dùng authenticated session helper. | Cần Docker/browser acceptance; Settings non-core còn lại cần audit tiếp. | Rebuild API+web, mở Pulse, kiểm update/Issue activity và click entity; tiếp theo audit Documents/Settings placeholders. |
| 2026-08-26 | P4f Team Home/settings/members/documents cutover | current change-set | Team Home, header, Members và Documents không còn import fixture; dùng `useLiveTeam` + FastAPI/PostgreSQL. Documents folders/list/create đã chuyển từ legacy proxy sang Python; Team settings giữ từng section Circle và persist General, access, default template, workflow, triage, cycles, hierarchy, leave/retire/delete. | Cần Docker/browser nghiệm thu Team permissions: manager sửa/add/remove, member bị 403; Documents create/refresh | Rebuild API+web, mở Team Home/Documents/Members/Settings và tạo một document thật |
| 2026-08-26 | P6aq Team icon and Current/Upcoming Cycle UI cutover | current change-set | Team General settings giữ dialog Circle và nay lưu icon thật qua Python Team PATCH. Issue/Cycle breadcrumb không còn fallback `LNDev Core`: lấy Team/Cycle đã hydrate từ API. Current/Upcoming Cycle dùng `useLiveCycle` để đọc Cycle và Issue/status thật từ FastAPI thay `mock-data`; khi chưa có Cycle thì hiển thị empty state dữ liệu thật. | Cần Docker/browser nghiệm thu đổi icon, Issue breadcrumb và Cycle active/upcoming sau refresh | Rebuild web, đổi icon Team, mở một Issue thuộc Team đó rồi kiểm tra Current/Upcoming Cycles |
| 2026-08-26 | P0c Flowie brand and README | current change-set | Thay logo Flowie/favicons/metadata bằng mark hình khối cam được duyệt; README Anh–Việt mô tả đúng FastAPI/Python, Docker offline/5G workflow, feature đã có, kiến trúc, quy ước UI-parity và attribution Circle, không dùng badge Go/Nest sai thực tế | Cần production build và browser kiểm logo login/loading/favicons | Rebuild web rồi kiểm tra logo tại login/loading và README render trên GitHub |
| 2026-08-26 | P3f Workspace icon settings | current change-set | Workspace nay có icon persisted ở PostgreSQL qua FastAPI `PATCH /workspaces/{id}` với Owner/Admin RBAC và audit log. Settings có mục Workspace → General theo shell Circle; icon/emoji được đồng bộ ngay sang sidebar và Switch Workspace, fallback vẫn là chữ cái tên workspace khi để trống | Cần migration deploy + Docker/browser nghiệm thu đổi icon, refresh và chuyển workspace | Rebuild api-legacy/api/web, vào Workspace Settings, đặt emoji rồi refresh và mở Switch Workspace |
| 2026-08-26 | P4g Team document folders and external sources | current change-set | Team Documents giữ list Circle nhưng có New folder và New document theo folder. Document source nay lưu `flowie`/`upload`/`link`; tệp DOCX/PDF/MD upload private MinIO qua attachment native và link SharePoint/Google Drive/HTTP(S) được validate/persist; row hiển thị action download/open link | Cần migration deploy + Docker/browser nghiệm thu folder, upload, link và refresh | Rebuild api-legacy/api/web, tạo folder rồi tạo PDF/MD/DOCX và một link SharePoint/Google Drive, refresh để kiểm persistence |
| 2026-08-26 | P3g Restore personal Settings entry point | current change-set | Menu Settings ở workspace switcher nay mở `/settings` và redirect về Personal → Preferences như Circle; Profile, Notifications, Security, Connected accounts… vẫn hiển thị trong Settings sidebar. Workspace → General vẫn là mục riêng cho Owner/Admin, không còn che các thiết lập cá nhân. | Cần browser nghiệm thu đường dẫn menu và navigation | Mở menu workspace → Settings, kiểm Preferences/Profile; mở Workspace → General để đổi icon |
| 2026-08-26 | P3h Preserve Settings navigation on Workspace General | current change-set | Route Workspace → General nay dùng cùng `MainLayout` và Settings header/sidebar như mọi Settings page Circle. Vì vậy kể cả bookmark/URL cũ `/settings/workspace`, người dùng vẫn điều hướng được Profile, Preferences, Notifications và toàn bộ nhóm setting khác. | Cần Docker/browser nghiệm thu trực tiếp route workspace | Mở `/settings/workspace`, kiểm sidebar Personal → Profile và Workspace → General |
| 2026-08-26 | P3i Shared icon picker | current change-set | Team General, Initiative Change icon và Workspace General dùng chung bộ chọn 60 icon curated (không thêm dependency), vẫn giữ ô nhập để dùng emoji/ký tự riêng. Lựa chọn được lưu qua đúng API persisted sẵn có. | Cần browser nghiệm thu ba bề mặt icon | Mở Team settings, Initiative Change icon và Workspace General; chọn icon, Save rồi refresh/sidebar để kiểm persistence |
| 2026-08-26 | P4h Native Markdown documents and folder management | current change-set | “Flowie document” được đổi thành Markdown document; click mở rendered View, có nút Edit chuyển sang editor full-screen split-pane (source + preview) và auto-save title/content sau 800ms qua FastAPI. Auto-save cập nhật document/folder ngay trong state thay vì reload toàn Team, tránh editor bị remount hoặc giật khi đang gõ. Folder có icon chọn/lưu thật, document có xóa soft-delete với xác nhận; header Documents dùng cùng grid cột với rows nên Created/Last edited thẳng hàng. Migration đổi record/default source type cũ `flowie` thành `markdown`; upload/link giữ nguyên. | Cần Docker/browser nghiệm thu view/editor/autosave/xóa | Tạo Markdown document, kiểm rendered View, bấm Edit gõ nội dung/chờ Saved rồi refresh; đổi icon folder, xóa document, kiểm ngày Created/Last edited |
| 2026-08-26 | P4i Private uploaded-file previews | current change-set | Upload PDF mở trực tiếp trong viewer full-screen của trình duyệt; DOCX được FastAPI chuyển thành HTML preview nội bộ bằng Mammoth, còn Markdown upload hiển thị source an toàn. Mọi preview xác thực theo workspace/team và được sandbox trong iframe; file gốc vẫn có nút Download. Không gửi tài liệu sang dịch vụ bên thứ ba. | Cần Docker/browser nghiệm thu preview PDF/DOCX/MD | Upload một PDF và DOCX, click tên hoặc biểu tượng mắt; kiểm full-screen preview, Download original và quyền truy cập workspace |
| 2026-08-26 | P4j Resource intent and editable project description | current change-set | Hai CTA Team resources nay có nghĩa riêng: `+` mở trực tiếp tạo Markdown document, còn biểu tượng liên kết mở form thêm SharePoint/Google Drive/web link. Project Overview có bút Edit tại Description, textarea Save/Cancel và PATCH qua FastAPI persisted. | Cần browser nghiệm thu hai CTA và Project Description | Trên Team Home hover hai nút để kiểm tooltip, click từng nút; tại Project Overview bấm bút Description, Save rồi refresh |
| 2026-08-26 | P4k Project Overview property adders | current change-set | Các dấu `+` trong Project Overview được nối backend: Initiatives mở bộ chọn nhiều lựa chọn và gọi native initiative-project link API; Labels mở bộ chọn Project labels và PATCH `labelIds`; Resources giữ form thêm URL thực. Các selection hiện có có thể mở lại để gỡ/bổ sung rồi Save. | Cần browser nghiệm thu Initiatives/Labels/Resources | Trong Project Overview bấm từng dấu `+`, chọn/bỏ item, Save rồi refresh; thêm Resource URL và kiểm persistence |
| 2026-08-26 | P4l Project Overview property parity | current change-set | Adapter Project và Properties panel nay dùng toàn bộ `initiativeLinks` thay vì chỉ lấy initiative đầu tiên, nên hai bề mặt hiển thị cùng một danh sách. Các property inline trên Overview (Status, Priority, Lead, Dates, Team) giữ bố cục Circle gốc nhưng đã là control mở dialog và PATCH cùng API/PostgreSQL mà panel bên phải đang dùng. | Cần Docker/browser nghiệm thu persistence từ hàng Properties chính | Tại Project Overview đổi Status, Priority, Lead, Dates và Team từ hàng Properties, refresh rồi xác nhận cả hàng chính lẫn panel Properties giống nhau; liên kết từ hai Initiative trở lên để kiểm tra cả hai nơi cùng hiển thị. |
| 2026-08-26 | P4m Project property picker presentation | current change-set | Các picker mới của Project Overview đã dùng presentation chuẩn Circle: Status có status icon/màu, Priority có priority icon, Lead hiển thị Avatar và Team hiển thị icon trong trigger lẫn danh sách. Không đổi cấu trúc dialog hay contract API. | Cần Docker/browser kiểm tra presentation | Mở từng Status/Priority/Lead/Team picker trên Project Overview, kiểm icon/avatar ở lựa chọn và lựa chọn đang dùng, đổi giá trị rồi refresh. |
| 2026-08-26 | P8m Live Issue analytics panel | current change-set | Insights panel bỏ dependency `mock-data/issues`, status và priority fixture: biểu đồ/bảng tổng hợp trực tiếp Issue runtime, nên status tùy biến từ workspace được hiển thị. Slice/Segment hoạt động với Status, Priority, Assignee và Project; click hàng tiếp tục áp dụng filter Circle thật. | Cần Docker/browser nghiệm thu chart/table | Mở Insights ở Project/Issue list, kiểm số Issue, đổi Slice/Segment, click một hàng để filter rồi refresh dữ liệu. |

## 13. Definition of Done toàn dự án

- [ ] Tất cả route trong scope đạt Circle UI parity hoặc có ngoại lệ được duyệt.
- [ ] Không còn record mock, canned response hoặc mutation no-op trong production.
- [ ] Tất cả API trong scope chạy native Python; legacy proxy count bằng 0.
- [ ] Auth, RBAC, workspace isolation và audit có regression test.
- [ ] PostgreSQL/Redis/MinIO/Discord/background jobs hoạt động thật.
- [ ] Alembic là migration authority duy nhất; rollback rehearsal thành công.
- [ ] NestJS, Prisma runtime và Node worker đã được gỡ trong commit có thể revert.
- [ ] Docker start offline bằng image đã build, không pull/install.
- [ ] Người dùng đã nghiệm thu Project và full regression light/dark.

## 14. Điều kiện dừng và hỏi người dùng

Chỉ dừng để hỏi khi:

- cần cài dependency/pull image/rebuild mà người dùng chưa xác nhận 5G;
- một thay đổi làm lệch Circle UI hoặc mở rộng product scope;
- contract Python buộc phải khác NestJS theo cách frontend/người dùng nhìn thấy;
- cần credential/secret/integration thật chưa được cung cấp;
- phát hiện thay đổi chưa commit của người dùng chồng lên file cần sửa;
- chuẩn bị freeze Prisma, chuyển Alembic authority hoặc xóa legacy backend.

Không dừng chỉ vì một endpoint chưa migrate: giữ route đó qua legacy facade, ghi rõ trong nhật ký và
tiếp tục endpoint độc lập kế tiếp.
