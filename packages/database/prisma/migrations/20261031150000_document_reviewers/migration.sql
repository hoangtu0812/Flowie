-- CreateTable
CREATE TABLE "document_reviewers" (
    "document_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" TEXT,
    "note" TEXT,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "document_reviewers_pkey" PRIMARY KEY ("document_id","reviewer_id")
);

-- CreateIndex
CREATE INDEX "document_reviewers_reviewer_id_idx" ON "document_reviewers"("reviewer_id");

-- AddForeignKey
ALTER TABLE "document_reviewers" ADD CONSTRAINT "document_reviewers_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A review decision covers the text that was reviewed: entering In review again, or changing the
-- title or content, clears every decision of the document while its reviewers stay assigned.
-- Lives in the database so REST, MCP, the runner and revision restores follow the same rule.
-- VI: Quyết định duyệt chỉ áp dụng cho nội dung đã được xem: vào lại Đang duyệt, hoặc đổi tiêu đề
-- VI: hay nội dung, sẽ xoá mọi quyết định của tài liệu, reviewer vẫn được giữ. Đặt trong DB để
-- VI: REST, MCP, runner và khôi phục bản sửa đều theo cùng quy tắc.
CREATE FUNCTION flowie_document_review_reset() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status = 'IN_REVIEW' AND OLD.status IS DISTINCT FROM 'IN_REVIEW')
       OR NEW.title IS DISTINCT FROM OLD.title OR NEW.content IS DISTINCT FROM OLD.content THEN
        UPDATE document_reviewers SET decision = NULL, note = NULL, decided_at = NULL
        WHERE document_id = NEW.id AND decision IS NOT NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER document_review_reset AFTER UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION flowie_document_review_reset();
