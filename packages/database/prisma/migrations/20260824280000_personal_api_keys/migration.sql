CREATE TABLE "personal_api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "personal_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personal_api_keys_token_hash_key" ON "personal_api_keys"("token_hash");
CREATE INDEX "personal_api_keys_user_id_revoked_at_created_at_idx" ON "personal_api_keys"("user_id", "revoked_at", "created_at");
CREATE INDEX "personal_api_keys_expires_at_idx" ON "personal_api_keys"("expires_at");

ALTER TABLE "personal_api_keys"
ADD CONSTRAINT "personal_api_keys_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
