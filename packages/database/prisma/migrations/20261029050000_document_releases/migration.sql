-- AlterTable
ALTER TABLE "document_publications" ADD COLUMN     "release" INTEGER;

-- CreateTable
CREATE TABLE "document_releases" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "release" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "approved_by" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_releases_document_id_release_key" ON "document_releases"("document_id", "release");

-- AddForeignKey
ALTER TABLE "document_releases" ADD CONSTRAINT "document_releases_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Editing the title or content of an Approved document returns it to Draft, so a new text is
-- never published without a fresh approval. Lives in the database so REST, MCP, the runner and
-- revision restores all follow the same rule. Type, pin and folder changes keep the status.
-- VI: Sửa tiêu đề hoặc nội dung của tài liệu Đã duyệt sẽ đưa nó về Nháp, để nội dung mới không
-- VI: bao giờ được phát hành khi chưa duyệt lại. Đặt trong DB để REST, MCP, runner và khôi phục
-- VI: bản sửa đều theo cùng quy tắc. Đổi loại, ghim, thư mục giữ nguyên trạng thái.
CREATE FUNCTION flowie_document_status() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'APPROVED' AND NEW.status = 'APPROVED'
       AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.content IS DISTINCT FROM OLD.content) THEN
        NEW.status := 'DRAFT';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER document_status BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION flowie_document_status();

-- Entering Approved freezes the title and content as the next release (v1, v2 …). The approver
-- is the user who made this update. The UPDATE holds the document row lock, so concurrent
-- approvals of one document queue and never share a release number.
-- VI: Chuyển sang Đã duyệt sẽ chụp tiêu đề và nội dung thành phiên bản kế tiếp (v1, v2 …).
-- VI: Người duyệt là người thực hiện lần cập nhật này. UPDATE giữ khóa dòng tài liệu, nên các
-- VI: lần duyệt đồng thời một tài liệu được xếp hàng và không trùng số phiên bản.
CREATE FUNCTION flowie_document_release() RETURNS TRIGGER AS $$
DECLARE next_release INTEGER;
BEGIN
    IF NEW.status = 'APPROVED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'APPROVED') THEN
        SELECT COALESCE(MAX(release), 0) + 1 INTO next_release FROM document_releases WHERE document_id = NEW.id;
        INSERT INTO document_releases (id, document_id, release, revision, title, content, approved_by, approved_at)
        VALUES (NEW.id || ':v' || next_release, NEW.id, next_release, NEW.version, NEW.title, NEW.content,
                NEW.updated_by, CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER document_release AFTER INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION flowie_document_release();

-- Documents approved before releases existed become v1. Their publication release stays NULL,
-- so the publish job uploads v1 once more in the new layout (latest file + _versions copy).
-- VI: Tài liệu đã duyệt trước khi có phiên bản phát hành trở thành v1. Release của publication
-- VI: để NULL, nên job tải lại v1 một lần theo cách lưu mới (file mới nhất + bản trong _versions).
INSERT INTO document_releases (id, document_id, release, revision, title, content, approved_by, approved_at)
SELECT id || ':v1', id, 1, version, title, content, updated_by, updated_at
FROM documents WHERE status = 'APPROVED';
