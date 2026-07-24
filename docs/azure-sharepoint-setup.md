# Cấu hình Azure AD SSO & SharePoint

Tài liệu hướng dẫn tạo App Registration trên Microsoft Entra ID (Azure AD) để
bật **SSO** và **đồng bộ file SharePoint** cho Flowie.

## 1. Tạo App Registration (cho SSO)

1. Azure Portal → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name: `Flowie`. Supported account types: *Single tenant* (khuyến nghị).
3. **Redirect URI** (Web): `http://localhost:8080/api/v1/auth/azure/callback`
   (thêm URL production khi deploy).
4. Sau khi tạo, ghi lại **Application (client) ID** và **Directory (tenant) ID**.
5. **Certificates & secrets** → **New client secret** → ghi lại giá trị secret.

Điền vào `.env`:

```
AZURE_AD_TENANT_ID=<Directory (tenant) ID>
AZURE_AD_CLIENT_ID=<Application (client) ID>
AZURE_AD_CLIENT_SECRET=<client secret>
AZURE_AD_REDIRECT_URL=http://localhost:8080/api/v1/auth/azure/callback
```

### API permissions (SSO)
Mặc định scope `openid profile email` là đủ cho đăng nhập. Cấp **User.Read**
(delegated) nếu muốn lấy thêm hồ sơ.

## 2. Quyền cho SharePoint (Microsoft Graph, application permission)

Flowie dùng **client-credentials** để tự tạo cây thư mục và upload file.

1. Cùng App Registration → **API permissions** → **Add a permission** →
   **Microsoft Graph** → **Application permissions**.
2. Thêm: `Sites.ReadWrite.All` (hoặc `Sites.Selected` + cấp quyền cho site cụ thể),
   và `Files.ReadWrite.All`.
3. **Grant admin consent** cho tenant.

Điền vào `.env` (có thể tái dùng cùng client id/secret ở trên):

```
GRAPH_TENANT_ID=<tenant id>
GRAPH_CLIENT_ID=<client id>
GRAPH_CLIENT_SECRET=<client secret>
# Định dạng: <tenant>.sharepoint.com:/sites/<SiteName>
SHAREPOINT_SITE_URL=contoso.sharepoint.com:/sites/Projects
SHAREPOINT_ROOT_FOLDER=/Flowie
```

## 3. Cây thư mục tự sinh

Khi tạo Workspace/Project, backend tự tạo (best-effort) trong document library:

```
/Flowie
└── <workspace-slug>/
    └── <KEY>-<project-slug>/
        ├── 01_Documents
        ├── 02_Designs
        ├── 03_Deliverables
        ├── 04_Tasks
        │   └── <task-ref>/        # đính kèm theo task
        └── 05_Attachments
```

Nếu Graph lỗi (creds sai/mạng), việc tạo Workspace/Project vẫn thành công;
lỗi chỉ được ghi log và có thể đồng bộ lại sau.

## 4. Kiểm tra nhanh

- `GET /healthz` trả `features.azureAD=true` và `features.sharePoint=true` khi
  cấu hình hợp lệ và OIDC discovery thành công.
- Mở `http://localhost:3000` → **Đăng nhập với Microsoft**.

## Dev không có Azure

Dùng CLI dev-only để lấy session token (bỏ qua SSO):

```bash
cd backend
go run ./cmd/devtoken -email you@example.com -name "You"
# dùng token: Authorization: Bearer <token>
```
