-- View-only and bot team roles (DTD-918). Adding enum values is backward compatible: existing
-- LEAD and MEMBER rows keep their role, and only an explicit role change produces the new values.
-- VI: Vai trò team chỉ xem và bot (DTD-918). Thêm giá trị enum tương thích ngược: các dòng LEAD
-- VI: và MEMBER hiện có giữ nguyên vai trò, chỉ thao tác đổi vai trò mới tạo ra giá trị mới.
ALTER TYPE "TeamMemberRole" ADD VALUE IF NOT EXISTS 'VIEWER';
ALTER TYPE "TeamMemberRole" ADD VALUE IF NOT EXISTS 'BOT';
