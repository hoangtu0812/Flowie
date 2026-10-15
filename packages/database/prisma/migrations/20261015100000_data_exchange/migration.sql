CREATE TABLE "issue_import_batches" (
    "id" TEXT NOT NULL, "workspace_id" TEXT NOT NULL, "actor_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL, "source_key" TEXT NOT NULL, "request_key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL, "duplicate_mode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PREVIEW', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "issue_import_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "issue_import_batches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "issue_import_batches_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "issue_import_batches_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "issue_import_batches_actor_id_request_key_key" ON "issue_import_batches"("actor_id","request_key");
CREATE INDEX "issue_import_batches_state_created_at_idx" ON "issue_import_batches"("state","created_at");
CREATE TABLE "issue_import_rows" (
    "batch_id" TEXT NOT NULL, "row_number" INTEGER NOT NULL, "external_id" TEXT,
    "payload" JSONB NOT NULL, "state" TEXT NOT NULL DEFAULT 'PENDING', "error_code" TEXT,
    "issue_id" TEXT, "identifier" TEXT,
    CONSTRAINT "issue_import_rows_pkey" PRIMARY KEY ("batch_id","row_number"),
    CONSTRAINT "issue_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "issue_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "issue_import_keys" (
    "workspace_id" TEXT NOT NULL, "source_key" TEXT NOT NULL, "external_id" TEXT NOT NULL, "issue_id" TEXT NOT NULL,
    CONSTRAINT "issue_import_keys_pkey" PRIMARY KEY ("workspace_id","source_key","external_id"),
    CONSTRAINT "issue_import_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "issue_import_keys_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
