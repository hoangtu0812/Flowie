ALTER TABLE "sessions" ADD COLUMN "authenticated_at" TIMESTAMP(3),ADD COLUMN "auth_method" TEXT NOT NULL DEFAULT 'LEGACY';
CREATE INDEX "sessions_user_id_created_at_id_idx" ON "sessions"("user_id","created_at","id");
CREATE TABLE "account_security_events" (
    "id" TEXT NOT NULL,"user_id" TEXT NOT NULL,"kind" TEXT NOT NULL,"method" TEXT NOT NULL,
    "ip_address" TEXT,"user_agent" TEXT,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "account_security_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "account_security_events_user_id_created_at_id_idx" ON "account_security_events"("user_id","created_at","id");
CREATE INDEX "account_security_events_created_at_idx" ON "account_security_events"("created_at");
