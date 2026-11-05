-- Numbers tickets per workspace in creation order, archived ones included, so a code is never reused.
-- The sequence continues from the highest number, and only then does the column become required.
-- VI: Đánh số ticket trong từng workspace theo thứ tự tạo, gồm cả ticket đã lưu trữ, để mã không bị dùng lại.
-- VI: Bộ đếm tiếp tục từ số lớn nhất, sau đó cột mới trở thành bắt buộc.
ALTER TABLE "workspaces" ADD COLUMN "ticket_sequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "asks" ADD COLUMN "number" INTEGER;

WITH numbered AS (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "workspace_id" ORDER BY "created_at", "id") AS "position"
    FROM "asks"
)
UPDATE "asks" SET "number" = numbered."position"
FROM numbered WHERE "asks"."id" = numbered."id";

UPDATE "workspaces" SET "ticket_sequence" = counts."highest"
FROM (SELECT "workspace_id", MAX("number") AS "highest" FROM "asks" GROUP BY "workspace_id") AS counts
WHERE "workspaces"."id" = counts."workspace_id";

ALTER TABLE "asks" ALTER COLUMN "number" SET NOT NULL;

CREATE UNIQUE INDEX "asks_workspace_id_number_key" ON "asks"("workspace_id", "number");
