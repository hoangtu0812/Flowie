-- ─────────────────────────────────────────────────────────────
-- Flowie · 0015 · Backlog prioritisation: MoSCoW + RICE (Module 3.2)
-- ─────────────────────────────────────────────────────────────

-- MoSCoW bucket: must | should | could | wont (NULL = chưa phân loại)
ALTER TABLE tasks ADD COLUMN moscow TEXT;

-- RICE inputs. Score is derived (reach × impact × confidence ÷ effort) and
-- stored generated so sorting the backlog never recomputes it in the client.
ALTER TABLE tasks ADD COLUMN rice_reach      DOUBLE PRECISION;
ALTER TABLE tasks ADD COLUMN rice_impact     DOUBLE PRECISION;
ALTER TABLE tasks ADD COLUMN rice_confidence DOUBLE PRECISION;
ALTER TABLE tasks ADD COLUMN rice_effort     DOUBLE PRECISION;

ALTER TABLE tasks ADD COLUMN rice_score DOUBLE PRECISION
    GENERATED ALWAYS AS (
        CASE
            WHEN rice_effort IS NULL OR rice_effort <= 0 THEN NULL
            ELSE (COALESCE(rice_reach, 0) * COALESCE(rice_impact, 0)
                  * COALESCE(rice_confidence, 100) / 100.0) / rice_effort
        END
    ) STORED;

CREATE INDEX idx_tasks_rice_score ON tasks(project_id, rice_score DESC NULLS LAST);
