-- The first news release seeded every workspace with the cisa.gov advisories feed and BleepingComputer;
-- both answer 403 from the production server. CISA's data now comes from its GitHub mirror (the
-- "CISA KEV" suggested feed). Only copies that never delivered an item are removed, so no news is lost.
-- VI: Bản tin tức đầu tiên seed feed advisories của cisa.gov và BleepingComputer cho mọi workspace;
-- VI: cả hai trả 403 từ server production. Dữ liệu CISA giờ lấy từ bản mirror GitHub (feed gợi ý
-- VI: "CISA KEV"). Chỉ xóa bản chưa từng lấy được tin nào, nên không mất tin.
DELETE FROM "news_sources" s
WHERE s."feed_url" IN (
    'https://www.cisa.gov/cybersecurity-advisories/cybersecurity-advisories.xml',
    'https://www.bleepingcomputer.com/feed/'
)
AND NOT EXISTS (SELECT 1 FROM "news_items" i WHERE i."source_id" = s."id");
