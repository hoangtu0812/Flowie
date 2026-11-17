-- Sub projects of a project and their many-to-many links to issues (DTD-915). Additive only:
-- no existing table or row changes.
-- VI: Sub project của dự án và liên kết nhiều-nhiều với issue (DTD-915). Chỉ thêm mới: không đổi
-- VI: bảng hay dòng dữ liệu hiện có.
-- CreateTable
CREATE TABLE "sub_project_labels" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_project_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_sub_project_labels" (
    "issue_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_sub_project_labels_pkey" PRIMARY KEY ("issue_id","label_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sub_project_labels_project_id_name_key" ON "sub_project_labels"("project_id", "name");

-- CreateIndex
CREATE INDEX "issue_sub_project_labels_label_id_idx" ON "issue_sub_project_labels"("label_id");

-- AddForeignKey
ALTER TABLE "sub_project_labels" ADD CONSTRAINT "sub_project_labels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_sub_project_labels" ADD CONSTRAINT "issue_sub_project_labels_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_sub_project_labels" ADD CONSTRAINT "issue_sub_project_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "sub_project_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

