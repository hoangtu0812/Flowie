# Flowie Backend (Go)

API server cho Flowie: Go 1.26 · chi · pgx · PostgreSQL. Xác thực qua Azure AD
(OIDC), lưu file qua SharePoint (Microsoft Graph).

## Chạy dev

```bash
# từ thư mục gốc repo
cp .env.example .env          # điền secrets (xem docs/azure-sharepoint-setup.md)
docker compose up -d db       # Postgres
cd backend
make run                      # tự chạy migrations rồi serve :8080
```

`SESSION_SECRET` phải ≥ 32 bytes. `DATABASE_URL` bắt buộc.

## Kiến trúc

```
cmd/
├── api/         # entrypoint HTTP server
└── devtoken/    # CLI dev-only: cấp session token khi chưa có Azure
internal/
├── config/      # nạp cấu hình từ env
├── db/          # pgx pool + migration runner (embed migrations/*.sql)
├── domain/      # entity types
├── store/       # repositories (pgx)
├── auth/        # Azure OIDC provider, JWT session, middleware
├── handlers/    # HTTP handlers + RBAC checks
├── httpx/       # response helpers
├── server/      # chi router
├── storage/sharepoint/  # Microsoft Graph client + auto folder tree
└── util/        # slug
```

Auth optional: server vẫn boot khi thiếu Azure/SharePoint (endpoint tương ứng
báo 503 / bỏ qua). Xem `features` trong `GET /healthz`.

## API (v1)

| Method | Path | Ghi chú |
|--------|------|---------|
| GET  | `/healthz` | liveness + feature flags |
| GET  | `/api/v1/auth/azure/login` | bắt đầu SSO |
| GET  | `/api/v1/auth/azure/callback` | redirect từ Azure |
| POST | `/api/v1/auth/logout` | xoá session |
| GET  | `/api/v1/me` | hồ sơ user hiện tại |
| GET/POST | `/api/v1/workspaces` | liệt kê / tạo workspace |
| GET  | `/api/v1/workspaces/{id}` | chi tiết workspace |
| GET/POST | `/api/v1/workspaces/{id}/projects` | liệt kê / tạo project |
| GET  | `/api/v1/projects/{id}` | chi tiết project |
| GET/POST | `/api/v1/projects/{id}/tasks` | liệt kê / tạo task |
| PATCH | `/api/v1/tasks/{id}/status` | đổi trạng thái (Kanban) |

Tất cả route dưới `/api/v1` (trừ `/auth/*`) cần session cookie hoặc
`Authorization: Bearer <token>`.

## Migrations

Đặt file `internal/db/migrations/NNNN_name.sql`. Chạy tự động khi boot; theo dõi
trong bảng `schema_migrations`.
