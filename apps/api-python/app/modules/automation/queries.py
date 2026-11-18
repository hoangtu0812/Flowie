"""Read SQL statements of team automation rules, kept in one place for schema review.

VI: Các câu SQL đọc của rule tự động hoá cấp team, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

HAS_ENABLED_RULES = text(
    '''SELECT EXISTS(SELECT 1 FROM automation_rules r
                      WHERE r.team_id = :team_id AND r.enabled AND r.trigger = ANY(:triggers))'''
)

TEAM_MEMBER_ROLE = text(
    '''SELECT t.id, tm.role FROM teams t
         LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = :user_id
        WHERE t.id = :team_id AND t.workspace_id = :workspace_id AND t.archived_at IS NULL'''
)

LIST_RULES = text(
    '''SELECT r.id, r.name, r.enabled, r.trigger, r.conditions, r.actions, r.created_at, r.updated_at,
              u.id AS actor_id, u.name AS actor_name
         FROM automation_rules r LEFT JOIN users u ON u.id = r.actor_id
        WHERE r.team_id = :team_id ORDER BY r.created_at, r.id'''
)

RULE = text(
    '''SELECT r.id, r.name, r.enabled, r.trigger, r.conditions, r.actions, r.created_at, r.updated_at,
              u.id AS actor_id, u.name AS actor_name
         FROM automation_rules r LEFT JOIN users u ON u.id = r.actor_id
        WHERE r.id = :id AND r.team_id = :team_id'''
)

LIST_RUNS = text(
    '''SELECT run.id, run.rule_id, rule.name AS rule_name, run.issue_id, issue.identifier,
              issue.title, run.status, run.message, run.created_at
         FROM automation_rule_runs run
         JOIN automation_rules rule ON rule.id = run.rule_id
         JOIN issues issue ON issue.id = run.issue_id
        WHERE rule.team_id = :team_id
        ORDER BY run.created_at DESC, run.id DESC LIMIT 30'''
)

# The facts rule conditions read, plus what the actions compare against to skip no-op writes.
# VI: Các thông tin mà điều kiện rule đọc, cộng giá trị hành động so sánh để bỏ qua lần ghi vô ích.
ISSUE_FACTS = text(
    '''SELECT issue.id, issue.workspace_id, issue.team_id, issue.issue_type, issue.priority,
              issue.project_id, issue.status_id, issue.assignee_id, issue.parent_issue_id,
              issue.archived_at, status.category,
              COALESCE(ARRAY(SELECT link.label_id FROM issue_labels link
                              WHERE link.issue_id = issue.id ORDER BY link.label_id),
                       ARRAY[]::text[]) AS label_ids
         FROM issues issue JOIN issue_statuses status ON status.id = issue.status_id
        WHERE issue.id = :id'''
)

# True only when every live sub-issue of the parent is completed or canceled.
# VI: Chỉ True khi mọi sub-issue chưa lưu trữ của issue cha đã hoàn thành hoặc đã huỷ.
SUBISSUES_CLOSED = text(
    '''SELECT COALESCE(bool_and(status.category IN ('COMPLETED', 'CANCELED')), false)
         FROM issues child JOIN issue_statuses status ON status.id = child.status_id
        WHERE child.parent_issue_id = :parent_id AND child.archived_at IS NULL'''
)

RULES_FOR_TRIGGER = text(
    '''SELECT r.id, r.name, r.conditions, r.actions, r.actor_id FROM automation_rules r
        WHERE r.team_id = :team_id AND r.trigger = :trigger AND r.enabled
        ORDER BY r.created_at, r.id'''
)

RULE_ACTOR = text(
    '''SELECT u.id, u.name, u.avatar_url AS "avatarUrl" FROM users u
         JOIN workspace_members wm ON wm.user_id = u.id
        WHERE u.id = :user AND wm.workspace_id = :workspace
          AND wm.status = 'ACTIVE' AND u.status = 'ACTIVE' '''
)
