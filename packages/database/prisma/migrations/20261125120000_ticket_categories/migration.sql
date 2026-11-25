-- Service Desk ticket categories, one list per workspace. Additive only: existing tickets keep a
-- null category, and a workspace without categories raises tickets as before.
-- VI: Phân loại ticket Service Desk, mỗi workspace một danh sách. Chỉ thêm mới: ticket hiện có giữ
-- VI: phân loại null, và workspace chưa có phân loại vẫn tạo ticket như trước.
-- CreateTable
CREATE TABLE "ticket_categories" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_categories_workspace_id_name_key" ON "ticket_categories"("workspace_id", "name");

-- AddForeignKey
ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "asks" ADD COLUMN "category_id" TEXT;

-- CreateIndex
CREATE INDEX "asks_category_id_idx" ON "asks"("category_id");

-- AddForeignKey
ALTER TABLE "asks" ADD CONSTRAINT "asks_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ticket_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
