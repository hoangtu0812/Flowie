-- AlterTable
ALTER TABLE "news_categories" ADD COLUMN "digest" TEXT,
ADD COLUMN "digest_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "news_items" ADD COLUMN "ai_summary" TEXT,
ADD COLUMN "analyzed_at" TIMESTAMP(3),
ADD COLUMN "risk_level" TEXT,
ADD COLUMN "risk_score" INTEGER;
