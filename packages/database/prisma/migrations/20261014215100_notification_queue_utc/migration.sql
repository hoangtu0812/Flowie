ALTER TABLE notification_email_deliveries ALTER COLUMN available_at SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
