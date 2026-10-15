CREATE TABLE "issue_lifecycle_events" (
    "id" TEXT NOT NULL,"issue_id" TEXT NOT NULL,"workspace_id" TEXT NOT NULL,"issue_version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,"actor_id" TEXT,"source" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "from_status_id" TEXT,"to_status_id" TEXT NOT NULL,"from_category" TEXT,"to_category" TEXT NOT NULL,
    "from_team_id" TEXT,"to_team_id" TEXT NOT NULL,"from_due_date" TIMESTAMP(3),"to_due_date" TIMESTAMP(3),
    "from_archived_at" TIMESTAMP(3),"to_archived_at" TIMESTAMP(3),"managed_due" BOOLEAN NOT NULL DEFAULT false,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"sla_processed_at" TIMESTAMP(3),
    CONSTRAINT "issue_lifecycle_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "issue_lifecycle_events_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "issue_lifecycle_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "issue_lifecycle_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "issue_lifecycle_events_issue_id_issue_version_key" ON "issue_lifecycle_events"("issue_id","issue_version");
CREATE INDEX "issue_lifecycle_events_workspace_id_occurred_at_idx" ON "issue_lifecycle_events"("workspace_id","occurred_at");
CREATE INDEX "issue_lifecycle_events_issue_id_occurred_at_issue_version_idx" ON "issue_lifecycle_events"("issue_id","occurred_at","issue_version");
CREATE INDEX "issue_lifecycle_events_sla_processed_at_occurred_at_idx" ON "issue_lifecycle_events"("sla_processed_at","occurred_at");

CREATE FUNCTION flowie_issue_lifecycle() RETURNS TRIGGER AS $$
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
        from_archived_at,to_archived_at,managed_due,occurred_at)
    VALUES ('evt_'||gen_random_uuid()::text,NEW.id,NEW.workspace_id,NEW.version,
        CASE WHEN TG_OP='INSERT' THEN 'CREATED' ELSE 'CHANGED' END,actor,transport,
        CASE WHEN TG_OP='UPDATE' THEN OLD.status_id END,NEW.status_id,previous_category,current_category,
        CASE WHEN TG_OP='UPDATE' THEN OLD.team_id END,NEW.team_id,
        CASE WHEN TG_OP='UPDATE' THEN OLD.due_date END,NEW.due_date,
        CASE WHEN TG_OP='UPDATE' THEN OLD.archived_at END,NEW.archived_at,
        COALESCE(current_setting('flowie.sla_managed_due',true),'')='true',clock_timestamp() AT TIME ZONE 'UTC');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER issue_lifecycle AFTER INSERT OR UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION flowie_issue_lifecycle();

-- A baseline records observation time, never an invented historical status-entry time.
INSERT INTO issue_lifecycle_events(id,issue_id,workspace_id,issue_version,kind,to_status_id,to_category,to_team_id,to_due_date,to_archived_at,occurred_at,sla_processed_at)
    SELECT 'baseline_'||i.id,i.id,i.workspace_id,i.version,'BASELINE',i.status_id,s.category::text,i.team_id,i.due_date,i.archived_at,
        CURRENT_TIMESTAMP AT TIME ZONE 'UTC',CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    FROM issues i JOIN issue_statuses s ON s.id=i.status_id ON CONFLICT(issue_id,issue_version) DO NOTHING;
