ALTER TABLE "sessions" ADD COLUMN "mfa_verified_at" TIMESTAMP(3);
CREATE TABLE "account_mfa" (
  "user_id" TEXT NOT NULL,
  "secret_cipher" TEXT NOT NULL,
  "enabled_at" TIMESTAMP(3),
  "pending_until" TIMESTAMP(3),
  "last_counter" BIGINT,
  "recovery_hashes" JSONB NOT NULL DEFAULT '[]',
  CONSTRAINT "account_mfa_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "account_mfa_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "mfa_challenges" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "auth_version" INTEGER NOT NULL,
  "auth_method" TEXT NOT NULL,
  "authenticated_at" TIMESTAMP(3),
  "next_path" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mfa_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "mfa_challenges_token_hash_key" ON "mfa_challenges"("token_hash");
CREATE INDEX "mfa_challenges_user_id_idx" ON "mfa_challenges"("user_id");
CREATE INDEX "mfa_challenges_expires_at_idx" ON "mfa_challenges"("expires_at");
