# Phát hành tài liệu lên SharePoint

Flowie là nơi soạn tài liệu (Markdown, có version). SharePoint là nơi phát hành
chính thức. Đồng bộ chỉ đi **một chiều Flowie → SharePoint**: Flowie không đọc
và không xóa gì trên SharePoint.

## Cách hoạt động

- Một tài liệu được phát hành khi đủ các điều kiện sau:
  - có trạng thái **Đã duyệt**;
  - nằm trong cây **Docs** của một dự án;
  - dự án đã gán **thư mục SharePoint**;
  - kết nối SharePoint của workspace đang bật.
- **Vị trí file:** `<thư mục của dự án>/<module>/<tính năng>/<tiêu đề>.md`. Ký tự
  không hợp lệ trên SharePoint (`" * : < > ? / \ | # %`) được thay bằng `-`.
- **Khi nào tải lên:** job trong API chạy mỗi phút. Mỗi version mới của tài liệu
  đã duyệt được tải lại và ghi đè file cũ.
- **Khi lỗi:** lỗi được lưu và hiện ở khung xem trước của tài liệu. Hệ thống tự
  thử lại sau 2, 4, 8… phút, tối đa mỗi giờ một lần.
- **Giới hạn của bản đầu:**
  - đổi tên hoặc di chuyển tài liệu sẽ tạo file mới ở vị trí mới; file cũ vẫn
    nằm trên SharePoint;
  - sửa file trực tiếp trên SharePoint sẽ bị ghi đè ở lần phát hành sau.

## Bước 1 — IT tạo app registration (một lần)

1. Vào Microsoft Entra admin center → **App registrations** → **New
   registration**, đặt tên, ví dụ `Flowie SharePoint publisher`. Chọn
   single tenant.
2. Vào **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Application permissions** → chọn **Sites.Selected** → **Grant admin
   consent**.
3. Vào **Certificates & secrets** → **New client secret**. Lưu lại giá trị secret
   (chỉ hiện một lần) và ngày hết hạn.
4. Ghi lại **Directory (tenant) ID** và **Application (client) ID**.

`Sites.Selected` không cho app truy cập site nào cho tới khi được cấp quyền
riêng ở bước 2.

## Bước 2 — IT cấp quyền ghi trên đúng site

Site được cấp quyền phải là site chứa thư mục mà dự án sẽ dùng. Có hai cách,
chọn một.

**Cách A: PnP PowerShell.** Chạy với tài khoản SharePoint admin:

```powershell
Grant-PnPAzureADAppSitePermission -AppId "<client-id>" -DisplayName "Flowie SharePoint publisher" -Site "https://<tenant>.sharepoint.com/sites/<site>" -Permissions Write
```

**Cách B: Microsoft Graph.** Dùng tài khoản có quyền `Sites.FullControl.All`:

```http
GET https://graph.microsoft.com/v1.0/sites/<tenant>.sharepoint.com:/sites/<site>
POST https://graph.microsoft.com/v1.0/sites/<site-id>/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [
    { "application": { "id": "<client-id>", "displayName": "Flowie SharePoint publisher" } }
  ]
}
```

Lệnh `GET` dùng để lấy `<site-id>` cho lệnh `POST`.

Server chạy Flowie phải ra được Internet tới `login.microsoftonline.com` và
`graph.microsoft.com` qua HTTPS. Nếu phải đi qua proxy, đặt biến môi trường
`HTTPS_PROXY` cho container `api`.

## Bước 3 — Cấu hình trong Flowie

1. Quản trị viên workspace vào **Settings → Integrations → SharePoint**.
2. Nhập Tenant ID, Client ID và Client secret, bật *Publish approved
   documents*, rồi lưu.
   - Secret được mã hóa bằng `SCM_SECRETS_ENCRYPTION_KEY` của server và không
     đọc lại được. Muốn đổi secret thì nhập secret mới.
3. Ở mỗi dự án, vào **Docs → SharePoint**:
   - dán URL thư mục đích. Cách lấy: mở thư mục trên SharePoint rồi copy thanh
     địa chỉ, ví dụ
     `https://<tenant>.sharepoint.com/sites/<site>/Shared Documents/<thư mục>`.
     Link dạng `.../Forms/AllItems.aspx?id=...` cũng dùng được;
   - bấm **Kiểm tra**: Flowie đăng nhập và tìm thư mục, không tải file;
   - bấm **Lưu**.
4. Đổi trạng thái một tài liệu sang **Đã duyệt**. Khoảng một phút sau, khung xem
   trước hiện **Đã phát hành vN** kèm link mở trên SharePoint.

## Xử lý lỗi thường gặp

| Thông báo | Nguyên nhân / cách xử lý |
|---|---|
| Microsoft sign-in failed | Sai tenant ID, client ID hoặc secret, hoặc secret đã hết hạn. |
| SharePoint refused …: grant the app Sites.Selected write access | Chưa làm bước 2 cho đúng site, hoặc chỉ cấp quyền `read`. |
| SharePoint could not find the site or folder | URL sai site. Kiểm tra lại đường dẫn `/sites/<site>`. |
| The folder URL does not match a document library | Phần sau `/sites/<site>/` không phải là thư viện tài liệu. |
| SharePoint could not be reached | Server không ra được Internet, hoặc chưa cấu hình proxy. |
