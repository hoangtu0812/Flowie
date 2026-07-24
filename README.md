# Flowie — Enterprise Project Management

Flowie là nền tảng quản lý dự án cấp doanh nghiệp (theo phân tích trong
[`project_management_app_analysis.md`](./project_management_app_analysis.md)).

## Tech stack

| Layer      | Choice                                   |
|------------|------------------------------------------|
| Backend    | Go 1.26 · chi (net/http) · sqlc · pgx     |
| Database   | PostgreSQL 16                            |
| Frontend   | Next.js (React + TypeScript)             |
| Auth       | Azure AD (OpenID Connect / OAuth2)       |
| Files      | SharePoint qua Microsoft Graph API       |
| Dev env    | Docker Compose                           |

## Phạm vi triển khai (theo thứ tự ưu tiên)

1. **Nền tảng (đang làm):** IAM + **SSO Azure AD**, phân cấp Workspace → Project → Task, RBAC.
2. Core task management (Module 3).
3. Views: List / Kanban / Gantt / Calendar (Module 4).
4. Reporting, Automation, Notifications (Module 5–7).
5. Tích hợp lưu trữ file qua **SharePoint** (tự tạo cấu trúc subfolder).

> Ghi chú: SSO chỉ triển khai **Azure AD** trước. Các provider khác (Google/Apple/SAML)
> để giai đoạn sau. Lưu trữ file dùng một folder SharePoint được cấu hình sẵn,
> hệ thống tự sinh cây thư mục con theo Workspace/Project/Task.

## Bắt đầu nhanh (dev)

```bash
cp .env.example .env          # điền Azure AD + SharePoint credentials
docker compose up -d db       # chạy Postgres
cd backend && make migrate    # chạy migrations
cd backend && make run        # chạy API server (http://localhost:8080)
```

Xem [`backend/README.md`](./backend/README.md) để biết chi tiết.

## Cấu trúc thư mục

```
Flowie/
├── backend/            # Go API server
├── frontend/           # Next.js app (giai đoạn sau)
├── docker-compose.yml
└── .env.example
```
