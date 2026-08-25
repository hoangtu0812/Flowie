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
| 2026-08-25 | P3d Circle Workspace UI cutover | `8a2ccd1` | Web build + FastAPI regression đạt; browser smoke ghi nhận `401 → /auth/refresh 200 → /workspaces/me 200`; switcher không còn hard-code workspace | Members presentation còn fixture; invite API native đã sẵn sàng | Tạo workspace đầu tiên rồi nối Members UI |
| 2026-08-25 | P4d Circle Teams/Members UI cutover | current change-set | Web production build và Docker web build đạt; Team/Member list, tạo Team, invite, role và remove đều dùng Python API, không còn mock ở scope này | Cần một workspace có ít nhất hai tài khoản đã đăng ký để nghiệm thu UI thao tác thật | Người dùng tạo workspace, tạo Team và mời tài khoản Flowie thứ hai để test |
| 2026-08-25 | P4e Join Team/Workspace | current change-set | Web production build đạt; Join Team và Workspace invitation đã có entry point trong UI gốc | Cần tài khoản thứ hai để xác nhận invitation/join thực tế | Rebuild Docker, sau đó nghiệm thu hai-account flow |

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
