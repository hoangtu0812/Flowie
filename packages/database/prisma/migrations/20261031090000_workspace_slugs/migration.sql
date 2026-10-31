-- Workspace URL slugs, phase 2 of DTD-140 (DTD-203). workspaces.slug already exists and is
-- unique; this keeps every slug a workspace has used so old links resolve and a slug is never
-- handed to another workspace. A trigger records each new slug for every write path.
-- VI: Slug URL của workspace, giai đoạn 2 của DTD-140 (DTD-203). workspaces.slug đã có và duy
-- VI: nhất; bảng này giữ mọi slug một workspace đã dùng để link cũ vẫn mở được và slug không bao
-- VI: giờ được cấp cho workspace khác. Trigger ghi slug mới cho mọi đường ghi.

-- CreateTable
CREATE TABLE "workspace_slugs" (
    "slug" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_slugs_pkey" PRIMARY KEY ("slug")
);

INSERT INTO "workspace_slugs" ("slug", "workspace_id") SELECT "slug", "id" FROM "workspaces";

-- CreateIndex
CREATE INDEX "workspace_slugs_workspace_id_idx" ON "workspace_slugs"("workspace_id");

-- AddForeignKey
ALTER TABLE "workspace_slugs" ADD CONSTRAINT "workspace_slugs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Records the slug as owned by the workspace. A slug already owned by another workspace (its
-- current slug or an alias) raises unique_violation, which the API turns into 409; a concurrent
-- writer waits on the same primary key, so only one of two racing renames succeeds.
-- VI: Ghi slug là của workspace. Slug đã thuộc workspace khác (slug hiện tại hoặc alias) báo
-- VI: unique_violation, API đổi thành 409; ghi đồng thời phải chờ cùng khoá chính, nên trong hai
-- VI: lần đổi tranh nhau chỉ một lần thành công.
CREATE FUNCTION flowie_workspace_slug_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO workspace_slugs (slug, workspace_id) VALUES (NEW.slug, NEW.id)
  ON CONFLICT (slug) DO NOTHING;
  IF EXISTS (SELECT 1 FROM workspace_slugs WHERE slug = NEW.slug AND workspace_id <> NEW.id) THEN
    RAISE EXCEPTION 'Workspace slug "%" is already used.', NEW.slug
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'workspace_slugs_pkey';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER workspace_slug_history AFTER INSERT OR UPDATE OF slug ON "workspaces"
FOR EACH ROW EXECUTE FUNCTION flowie_workspace_slug_history();
