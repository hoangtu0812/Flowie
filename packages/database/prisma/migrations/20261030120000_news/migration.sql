-- CreateTable
CREATE TABLE "news_categories" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "webhook_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_sources" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feed_url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_fetched_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "summary" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_categories_workspace_id_name_key" ON "news_categories"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "news_sources_category_id_idx" ON "news_sources"("category_id");

-- CreateIndex
CREATE INDEX "news_items_workspace_id_published_at_idx" ON "news_items"("workspace_id", "published_at");

-- CreateIndex
CREATE INDEX "news_items_source_id_idx" ON "news_items"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "news_items_workspace_id_url_key" ON "news_items"("workspace_id", "url");

-- AddForeignKey
ALTER TABLE "news_categories" ADD CONSTRAINT "news_categories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_sources" ADD CONSTRAINT "news_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_sources" ADD CONSTRAINT "news_sources_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "news_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "news_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Every existing workspace starts with a Security group and three security feeds. Ids are
-- derived from the workspace id so the seed is idempotent; new workspaces add groups themselves.
-- VI: Mọi workspace hiện có được tạo sẵn nhóm Security và ba feed bảo mật. Id suy ra từ id
-- VI: workspace nên seed chạy lại không trùng; workspace mới tự thêm nhóm.
INSERT INTO "news_categories" ("id", "workspace_id", "name", "updated_at")
SELECT "id" || ':news-security', "id", 'Security', CURRENT_TIMESTAMP FROM "workspaces"
ON CONFLICT DO NOTHING;

INSERT INTO "news_sources" ("id", "workspace_id", "category_id", "name", "feed_url")
SELECT w."id" || ':news-' || s.key, w."id", w."id" || ':news-security', s.name, s.url
FROM "workspaces" w
CROSS JOIN (VALUES
    ('cisa', 'CISA advisories', 'https://www.cisa.gov/cybersecurity-advisories/cybersecurity-advisories.xml'),
    ('thehackernews', 'The Hacker News', 'https://feeds.feedburner.com/TheHackersNews'),
    ('bleepingcomputer', 'BleepingComputer', 'https://www.bleepingcomputer.com/feed/')
) AS s(key, name, url)
ON CONFLICT DO NOTHING;
