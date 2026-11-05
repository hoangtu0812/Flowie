-- Platform roles granted from the /admin console (DTD-283). The column is nullable, so existing
-- accounts keep no role and the ADMIN_EMAIL account keeps its access from the environment.
-- VI: Vai trò hệ thống cấp từ console /admin (DTD-283). Cột cho phép null nên tài khoản hiện có
-- VI: không có vai trò, còn tài khoản ADMIN_EMAIL vẫn có quyền từ biến môi trường.
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'VIEWER');

ALTER TABLE "users" ADD COLUMN "platform_role" "PlatformRole";
