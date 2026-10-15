ALTER TABLE "issue_lifecycle_events" ADD COLUMN "to_priority" TEXT;
ALTER TABLE "issue_sla_cycles" ADD COLUMN "alert_results" JSONB NOT NULL DEFAULT '{}';
CREATE FUNCTION flowie_lifecycle_priority() RETURNS TRIGGER AS $$
BEGIN
    SELECT priority::text INTO NEW.to_priority FROM issues WHERE id=NEW.issue_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER lifecycle_priority BEFORE INSERT ON issue_lifecycle_events FOR EACH ROW EXECUTE FUNCTION flowie_lifecycle_priority();
