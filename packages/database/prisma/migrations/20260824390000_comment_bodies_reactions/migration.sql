ALTER TABLE "comments" ADD COLUMN "body" JSONB;

UPDATE "comments"
SET "body" = jsonb_build_object(
    'version', 1,
    'blocks', jsonb_build_array(
        jsonb_build_object('type', 'paragraph', 'text', "content")
    )
)
WHERE "body" IS NULL;

CREATE TABLE "comment_reactions" (
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("comment_id", "user_id", "emoji")
);

CREATE INDEX "comment_reactions_user_id_idx" ON "comment_reactions"("user_id");

ALTER TABLE "comment_reactions"
ADD CONSTRAINT "comment_reactions_comment_id_fkey"
FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comment_reactions"
ADD CONSTRAINT "comment_reactions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
