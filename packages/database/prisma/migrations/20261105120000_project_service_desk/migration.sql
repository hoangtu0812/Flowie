-- Adds the per-project Service Desk switch, off for every existing project so nothing opens on deploy.
-- VI: Thêm công tắc Service Desk theo dự án, tắt cho mọi dự án hiện có để không mở gì khi deploy.
ALTER TABLE "projects" ADD COLUMN "service_desk_enabled" BOOLEAN NOT NULL DEFAULT false;
