# Circle Platform

Circle Platform evolves the [Circle](https://github.com/ln-dev7/circle) UI into a
full project-management application. The original UI stays in `apps/web`; the API,
worker and shared packages are introduced as a pnpm workspace.

## Workspace layout

```text
apps/web       Next.js Circle UI
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

Lệnh luôn chạy với `--no-build --pull never`: không build image, không kéo image
và không tải package. Nếu image chưa tồn tại hoặc mã nguồn/dependency đã thay đổi,
lệnh sẽ dừng và báo thiếu tài nguyên thay vì âm thầm truy cập Internet.

Chỉ các thao tác dưới đây mới có thể cần Internet, vì vậy hãy chuyển sang 5G trước
khi chạy hoặc báo Codex thực hiện:

```bash
pnpm install          # dependency mới hoặc lockfile thay đổi
pnpm docker:build     # build image lần đầu / sau khi thay Dockerfile, source hay dependency
pnpm docker:rebuild   # build lại rồi chạy container
docker compose pull   # cập nhật base image
```

Sau khi đã có image và dependency cache, `pnpm docker:up` chạy được trong mạng nội
bộ. Dừng các container với `pnpm docker:down`.

## Local development

1. Copy `.env.example` to `.env` and adjust secrets for local use.
2. Start PostgreSQL, Redis and MinIO: `pnpm infra:up`.
3. Install packages: `pnpm install`.
4. Generate Prisma Client: `pnpm db:generate`.
5. Start all applications: `pnpm dev`.

The web app runs at `http://localhost:3000`. The API health endpoint is
`http://localhost:4000/api/v1/health` and Swagger is at
`http://localhost:4000/api/docs`.

Lần build Docker đầu tiên dùng `pnpm docker:build`; các lần chạy sau dùng
`pnpm docker:up`.

## Current scope

This commits the foundation only: workspace layout, local infrastructure, API
versioning, Swagger, health endpoint, worker boundary and the initial Prisma domain
for users and workspaces. Authentication and real frontend data integration are the
next milestones; Circle mock data remains intact until each matching module migrates.
