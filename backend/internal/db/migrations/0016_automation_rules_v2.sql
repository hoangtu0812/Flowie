-- ─────────────────────────────────────────────────────────────
-- Flowie · 0016 · Automation: Trigger → Condition → Action (Module 6.1)
-- ─────────────────────────────────────────────────────────────

-- The v1 engine hard-coded "when status = X, assign to Y". These columns
-- generalise it while keeping the old ones so existing rules keep working.
ALTER TABLE automation_rules ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'status_changed';
ALTER TABLE automation_rules ADD COLUMN conditions JSONB NOT NULL DEFAULT '[]';
ALTER TABLE automation_rules ADD COLUMN actions JSONB NOT NULL DEFAULT '[]';

-- Migrate v1 rules into the new actions array so the engine only reads `actions`.
UPDATE automation_rules
SET actions = jsonb_build_array(
        jsonb_build_object('type', 'assign', 'userId', action_assignee_id::text)
    )
WHERE action_type = 'assign'
  AND action_assignee_id IS NOT NULL
  AND actions = '[]'::jsonb;
