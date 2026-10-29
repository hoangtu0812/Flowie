-- Folder numbers: a stored two-digit number per folder, shown as the "NN · name" prefix in the
-- Docs tree and in SharePoint paths. The backfill is deterministic and keeps every visible label
-- that already carried a number.
-- VI: Số thư mục: số hai chữ số lưu cho từng thư mục, hiển thị thành tiền tố "NN · tên" trên cây
-- VI: Docs và trong đường dẫn SharePoint. Backfill có tính xác định và giữ nguyên nhãn đang hiển
-- VI: thị của các thư mục vốn đã có số.
ALTER TABLE "document_folders" ADD COLUMN "number" INTEGER;

-- 1. Names typed with a number ("00 · Tổng quan", "01. Turn Around", "02 Foo") become number +
-- bare name. Skipped when the bare name would clash with a sibling (or another split sibling),
-- when two siblings share the prefix (only the first in tree order keeps it), or when the bare
-- name is shorter than the two characters the API requires.
-- VI: 1. Tên có gõ sẵn số ("00 · Tổng quan", "01. Turn Around", "02 Foo") được tách thành số +
-- VI: tên. Bỏ qua khi tên sau khi tách trùng với thư mục cùng cha (hoặc thư mục khác vừa tách),
-- VI: khi hai thư mục cùng cha có cùng số (chỉ thư mục đứng trước theo thứ tự cây giữ số), hoặc
-- VI: khi tên còn lại ngắn hơn hai ký tự mà API yêu cầu.
WITH parsed AS (
    SELECT id, team_id, parent_id, position, created_at,
           CAST(substring(name FROM '^([0-9]{2})') AS INTEGER) AS number,
           btrim(regexp_replace(name, '^[0-9]{2}(\s*[·.\-]\s*|\s+)', '')) AS bare
    FROM "document_folders"
    WHERE parent_id IS NOT NULL AND name ~ '^[0-9]{2}(\s*[·.\-]\s*|\s+)\S'
), ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY parent_id, number ORDER BY position, created_at, id) AS number_rank,
           ROW_NUMBER() OVER (PARTITION BY parent_id, lower(bare) ORDER BY position, created_at, id) AS name_rank
    FROM parsed
)
UPDATE "document_folders" f SET number = r.number, name = r.bare
FROM ranked r
WHERE f.id = r.id AND r.number_rank = 1 AND r.name_rank = 1 AND char_length(r.bare) >= 2
  AND NOT EXISTS (
      SELECT 1 FROM "document_folders" s
      WHERE s.team_id = r.team_id AND s.parent_id = r.parent_id AND s.id <> r.id
        AND lower(s.name) = lower(r.bare)
  );

-- 2. Every other folder below a project root gets the next numbers among its siblings, in tree
-- order (position, creation, id), after the highest number below 99 ("99 · Vận hành" stays the
-- last slot). Numbers that would reach 99 are left empty. Project roots and team folders outside
-- a project stay unnumbered.
-- VI: 2. Các thư mục còn lại bên dưới thư mục gốc dự án nhận số kế tiếp trong cùng thư mục cha,
-- VI: theo thứ tự cây (vị trí, thời điểm tạo, id), sau số lớn nhất nhỏ hơn 99 ("99 · Vận hành"
-- VI: vẫn là ô cuối). Số chạm tới 99 thì để trống. Thư mục gốc dự án và thư mục team ngoài dự
-- VI: án không được đánh số.
WITH base AS (
    SELECT parent_id, COALESCE(MAX(number) FILTER (WHERE number < 99), 0) AS top
    FROM "document_folders" WHERE parent_id IS NOT NULL
    GROUP BY parent_id
), pending AS (
    SELECT f.id,
           b.top + ROW_NUMBER() OVER (PARTITION BY f.parent_id ORDER BY f.position, f.created_at, f.id) AS number
    FROM "document_folders" f JOIN base b ON b.parent_id = f.parent_id
    WHERE f.number IS NULL AND f.project_id IS NOT NULL
)
UPDATE "document_folders" f SET number = p.number
FROM pending p
WHERE f.id = p.id AND p.number < 99;

CREATE UNIQUE INDEX "document_folders_parent_id_number_key" ON "document_folders"("parent_id", "number");

-- 3. Published documents now live under numbered paths: clearing the published release makes the
-- publish job upload the latest approved release once more under the new path. Files at the old
-- unnumbered paths are left on SharePoint; Flowie never deletes or moves files there.
-- VI: 3. Tài liệu đã phát hành giờ nằm dưới đường dẫn có số: xoá release đã phát hành để job tải
-- VI: lại phiên bản đã duyệt mới nhất một lần theo đường dẫn mới. File ở đường dẫn cũ không số
-- VI: được giữ trên SharePoint; Flowie không bao giờ xoá hay di chuyển file ở đó.
UPDATE "document_publications" SET release = NULL WHERE release IS NOT NULL;
