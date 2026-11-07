import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';
import { releaseFromChangelog, type Release } from './lib/changelog';

/**
 * Release identity is read from CHANGELOG.md at build time so the running app
 * can name its own version. The changelog is the single source: a release that
 * is not written down there cannot be shown, which is the point — it makes a
 * forgotten changelog entry visible inside the product instead of silent.
 *
 * Only the file read lives here. Turning the markdown into entries is
 * lib/changelog, because what a bullet ends up looking like is what users read
 * and therefore needs tests, which a Next config cannot have.
 *
 * VI: Thông tin phiên bản được đọc từ CHANGELOG.md lúc build để ứng dụng đang
 * chạy tự gọi được tên phiên bản của mình. Changelog là nguồn duy nhất: một bản
 * phát hành không được ghi ở đó thì không thể hiển thị, và đó chính là chủ ý —
 * nó làm một mục changelog bị quên trở nên thấy được trong sản phẩm thay vì âm
 * thầm.
 *
 * Ở đây chỉ còn việc đọc tệp. Việc chuyển markdown thành các mục nằm ở
 * lib/changelog, vì hình dạng cuối cùng của một dòng chính là thứ user đọc nên
 * cần có test, điều mà một tệp cấu hình Next không làm được.
 */
function readRelease(): Release {
   try {
      return releaseFromChangelog(
         readFileSync(join(process.cwd(), '..', '..', 'CHANGELOG.md'), 'utf8')
      );
   } catch {
      return { version: '', releasedAt: '', highlights: [], notes: [] };
   }
}

const release = readRelease();
// Build-time sub-path for serving Flowie under another site, e.g. '/flowie'
// behind https://poc-dtd.bsr.com.vn/flowie. Empty keeps Flowie at the host
// root. A trailing slash is dropped because Next rejects it.
// VI: Đường dẫn con lúc build để chạy Flowie dưới site khác, ví dụ '/flowie'
// sau https://poc-dtd.bsr.com.vn/flowie. Để trống thì Flowie chạy ở gốc domain.
// Dấu '/' cuối bị bỏ vì Next không chấp nhận.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');

const nextConfig: NextConfig = {
   /* config options here */
   basePath,
   devIndicators: false,
   transpilePackages: ['thinking-orbs'],
   env: {
      NEXT_PUBLIC_BASE_PATH: basePath,
      NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ?? release.version,
      NEXT_PUBLIC_BUILD_REVISION: process.env.NEXT_PUBLIC_BUILD_REVISION ?? 'local',
      NEXT_PUBLIC_APP_RELEASED_AT: process.env.NEXT_PUBLIC_APP_RELEASED_AT ?? release.releasedAt,
      NEXT_PUBLIC_APP_HIGHLIGHTS: JSON.stringify(release.highlights),
      NEXT_PUBLIC_APP_RELEASE_NOTES: JSON.stringify(release.notes),
   },
};

export default nextConfig;
