-- Adds an independent work-item type without changing workflow states or existing records.
-- VI: Thêm loại công việc độc lập mà không thay trạng thái workflow hoặc bản ghi hiện có.
ALTER TYPE "IssueType" ADD VALUE IF NOT EXISTS 'EPIC';
