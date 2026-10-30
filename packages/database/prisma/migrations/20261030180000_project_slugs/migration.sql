-- Project URL slugs (DTD-140). Every project gets a slug derived from its identifier; earlier
-- slugs stay in project_slugs so old links resolve. Triggers keep both in step for every write
-- path (API, MCP, seeds, imports), so no INSERT has to know about slugs.
-- VI: Slug URL của dự án (DTD-140). Mỗi dự án có slug tạo từ identifier; slug cũ được giữ trong
-- VI: project_slugs để link cũ vẫn mở được. Trigger giữ hai nơi đồng bộ cho mọi đường ghi (API,
-- VI: MCP, seed, import), nên không câu INSERT nào phải biết về slug.

ALTER TABLE "projects" ADD COLUMN "slug" TEXT;

-- Backfill: lower-cased identifier with non [a-z0-9] runs turned into "-". Identifiers are unique
-- per workspace, but two can collapse to the same slug (for example "A_B" and "A-B"); every
-- project after the first keeps a suffix from its id, which cannot collide.
-- VI: Backfill: identifier viết thường, chuỗi ký tự ngoài [a-z0-9] thành "-". Identifier duy nhất
-- VI: trong workspace nhưng hai identifier có thể ra cùng slug (ví dụ "A_B" và "A-B"); từ dự án thứ
-- VI: hai trở đi thêm hậu tố lấy từ id, nên không thể trùng.
WITH base AS (
  SELECT id, workspace_id, created_at,
         COALESCE(NULLIF(trim(both '-' FROM regexp_replace(lower(identifier), '[^a-z0-9]+', '-', 'g')), ''), 'project') AS slug
  FROM "projects"
), ranked AS (
  SELECT id, slug, row_number() OVER (PARTITION BY workspace_id, slug ORDER BY created_at, id) AS n FROM base
)
UPDATE "projects" p
SET "slug" = CASE WHEN r.n = 1 THEN r.slug ELSE r.slug || '-' || lower(right(p.id, 6)) END
FROM ranked r WHERE r.id = p.id;

ALTER TABLE "projects" ALTER COLUMN "slug" SET NOT NULL;

-- CreateTable
CREATE TABLE "project_slugs" (
    "workspace_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_slugs_pkey" PRIMARY KEY ("workspace_id","slug")
);

INSERT INTO "project_slugs" ("workspace_id", "slug", "project_id")
SELECT "workspace_id", "slug", "id" FROM "projects";

-- CreateIndex
CREATE INDEX "project_slugs_project_id_idx" ON "project_slugs"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_id_slug_key" ON "projects"("workspace_id", "slug");

-- AddForeignKey
ALTER TABLE "project_slugs" ADD CONSTRAINT "project_slugs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_slugs" ADD CONSTRAINT "project_slugs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A project inserted without a slug gets one from its identifier, with an id suffix when the
-- base is already a current slug or an alias in the workspace. BEFORE triggers run before the
-- NOT NULL check, so existing INSERTs keep working.
-- VI: Dự án được INSERT không kèm slug sẽ nhận slug từ identifier, thêm hậu tố id khi slug gốc đã
-- VI: là slug hiện tại hoặc alias trong workspace. Trigger BEFORE chạy trước kiểm tra NOT NULL,
-- VI: nên các câu INSERT hiện có vẫn chạy.
CREATE FUNCTION flowie_project_slug_default() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base TEXT;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base := COALESCE(NULLIF(trim(both '-' FROM regexp_replace(lower(NEW.identifier), '[^a-z0-9]+', '-', 'g')), ''), 'project');
    IF EXISTS (SELECT 1 FROM project_slugs WHERE workspace_id = NEW.workspace_id AND slug = base)
       OR EXISTS (SELECT 1 FROM projects WHERE workspace_id = NEW.workspace_id AND slug = base) THEN
      base := base || '-' || lower(right(NEW.id, 6));
    END IF;
    NEW.slug := base;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_slug_default BEFORE INSERT ON "projects"
FOR EACH ROW EXECUTE FUNCTION flowie_project_slug_default();

-- Records the new slug as owned by the project. A slug already owned by another project (its
-- current slug or an alias) raises unique_violation, which the API turns into 409; a concurrent
-- writer waits on the same primary key, so only one of two racing renames succeeds.
-- VI: Ghi slug mới là của dự án. Slug đã thuộc dự án khác (slug hiện tại hoặc alias) báo
-- VI: unique_violation, API đổi thành 409; ghi đồng thời phải chờ cùng khoá chính, nên trong hai
-- VI: lần đổi tranh nhau chỉ một lần thành công.
CREATE FUNCTION flowie_project_slug_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO project_slugs (workspace_id, slug, project_id)
  VALUES (NEW.workspace_id, NEW.slug, NEW.id)
  ON CONFLICT (workspace_id, slug) DO NOTHING;
  IF EXISTS (SELECT 1 FROM project_slugs WHERE workspace_id = NEW.workspace_id AND slug = NEW.slug AND project_id <> NEW.id) THEN
    RAISE EXCEPTION 'Project slug "%" is already used in this workspace.', NEW.slug
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'project_slugs_pkey';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER project_slug_history AFTER INSERT OR UPDATE OF slug ON "projects"
FOR EACH ROW EXECUTE FUNCTION flowie_project_slug_history();
