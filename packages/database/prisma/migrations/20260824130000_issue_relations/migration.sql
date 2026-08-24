CREATE TABLE "issue_relations" (
    "workspace_id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "related_issue_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "issue_relations_pkey" PRIMARY KEY ("issue_id", "related_issue_id"),
    CONSTRAINT "issue_relations_distinct_issues" CHECK ("issue_id" <> "related_issue_id")
);

CREATE INDEX "issue_relations_workspace_id_created_at_idx"
ON "issue_relations"("workspace_id", "created_at");

CREATE INDEX "issue_relations_related_issue_id_idx"
ON "issue_relations"("related_issue_id");

ALTER TABLE "issue_relations"
ADD CONSTRAINT "issue_relations_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_relations"
ADD CONSTRAINT "issue_relations_issue_id_fkey"
FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_relations"
ADD CONSTRAINT "issue_relations_related_issue_id_fkey"
FOREIGN KEY ("related_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_relations"
ADD CONSTRAINT "issue_relations_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
