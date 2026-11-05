-- Adds the team member handling a ticket; existing tickets stay unassigned and keep notifying the team.
-- VI: Thêm thành viên team xử lý ticket; ticket hiện có giữ trạng thái chưa giao và vẫn báo cho cả team.
ALTER TABLE "asks" ADD COLUMN "assignee_id" TEXT;

CREATE INDEX "asks_assignee_id_idx" ON "asks"("assignee_id");

ALTER TABLE "asks" ADD CONSTRAINT "asks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
