CREATE TYPE "ScmProvider" AS ENUM ('GITHUB', 'AZURE_DEVOPS');
CREATE TYPE "ScmConnectionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'ERROR');
CREATE TYPE "ScmAuthMode" AS ENUM ('INSTALLATION', 'SERVICE_PRINCIPAL', 'MANAGED_IDENTITY');
CREATE TYPE "ScmDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');
CREATE TYPE "CodeReviewState" AS ENUM ('OPEN', 'MERGED', 'CLOSED', 'ABANDONED');
CREATE TYPE "CodeReviewDecision" AS ENUM ('NONE', 'PENDING', 'COMMENTED', 'APPROVED', 'APPROVED_WITH_SUGGESTIONS', 'CHANGES_REQUESTED', 'WAITING_FOR_AUTHOR', 'REJECTED');
CREATE TYPE "CodeReviewLinkSource" AS ENUM ('MANUAL', 'DETECTED', 'PROVIDER');

CREATE TABLE "scm_connections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" "ScmProvider" NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "ScmConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "auth_mode" "ScmAuthMode" NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scm_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scm_connection_secrets" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scm_connection_secrets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scm_repositories" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "team_id" TEXT,
    "external_project_id" TEXT,
    "external_repository_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "is_private" BOOLEAN NOT NULL DEFAULT true,
    "default_branch" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scm_repositories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scm_user_identities" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scm_user_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "code_reviews" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "external_review_id" TEXT NOT NULL,
    "number" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "state" "CodeReviewState" NOT NULL,
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "external_author_id" TEXT NOT NULL,
    "author_name" TEXT,
    "source_ref" TEXT NOT NULL,
    "target_ref" TEXT NOT NULL,
    "head_revision" TEXT NOT NULL,
    "latest_revision_key" TEXT NOT NULL,
    "remote_url" TEXT NOT NULL,
    "additions" INTEGER,
    "deletions" INTEGER,
    "changed_files" INTEGER,
    "external_created_at" TIMESTAMP(3) NOT NULL,
    "external_updated_at" TIMESTAMP(3) NOT NULL,
    "merged_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "code_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "code_review_revisions" (
    "id" TEXT NOT NULL,
    "code_review_id" TEXT NOT NULL,
    "external_revision_id" TEXT NOT NULL,
    "sequence" INTEGER,
    "base_revision" TEXT,
    "head_revision" TEXT NOT NULL,
    "external_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "code_review_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "code_review_reviewers" (
    "id" TEXT NOT NULL,
    "code_review_id" TEXT NOT NULL,
    "flowie_user_id" TEXT,
    "external_user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "reviewer_kind" TEXT NOT NULL DEFAULT 'USER',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "decision" "CodeReviewDecision" NOT NULL DEFAULT 'NONE',
    "provider_decision" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "code_review_reviewers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "code_review_issue_links" (
    "workspace_id" TEXT NOT NULL,
    "code_review_id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "source" "CodeReviewLinkSource" NOT NULL DEFAULT 'MANUAL',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "code_review_issue_links_pkey" PRIMARY KEY ("code_review_id", "issue_id")
);

CREATE TABLE "code_review_view_states" (
    "code_review_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_viewed_revision" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "code_review_view_states_pkey" PRIMARY KEY ("code_review_id", "user_id")
);

CREATE TABLE "scm_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "external_delivery_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "action" TEXT,
    "status" "ScmDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "payload_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    CONSTRAINT "scm_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scm_connections_workspace_id_provider_external_account_id_key" ON "scm_connections"("workspace_id", "provider", "external_account_id");
CREATE INDEX "scm_connections_workspace_id_provider_status_idx" ON "scm_connections"("workspace_id", "provider", "status");
CREATE UNIQUE INDEX "scm_connection_secrets_connection_id_key" ON "scm_connection_secrets"("connection_id");
CREATE UNIQUE INDEX "scm_repositories_connection_id_external_repository_id_key" ON "scm_repositories"("connection_id", "external_repository_id");
CREATE INDEX "scm_repositories_workspace_id_team_id_enabled_idx" ON "scm_repositories"("workspace_id", "team_id", "enabled");
CREATE INDEX "scm_repositories_connection_id_archived_at_idx" ON "scm_repositories"("connection_id", "archived_at");
CREATE UNIQUE INDEX "scm_user_identities_connection_id_user_id_key" ON "scm_user_identities"("connection_id", "user_id");
CREATE UNIQUE INDEX "scm_user_identities_connection_id_external_user_id_key" ON "scm_user_identities"("connection_id", "external_user_id");
CREATE INDEX "scm_user_identities_workspace_id_user_id_idx" ON "scm_user_identities"("workspace_id", "user_id");
CREATE UNIQUE INDEX "code_reviews_repository_id_external_review_id_key" ON "code_reviews"("repository_id", "external_review_id");
CREATE INDEX "code_reviews_workspace_id_state_external_updated_at_idx" ON "code_reviews"("workspace_id", "state", "external_updated_at");
CREATE INDEX "code_reviews_repository_id_external_updated_at_idx" ON "code_reviews"("repository_id", "external_updated_at");
CREATE UNIQUE INDEX "code_review_revisions_code_review_id_external_revision_id_key" ON "code_review_revisions"("code_review_id", "external_revision_id");
CREATE INDEX "code_review_revisions_code_review_id_sequence_idx" ON "code_review_revisions"("code_review_id", "sequence");
CREATE UNIQUE INDEX "code_review_reviewers_code_review_id_external_user_id_key" ON "code_review_reviewers"("code_review_id", "external_user_id");
CREATE INDEX "code_review_reviewers_flowie_user_id_decision_idx" ON "code_review_reviewers"("flowie_user_id", "decision");
CREATE INDEX "code_review_issue_links_workspace_id_issue_id_idx" ON "code_review_issue_links"("workspace_id", "issue_id");
CREATE INDEX "code_review_view_states_user_id_updated_at_idx" ON "code_review_view_states"("user_id", "updated_at");
CREATE UNIQUE INDEX "scm_webhook_deliveries_connection_id_external_delivery_id_key" ON "scm_webhook_deliveries"("connection_id", "external_delivery_id");
CREATE INDEX "scm_webhook_deliveries_status_received_at_idx" ON "scm_webhook_deliveries"("status", "received_at");

ALTER TABLE "scm_connections" ADD CONSTRAINT "scm_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scm_connections" ADD CONSTRAINT "scm_connections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scm_connection_secrets" ADD CONSTRAINT "scm_connection_secrets_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "scm_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scm_repositories" ADD CONSTRAINT "scm_repositories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scm_repositories" ADD CONSTRAINT "scm_repositories_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "scm_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scm_repositories" ADD CONSTRAINT "scm_repositories_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "scm_user_identities" ADD CONSTRAINT "scm_user_identities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scm_user_identities" ADD CONSTRAINT "scm_user_identities_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "scm_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scm_user_identities" ADD CONSTRAINT "scm_user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_reviews" ADD CONSTRAINT "code_reviews_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_reviews" ADD CONSTRAINT "code_reviews_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "scm_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_review_revisions" ADD CONSTRAINT "code_review_revisions_code_review_id_fkey" FOREIGN KEY ("code_review_id") REFERENCES "code_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_review_reviewers" ADD CONSTRAINT "code_review_reviewers_code_review_id_fkey" FOREIGN KEY ("code_review_id") REFERENCES "code_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_review_reviewers" ADD CONSTRAINT "code_review_reviewers_flowie_user_id_fkey" FOREIGN KEY ("flowie_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "code_review_issue_links" ADD CONSTRAINT "code_review_issue_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_review_issue_links" ADD CONSTRAINT "code_review_issue_links_code_review_id_fkey" FOREIGN KEY ("code_review_id") REFERENCES "code_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_review_issue_links" ADD CONSTRAINT "code_review_issue_links_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_review_issue_links" ADD CONSTRAINT "code_review_issue_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "code_review_view_states" ADD CONSTRAINT "code_review_view_states_code_review_id_fkey" FOREIGN KEY ("code_review_id") REFERENCES "code_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_review_view_states" ADD CONSTRAINT "code_review_view_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scm_webhook_deliveries" ADD CONSTRAINT "scm_webhook_deliveries_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "scm_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
