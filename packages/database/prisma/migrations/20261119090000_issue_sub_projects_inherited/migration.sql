-- Sub project mode of an issue (DTD-961): true keeps the issue's sub projects equal to its
-- parent's (copied into issue_sub_project_labels), false lets the issue set its own. Additive
-- only; existing issues start independent so their sub projects stay as they are.
-- VI: Chế độ sub project của issue (DTD-961): true giữ sub project của issue bằng của parent
-- VI: (sao chép vào issue_sub_project_labels), false để issue tự gán. Chỉ thêm mới; issue hiện
-- VI: có bắt đầu ở chế độ độc lập nên sub project của chúng giữ nguyên.
-- AlterTable
ALTER TABLE "issues" ADD COLUMN "sub_projects_inherited" BOOLEAN NOT NULL DEFAULT false;
