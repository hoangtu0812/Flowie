ALTER TABLE "sla_policies" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "calendar" JSONB,ADD COLUMN "pause_status_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "warning_minutes" INTEGER NOT NULL DEFAULT 0,ADD COLUMN "escalate_to_id" TEXT;
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_escalate_to_id_fkey" FOREIGN KEY ("escalate_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sla_policies" DROP CONSTRAINT "sla_policies_team_id_fkey";
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issues" ADD COLUMN "sla_opt_out" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "issue_lifecycle_events" ADD COLUMN "from_sla_opt_out" BOOLEAN,
    ADD COLUMN "to_sla_opt_out" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "sla_policy_revisions" (
    "policy_id" TEXT NOT NULL,"version" INTEGER NOT NULL,"snapshot" JSONB NOT NULL,
    "actor_id" TEXT,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sla_policy_revisions_pkey" PRIMARY KEY ("policy_id","version"),
    CONSTRAINT "sla_policy_revisions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "sla_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sla_policy_revisions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO sla_policy_revisions(policy_id,version,snapshot,actor_id,created_at)
    SELECT id,1,jsonb_build_object('name',name,'description',description,'teamId',team_id,'priority',priority,
        'deadlineMinutes',deadline_minutes,'enabled',enabled,'calendar',NULL,'pauseStatusIds',ARRAY[]::TEXT[],
        'warningMinutes',0,'escalateToId',NULL,'createdBy',created_by),created_by,CURRENT_TIMESTAMP AT TIME ZONE 'UTC' FROM sla_policies;

CREATE TABLE "issue_sla_cycles" (
    "id" TEXT NOT NULL,"issue_id" TEXT NOT NULL,"workspace_id" TEXT NOT NULL,"cycle" INTEGER NOT NULL,
    "policy_id" TEXT,"policy_version" INTEGER NOT NULL,"snapshot" JSONB NOT NULL,
    "state" TEXT NOT NULL,"budget_seconds" INTEGER NOT NULL,"remaining_seconds" DOUBLE PRECISION NOT NULL,
    "last_started_at" TIMESTAMP(3),"due_at" TIMESTAMP(3),"warning_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL,"closed_at" TIMESTAMP(3),"breached_at" TIMESTAMP(3),
    "warning_sent_at" TIMESTAMP(3),"breach_sent_at" TIMESTAMP(3),"escalated_at" TIMESTAMP(3),"escalation_code" TEXT,
    CONSTRAINT "issue_sla_cycles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "issue_sla_cycles_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "issue_sla_cycles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "issue_sla_cycles_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "issue_sla_cycles_issue_id_cycle_key" ON "issue_sla_cycles"("issue_id","cycle");
CREATE INDEX "issue_sla_cycles_workspace_id_started_at_idx" ON "issue_sla_cycles"("workspace_id","started_at");
CREATE INDEX "issue_sla_cycles_state_due_at_idx" ON "issue_sla_cycles"("state","due_at");
CREATE INDEX "issue_sla_cycles_warning_sent_at_warning_at_idx" ON "issue_sla_cycles"("warning_sent_at","warning_at");
CREATE INDEX "issue_sla_cycles_breach_sent_at_breached_at_idx" ON "issue_sla_cycles"("breach_sent_at","breached_at");

CREATE FUNCTION flowie_sla_override() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.due_date IS DISTINCT FROM OLD.due_date AND COALESCE(current_setting('flowie.sla_managed_due',true),'')<>'true'
        THEN NEW.sla_opt_out:=true; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER issue_sla_override BEFORE UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION flowie_sla_override();

CREATE OR REPLACE FUNCTION flowie_issue_lifecycle() RETURNS TRIGGER AS $$
DECLARE previous_category TEXT; current_category TEXT; actor TEXT; transport TEXT;
BEGIN
    IF TG_OP='UPDATE' AND NEW.status_id IS NOT DISTINCT FROM OLD.status_id
        AND NEW.team_id IS NOT DISTINCT FROM OLD.team_id AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date
        AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at THEN RETURN NEW; END IF;
    SELECT category::text INTO current_category FROM issue_statuses WHERE id=NEW.status_id;
    IF TG_OP='UPDATE' THEN SELECT category::text INTO previous_category FROM issue_statuses WHERE id=OLD.status_id; END IF;
    actor:=NULLIF(current_setting('flowie.actor_id',true),'');
    IF actor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=actor) THEN actor:=NULL; END IF;
    transport:=current_setting('flowie.audit_source',true);
    IF transport IS NULL OR transport NOT IN ('WEB','AI','SYSTEM') THEN transport:='UNKNOWN'; END IF;
    INSERT INTO issue_lifecycle_events(id,issue_id,workspace_id,issue_version,kind,actor_id,source,
        from_status_id,to_status_id,from_category,to_category,from_team_id,to_team_id,from_due_date,to_due_date,
        from_archived_at,to_archived_at,managed_due,occurred_at,from_sla_opt_out,to_sla_opt_out)
    VALUES ('evt_'||gen_random_uuid()::text,NEW.id,NEW.workspace_id,NEW.version,
        CASE WHEN TG_OP='INSERT' THEN 'CREATED' ELSE 'CHANGED' END,actor,transport,
        CASE WHEN TG_OP='UPDATE' THEN OLD.status_id END,NEW.status_id,previous_category,current_category,
        CASE WHEN TG_OP='UPDATE' THEN OLD.team_id END,NEW.team_id,
        CASE WHEN TG_OP='UPDATE' THEN OLD.due_date END,NEW.due_date,
        CASE WHEN TG_OP='UPDATE' THEN OLD.archived_at END,NEW.archived_at,
        COALESCE(current_setting('flowie.sla_managed_due',true),'')='true',clock_timestamp() AT TIME ZONE 'UTC',
        CASE WHEN TG_OP='UPDATE' THEN OLD.sla_opt_out END,NEW.sla_opt_out);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
