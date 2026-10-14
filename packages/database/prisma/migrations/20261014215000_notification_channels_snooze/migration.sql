ALTER TABLE notifications ADD COLUMN snoozed_until TIMESTAMP(3);
CREATE INDEX notifications_snoozed_until_id_idx ON notifications(snoozed_until,id);
ALTER TABLE notification_preferences ADD COLUMN email_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN desktop_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE notification_email_deliveries (
    notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE ON UPDATE CASCADE,
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_until TIMESTAMP(3), lease_token TEXT, delivered_at TIMESTAMP(3), failed_at TIMESTAMP(3), last_error_code TEXT
);
CREATE INDEX notification_email_deliveries_available_at_idx ON notification_email_deliveries(available_at);
CREATE FUNCTION flowie_stage_notification_email() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS(SELECT 1 FROM notification_preferences WHERE workspace_id=NEW.workspace_id AND user_id=NEW.user_id AND email_enabled) THEN
        INSERT INTO notification_email_deliveries(notification_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER flowie_stage_notification_email AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION flowie_stage_notification_email();
