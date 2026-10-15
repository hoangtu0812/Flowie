CREATE TABLE "bulk_operations" (
 "id" TEXT NOT NULL,"workspace_id" TEXT NOT NULL,"actor_id" TEXT NOT NULL,
 "request_key" TEXT NOT NULL,"fingerprint" TEXT NOT NULL,"changes" JSONB NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'PREVIEW',"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expires_at" TIMESTAMP(3) NOT NULL,CONSTRAINT "bulk_operations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bulk_operations_actor_id_request_key_key" ON "bulk_operations"("actor_id","request_key");
CREATE INDEX "bulk_operations_state_created_at_idx" ON "bulk_operations"("state","created_at");
CREATE TABLE "bulk_operation_items" (
 "operation_id" TEXT NOT NULL,"issue_id" TEXT NOT NULL,"expected_version" INTEGER NOT NULL,
 "identifier" TEXT NOT NULL,"state" TEXT NOT NULL DEFAULT 'PENDING',"error_code" TEXT,
 CONSTRAINT "bulk_operation_items_pkey" PRIMARY KEY ("operation_id","issue_id")
);
ALTER TABLE "bulk_operations" ADD CONSTRAINT "bulk_operations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bulk_operations" ADD CONSTRAINT "bulk_operations_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bulk_operation_items" ADD CONSTRAINT "bulk_operation_items_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "bulk_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
