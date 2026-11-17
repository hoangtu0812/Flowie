-- Hours a person spent on an issue on one day (DTD-902). The API keeps hours in quarter steps
-- between 0.25 and 24 and recomputes the issue's actual effort from the sum; the check repeats
-- the range so no other writer can store a negative or impossible day.
-- VI: Số giờ một người làm trên một issue trong một ngày (DTD-902). API giữ số giờ theo bước 0,25
-- VI: trong khoảng 0,25 đến 24 và tính lại actual effort của issue từ tổng; check lặp lại khoảng
-- VI: này để không đường ghi nào khác lưu được giá trị âm hay vượt quá một ngày.
CREATE TABLE "issue_worklogs" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_worklogs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "issue_worklogs_hours_check" CHECK ("hours" > 0 AND "hours" <= 24)
);

CREATE INDEX "issue_worklogs_issue_id_work_date_idx" ON "issue_worklogs"("issue_id", "work_date");

CREATE INDEX "issue_worklogs_user_id_work_date_idx" ON "issue_worklogs"("user_id", "work_date");

ALTER TABLE "issue_worklogs" ADD CONSTRAINT "issue_worklogs_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_worklogs" ADD CONSTRAINT "issue_worklogs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
