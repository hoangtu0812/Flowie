from __future__ import annotations

# Circle's fixed Issue workflow catalog. The backend uses it as the default
# workspace configuration so real data does not alter the original UI.
DEFAULT_CIRCLE_ISSUE_STATUSES = (
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
