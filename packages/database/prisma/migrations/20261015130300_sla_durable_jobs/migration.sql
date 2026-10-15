CREATE TABLE "issue_sla_jobs" (
    "issue_id" TEXT NOT NULL,"next_attempt_at" TIMESTAMP(3) NOT NULL,"generation" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,"last_error_code" TEXT,"failed_at" TIMESTAMP(3),
    CONSTRAINT "issue_sla_jobs_pkey" PRIMARY KEY ("issue_id"),
    CONSTRAINT "issue_sla_jobs_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "issue_sla_jobs_failed_at_next_attempt_at_idx" ON "issue_sla_jobs"("failed_at","next_attempt_at");
CREATE FUNCTION flowie_queue_sla_lifecycle() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sla_processed_at IS NULL THEN
        INSERT INTO issue_sla_jobs(issue_id,next_attempt_at) VALUES (NEW.issue_id,clock_timestamp() AT TIME ZONE 'UTC')
            ON CONFLICT(issue_id) DO UPDATE SET next_attempt_at=LEAST(issue_sla_jobs.next_attempt_at,EXCLUDED.next_attempt_at),
                generation=issue_sla_jobs.generation+1,attempts=0,last_error_code=NULL,failed_at=NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER queue_sla_lifecycle AFTER INSERT ON issue_lifecycle_events FOR EACH ROW EXECUTE FUNCTION flowie_queue_sla_lifecycle();
INSERT INTO issue_sla_jobs(issue_id,next_attempt_at)
    SELECT issue_id,MIN(next_attempt_at) FROM (
        SELECT issue_id,occurred_at AS next_attempt_at FROM issue_lifecycle_events WHERE sla_processed_at IS NULL
        UNION ALL SELECT issue_id,COALESCE(CASE WHEN warning_sent_at IS NULL THEN warning_at END,due_at)
            FROM issue_sla_cycles WHERE state='ACTIVE'
        UNION ALL SELECT issue_id,CURRENT_TIMESTAMP AT TIME ZONE 'UTC' FROM issue_sla_cycles WHERE breached_at IS NOT NULL AND breach_sent_at IS NULL
    ) pending WHERE next_attempt_at IS NOT NULL GROUP BY issue_id ON CONFLICT(issue_id) DO NOTHING;
