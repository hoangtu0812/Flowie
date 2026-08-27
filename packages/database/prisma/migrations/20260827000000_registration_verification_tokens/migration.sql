CREATE TABLE "registration_verification_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "code_hash" TEXT NOT NULL,
    "request_fingerprint" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "registration_verification_tokens_email_key"
ON "registration_verification_tokens"("email");

CREATE INDEX "registration_verification_tokens_expires_at_idx"
ON "registration_verification_tokens"("expires_at");
