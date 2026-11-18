"""Write SQL statements of team automation rules, kept in one place for schema review.

VI: Các câu SQL ghi của rule tự động hoá cấp team, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

STAGE_AUTOMATION_EVENT = text(
    '''INSERT INTO automation_events (id, issue_id, trigger, depth, source_rule_id, created_at)
       VALUES (:id, :issue_id, :trigger, :depth, :source_rule_id, :now)'''
)

LEASE_AUTOMATION_EVENT = text(
    '''UPDATE automation_events SET attempts = attempts + 1, lease_until = :lease, lease_token = :token
        WHERE id = (SELECT id FROM automation_events
                     WHERE processed_at IS NULL AND attempts < :max_attempts
                       AND (lease_until IS NULL OR lease_until < :now)
                     ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id, issue_id, trigger, depth, source_rule_id'''
)

FINISH_AUTOMATION_EVENT = text(
    '''UPDATE automation_events SET processed_at = :now, lease_until = NULL
        WHERE id = :id AND lease_token = :token'''
)

INSERT_AUTOMATION_RUN = text(
    '''INSERT INTO automation_rule_runs (id, rule_id, issue_id, status, message, created_at)
       VALUES (:id, :rule_id, :issue_id, :status, :message, :now)'''
)

PRUNE_AUTOMATION_EVENTS = text('DELETE FROM automation_events WHERE created_at < :cutoff')

PRUNE_AUTOMATION_RUNS = text('DELETE FROM automation_rule_runs WHERE created_at < :cutoff')

CREATE_AUTOMATION_RULE = text(
    '''INSERT INTO automation_rules (id, team_id, name, enabled, trigger, conditions, actions,
                                     actor_id, created_at, updated_at)
       VALUES (:id, :team_id, :name, :enabled, :trigger, CAST(:conditions AS jsonb),
               CAST(:actions AS jsonb), :actor_id, :now, :now)'''
)

UPDATE_AUTOMATION_RULE = text(
    '''UPDATE automation_rules SET name = :name, enabled = :enabled, trigger = :trigger,
              conditions = CAST(:conditions AS jsonb), actions = CAST(:actions AS jsonb),
              actor_id = :actor_id, updated_at = :now
        WHERE id = :id AND team_id = :team_id'''
)

DELETE_AUTOMATION_RULE = text('DELETE FROM automation_rules WHERE id = :id AND team_id = :team_id')

AUDIT_AUTOMATION_RULE = text(
    '''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
       VALUES (:id, :workspace_id, :actor_id, :action, 'automation-rule', :entity_id,
               CAST(:metadata AS jsonb), :now)'''
)
