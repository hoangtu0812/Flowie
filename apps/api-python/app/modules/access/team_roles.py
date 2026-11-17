"""Team member roles and what each may do (DTD-918).

Roles live on `team_members.role`, so one person can be a VIEWER in one team and a MEMBER in
another. Every permission check reads these sets instead of comparing role names, so a new role
needs one entry here (and the enum value in the Prisma schema).
VI: Vai trò thành viên team và quyền của từng vai trò (DTD-918). Vai trò nằm ở `team_members.role`
VI: nên một người có thể là VIEWER ở team này và MEMBER ở team khác. Mọi kiểm tra quyền đọc các
VI: tập hợp dưới đây thay vì so tên vai trò, nên vai trò mới chỉ cần thêm một dòng ở đây (và giá
VI: trị enum trong Prisma schema).
"""

from typing import Literal

TeamRole = Literal["LEAD", "MEMBER", "VIEWER", "BOT"]
# Roles that may create and change the team's issues, projects and documents.
# VI: Các vai trò được tạo và sửa issue, project, document của team.
TEAM_WRITE_ROLES = frozenset({"LEAD", "MEMBER", "BOT"})
# Roles that may be assigned the team's issues. VI: Các vai trò được giao issue của team.
TEAM_ASSIGNABLE_ROLES = frozenset({"LEAD", "MEMBER", "BOT"})
VIEW_ONLY_MESSAGE = "Your role in this team is view-only."
