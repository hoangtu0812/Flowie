# Phát hành tài liệu lên SharePoint

Flowie là nơi soạn tài liệu (Markdown, có version). SharePoint là nơi phát hành
chính thức. Đồng bộ chỉ đi **một chiều Flowie → SharePoint**: Flowie không đọc
và không xóa gì trên SharePoint.

## Cách hoạt động

- Mỗi lần bấm **Duyệt** tạo một **phiên bản phát hành** (v1, v2…). Một tài liệu
  được phát hành khi đủ các điều kiện sau:
  - có ít nhất một phiên bản đã duyệt;
  - nằm trong cây **Docs** của một dự án;
  - dự án đã gán **thư mục SharePoint**;
  - kết nối SharePoint của workspace đang bật.
- **Vị trí file:** mỗi phiên bản ghi hai file. Ký tự không hợp lệ trên SharePoint
  (`" * : < > ? / \ | # %`) được thay bằng `-`.
  - Thư mục trên SharePoint dùng đúng nhãn có số của cây Docs, ví dụ
    `01 · Turn Around/01 · Tích hợp P6`.
  - `<thư mục của dự án>/<module>/<tính năng>/<tiêu đề>.md`: luôn là phiên bản mới
    nhất (link cố định, bị ghi đè mỗi lần duyệt);
  - `<thư mục của dự án>/<module>/<tính năng>/_versions/<tiêu đề>_vN.md`: bản lưu
    của từng phiên bản, không bị ghi đè.
- **Nội dung file:** nội dung lúc duyệt (không phải bản nháp đang sửa), mở đầu bằng
  front matter ghi `title`, `version`, `approved_by`, `approved_at` (giờ Việt Nam)
  và `document_id`.
- **Khi nào tải lên:** job trong API chạy mỗi phút và tải phiên bản mới nhất chưa
  được phát hành. Sửa tài liệu đã duyệt sẽ đưa nó về **Nháp**; file trên SharePoint
  giữ nguyên cho tới khi phiên bản kế tiếp được duyệt.
- **Khi lỗi:** lỗi được lưu và hiện ở khung xem trước của tài liệu. Hệ thống tự
  thử lại sau 2, 4, 8… phút, tối đa mỗi giờ một lần.
- **Giới hạn của bản đầu:**
  - đổi tên hoặc di chuyển tài liệu sẽ tạo file mới ở vị trí mới; file cũ vẫn
    nằm trên SharePoint;
  - đổi tên, đổi số hoặc di chuyển thư mục (và lần deploy đánh số thư mục) làm
    phiên bản mới nhất của các tài liệu bên dưới được tải lại vào thư mục mới;
    thư mục và file cũ vẫn nằm trên SharePoint, cần dọn thủ công nếu muốn;
  - sửa file trực tiếp trên SharePoint sẽ bị ghi đè ở lần phát hành sau.

## Sao chép attachment (tùy chọn)

Bật **Copy attachments** ở **Settings → Integrations → SharePoint** (mặc định tắt) để
sao chép cả file đính kèm của dự án lên cùng thư mục SharePoint. Dùng chung app
registration, quyền `Sites.Selected` và thư mục dự án ở trên; IT không phải làm thêm gì.

- **File nào:** file đính kèm của issue và bình luận (issue phải thuộc một dự án đã gán thư
  mục SharePoint), của dự án, của project update, file PDF trong cây Docs và file gắn vào
  tài liệu. Issue không thuộc dự án nào thì không được sao chép.
- **Vị trí** (dưới thư mục của dự án):
  - issue và bình luận: `Attachments/<mã issue> <tiêu đề issue>/<file>`, ví dụ
    `Attachments/DTD-137 Phương án đồng bộ attachment lên Sharepoint/spec.pdf`;
  - dự án và project update: `Attachments/_Project/<file>`;
  - cây Docs: đúng thư mục module/tính năng có số, như tài liệu.
- **Trùng tên** (không phân biệt hoa thường) ở cùng chỗ: file sau thành `tên (2).đuôi`,
  `tên (3).đuôi`… theo thứ tự tải lên.
- **Khi nào:** cùng job mỗi phút, sau phần tài liệu, tối đa 20 file mỗi lượt. Bật lần đầu sẽ
  sao chép cả file cũ. File trên 4 MB được tải bằng upload session của Graph.
- **Một lần, một chiều:** attachment không sửa được sau khi tải lên, nên mỗi file chỉ được sao
  chép một lần. Flowie không đọc ngược, không xóa và không di chuyển gì trên SharePoint: đổi
  tên issue hoặc chuyển issue sang dự án khác chỉ ảnh hưởng tới file tải lên sau đó; issue bị
  archive và bình luận bị xóa vẫn giữ file đã sao chép.
- **Trạng thái:** thẻ đính kèm trong tab Attachments của issue hiện **Mở trên SharePoint**
  khi đã sao chép, hoặc **Chưa sao chép được lên SharePoint** (di chuột để xem lỗi) khi đang
  thử lại.
- **Quyền xem:** trên SharePoint, quyền do thư mục/site quyết định, không theo team trong
  Flowie. Ai mở được thư mục của dự án sẽ thấy mọi file đính kèm của dự án đó. Chỉ bật khi
  phạm vi người xem thư mục tương đương team sở hữu dự án.

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
4. Trong khung xem trước của một tài liệu, bấm **Duyệt** rồi **Xác nhận duyệt vN**.
   Khoảng một phút sau, khung xem trước hiện **Đã phát hành vN** kèm link mở trên
   SharePoint.

## Xử lý lỗi thường gặp

| Thông báo | Nguyên nhân / cách xử lý |
|---|---|
| Microsoft sign-in failed | Sai tenant ID, client ID hoặc secret, hoặc secret đã hết hạn. |
| SharePoint refused …: grant the app Sites.Selected write access | Chưa làm bước 2 cho đúng site, hoặc chỉ cấp quyền `read`. |
| SharePoint could not find the site or folder | URL sai site. Kiểm tra lại đường dẫn `/sites/<site>`. |
| The folder URL does not match a document library | Phần sau `/sites/<site>/` không phải là thư viện tài liệu. |
| SharePoint could not be reached | Server không ra được Internet, hoặc chưa cấu hình proxy. |
