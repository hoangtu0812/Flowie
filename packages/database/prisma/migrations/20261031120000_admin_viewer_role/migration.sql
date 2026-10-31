-- Read-only workspace administrator role (DTD-190). Adding an enum value is backward
-- compatible: existing rows and code paths never produce it.
-- VI: Role quản trị workspace chỉ đọc (DTD-190). Thêm giá trị enum tương thích ngược: dữ liệu
-- VI: và code hiện có không bao giờ tạo ra giá trị này.
ALTER TYPE "WorkspaceMemberRole" ADD VALUE IF NOT EXISTS 'ADMIN_VIEWER';
