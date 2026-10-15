ALTER TABLE "sla_policy_revisions" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'BASELINE';
ALTER TABLE "sla_policy_revisions" ALTER COLUMN "kind" SET DEFAULT 'CREATED';
UPDATE sla_policy_revisions r SET snapshot=r.snapshot||jsonb_build_object('archivedAt',p.archived_at)
    FROM sla_policies p WHERE p.id=r.policy_id AND r.kind='BASELINE';
CREATE INDEX "sla_policies_workspace_id_created_at_id_idx" ON "sla_policies"("workspace_id","created_at","id");
