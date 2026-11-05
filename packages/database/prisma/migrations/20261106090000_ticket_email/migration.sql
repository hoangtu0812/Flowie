-- Emails about a person's own tickets are on by default and have their own switch, because requesters
-- rarely open the app. Other email keeps following email_enabled, so team members get nothing new.
-- A person with no preference row counts as switched on.
-- VI: Email về ticket của chính mình mặc định bật và có công tắc riêng, vì người yêu cầu ít khi mở app.
-- VI: Email khác vẫn theo email_enabled, nên thành viên team không nhận thêm gì.
-- VI: Người chưa có dòng preference được xem là đang bật.
ALTER TABLE "notification_preferences" ADD COLUMN "ticket_email_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION flowie_stage_notification_email() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS(SELECT 1 FROM notification_preferences WHERE workspace_id=NEW.workspace_id AND user_id=NEW.user_id AND email_enabled)
       OR (NEW.entity_type = 'ticket'
           AND EXISTS(SELECT 1 FROM asks WHERE id = NEW.entity_id AND created_by = NEW.user_id)
           AND NOT EXISTS(SELECT 1 FROM notification_preferences WHERE workspace_id=NEW.workspace_id AND user_id=NEW.user_id AND NOT ticket_email_enabled)) THEN
        INSERT INTO notification_email_deliveries(notification_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
