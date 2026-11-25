-- Suggested news groups are installed once per workspace by the news job; this column records when.
-- Additive only; every existing workspace starts unmarked, so each gets the groups on the next run.
-- VI: Tác vụ tin tức cài nhóm tin gợi ý một lần cho mỗi workspace; cột này ghi lại thời điểm đó.
-- VI: Chỉ thêm mới; mọi workspace hiện có chưa được đánh dấu, nên đều nhận nhóm ở lượt chạy tới.
-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN "news_presets_at" TIMESTAMP(3);
