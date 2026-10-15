CREATE TABLE "operation_heartbeats" (
  "id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "job" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "last_seen_at" TIMESTAMP(3) NOT NULL,
  "last_progress_at" TIMESTAMP(3),
  "failures" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" TEXT,
  CONSTRAINT "operation_heartbeats_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "operation_heartbeats_instance_id_job_key" ON "operation_heartbeats"("instance_id","job");
CREATE INDEX "operation_heartbeats_last_seen_at_idx" ON "operation_heartbeats"("last_seen_at");
CREATE TABLE "client_error_events" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "route_kind" TEXT NOT NULL,
  "digest" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_error_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "client_error_events_workspace_id_created_at_idx" ON "client_error_events"("workspace_id","created_at");
ALTER TABLE "client_error_events" ADD CONSTRAINT "client_error_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_error_events" ADD CONSTRAINT "client_error_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
