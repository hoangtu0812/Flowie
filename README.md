# Flowie

> Agent tiếp quản phải đọc [`implement_plan.md`](implement_plan.md). Các handoff/audit cũ đã được
> lưu tại `docs/history` và không còn là nguồn trạng thái hiện hành.

Flowie evolves the Circle UI foundation into a full project-management application.
The frontend stays in `apps/web`; the API, worker and shared packages are introduced
as a pnpm workspace.

## Workspace layout

```text
apps/web       Next.js frontend
apps/api       NestJS REST API (`/api/v1`)
apps/worker    BullMQ background worker
packages/database   Prisma schema and generated client
packages/contracts  Shared API contracts
packages/config     Shared TypeScript defaults
infrastructure/     Docker files and future Kubernetes manifests
```

## Chạy Docker trong mạng nội bộ

Dùng lệnh này cho mọi lần chạy thông thường:

```bash
pnpm docker:up
```

Trên Windows, có thể dùng script nhanh:

```powershell
.\scripts\start-local.ps1
```

Lệnh luôn chạy với `--no-build --pull never`: không build image, không kéo image
và không tải package. Nếu image chưa tồn tại hoặc mã nguồn/dependency đã thay đổi,
lệnh sẽ dừng và báo thiếu tài nguyên thay vì âm thầm truy cập Internet.

Chỉ các thao tác dưới đây mới có thể cần Internet, vì vậy hãy chuyển sang 5G trước
khi chạy:

```bash
pnpm install          # dependency mới hoặc lockfile thay đổi
pnpm docker:build     # build image lần đầu / sau khi thay Dockerfile, source hay dependency
pnpm docker:rebuild   # build lại rồi chạy container
docker compose pull   # cập nhật base image
```

Sau khi đã chuyển sang 5G, dùng script có chủ đích dưới đây để build và tự smoke-test
FastAPI facade, API legacy và trang đăng nhập. Script dừng ngay nếu không truyền
`-AllowNetwork`, nên không có lần build nào tự âm thầm dùng Internet:

```powershell
.\scripts\build-and-test.ps1 -AllowNetwork
```

Khi script báo thành công, quay về mạng nội bộ và dùng `.\scripts\start-local.ps1` cho các lần
chạy thường ngày.

Sau khi đã có image và dependency cache, `pnpm docker:up` chạy được trong mạng nội
bộ. Dừng các container với `pnpm docker:down`.

## Local development

1. Copy `.env.example` to `.env` and adjust secrets for local use.
2. Start PostgreSQL, Redis and MinIO: `pnpm infra:up`.
3. Install packages: `pnpm install`.
4. Generate Prisma Client: `pnpm db:generate`.
5. Start all applications: `pnpm dev`.

The web app runs at `http://localhost:3000`. The API health endpoint is
`http://localhost:4000/api/v1/health`, the FastAPI readiness endpoint is
`http://localhost:4000/readyz`, and the Python API docs are at
`http://localhost:4000/docs`.

Lần build Docker đầu tiên dùng `pnpm docker:build`; các lần chạy sau dùng
`pnpm docker:up`.

## Current scope

Flowie now has real, server-backed workspaces (owner/admin/member roles), teams,
projects, issues, cycles, documents, comments, labels, invitations, initiatives,
saved views, profile and a platform-admin console. Projects support multiple types,
milestones, custom fields and templates. Archived records are retained rather than
silently deleted.

Discord notifications are delivered through Redis/BullMQ with retry in the worker;
the UI never returns the saved webhook URL. The API also stores an audit trail for
platform-admin changes at `GET /api/v1/admin/audit` and workspace managers can read
their audit stream at `GET /api/v1/audit?workspaceId=...`.

For a new local setup, configure `ADMIN_BOOTSTRAP_EMAIL`,
`ADMIN_BOOTSTRAP_PASSWORD` and `ADMIN_BOOTSTRAP_NAME` in `.env` before the first
API start. Keep `.env` private: it is ignored by Git.
