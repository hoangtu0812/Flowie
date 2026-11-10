from __future__ import annotations

# Default Issue workflow catalog. The backend seeds it as the workspace
# configuration so real data does not alter the web UI. The status names are
# stored per workspace and must not change.
# VI: Danh mục workflow Issue mặc định. Backend tạo sẵn nó làm cấu hình
# workspace để dữ liệu thật không làm lệch giao diện web. Tên trạng thái được
# lưu theo workspace nên không được đổi.
DEFAULT_ISSUE_STATUSES = (
    ('In Progress', 'STARTED', '#facc15'),
    ('Technical Review', 'STARTED', '#22c55e'),
    ('Done', 'COMPLETED', '#5e6ad2'),
    ('Paused', 'STARTED', '#26b5ce'),
    ('Todo', 'UNSTARTED', '#99a2b2'),
    ('Backlog', 'BACKLOG', '#95a2b3'),
    ('Triage', 'TRIAGE', '#f2790f'),
    ('Idea', 'BACKLOG', '#5e6ad2'),
    ('Product Feedback', 'STARTED', '#f2994a'),
    ('Blocked', 'STARTED', '#eb5757'),
    ('Shipped', 'COMPLETED', '#4cb782'),
    ('Canceled', 'CANCELED', '#95a2b3'),
    ('Duplicate', 'CANCELED', '#95a2b3'),
)
