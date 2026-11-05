-- Adds the requester conversation, kept apart from issue comments, and the last ticket status reported.
-- VI: Thêm trao đổi với người yêu cầu, tách khỏi comment của Issue, và trạng thái ticket đã báo gần nhất.
ALTER TABLE "asks" ADD COLUMN "notified_ticket_status" TEXT;

CREATE TABLE "ask_messages" (
    "id" TEXT NOT NULL,
    "ask_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ask_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ask_messages_ask_id_created_at_idx" ON "ask_messages"("ask_id", "created_at");

ALTER TABLE "ask_messages" ADD CONSTRAINT "ask_messages_ask_id_fkey" FOREIGN KEY ("ask_id") REFERENCES "asks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ask_messages" ADD CONSTRAINT "ask_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
