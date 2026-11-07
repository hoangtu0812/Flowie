import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

/**
 * Release identity is read from CHANGELOG.md at build time so the running app
 * can name its own version. The changelog is the single source: a release that
 * is not written down there cannot be shown, which is the point — it makes a
 * forgotten changelog entry visible inside the product instead of silent.
 *
 * Everything this file needs lives in this file. `next start` transpiles the
 * config to next.config.compiled.js and requires it with plain Node, which
 * resolves neither `.ts` files nor this app's path aliases, and the deployed
 * image carries no TypeScript toolchain to help it. A local import therefore
 * works in a checkout and throws MODULE_NOT_FOUND in the container, taking the
 * whole site down with it. Code shared with the rest of the app is exported
 * from here instead of imported into here; tests/next-config-runtime.test.ts
 * fails if a relative import ever appears above.
 *
 * VI: Mọi thứ tệp này cần đều nằm trong chính tệp này. `next start` biên dịch
 * config thành next.config.compiled.js rồi require bằng Node thuần, vốn không
 * phân giải tệp `.ts` lẫn path alias của app, và image đã triển khai cũng không
 * mang theo bộ công cụ TypeScript nào để giúp. Vì vậy một import tương đối chạy
 * tốt trong bản checkout nhưng ném MODULE_NOT_FOUND trong container và kéo sập
 * cả trang. Phần dùng chung với phần còn lại của app được export ra từ đây chứ
 * không import vào đây; tests/next-config-runtime.test.ts sẽ fail nếu phía trên
 * xuất hiện một import tương đối.
 */
export type ReleaseNote = { en: string; vi: string };

export type Release = {
   version: string;
   releasedAt: string;
   highlights: ReleaseNote[];
   notes: ReleaseNote[];
};

const RELEASE_HEADING = /^## \[(\d+\.\d+\.\d+)\]\s*[—-]\s*(.+?)\s*$/;
const VIETNAMESE_LINE = /^VI:\s*/;

/**
 * Trailing `(DTD-491, #170, 431edd6)`, in any combination of task, pull request
 * and commit. Only a parenthesis whose whole content is references is removed,
 * so a sentence that genuinely ends in brackets keeps them.
 * VI: Phần `(DTD-491, #170, 431edd6)` ở cuối, với bất kỳ tổ hợp task, pull
 * request và commit. Chỉ xoá ngoặc mà toàn bộ nội dung là tham chiếu, nên câu
 * thực sự kết thúc bằng ngoặc vẫn được giữ.
 */
const REFERENCES =
   /\s*\((?:DTD-\d+|#\d+|[0-9a-f]{7,40})(?:\s*,\s*(?:DTD-\d+|#\d+|[0-9a-f]{7,40}))*\)\s*$/;

function withoutReferences(text: string): string {
   return text.replace(REFERENCES, '').trim();
}

/** One menu line: no markdown ticks, cut on a word boundary. */
function shorten(bullet: string, limit = 72): string {
   const text = bullet
      .replace(/`/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[;,.]$/, '')
      .trim();
   if (text.length <= limit) return text;
   const cut = text.slice(0, limit);
   const boundary = cut.lastIndexOf(' ');
   return `${(boundary > 40 ? cut.slice(0, boundary) : cut).replace(/[;,.]$/, '')}…`;
}

/**
 * The topmost released section of the changelog, or empty values when the file
 * names no release yet. Unreleased work is deliberately invisible: a change is
 * only announced once a release commit has promoted it under a version heading.
 *
 * Each entry is an English sentence followed by an indented `VI:` line with the
 * same meaning, and ends with its task, pull request and merge commit. Both
 * languages are kept apart so a screen can show the one its reader asked for,
 * and the references are dropped because they address developers, not the
 * person reading the dialog.
 *
 * Exported for tests/changelog-release.test.ts: what a bullet ends up looking
 * like is what users read, so it needs tests even though it lives in a config.
 *
 * VI: Mục đã phát hành trên cùng của changelog, hoặc giá trị rỗng khi tệp chưa
 * có bản phát hành nào. Phần Unreleased cố ý không hiển thị: một thay đổi chỉ
 * được thông báo sau khi commit release đưa nó vào dưới một heading phiên bản.
 *
 * Mỗi mục gồm một câu tiếng Anh, theo sau là dòng `VI:` thụt đầu mang cùng ý
 * nghĩa, và kết thúc bằng task, pull request và merge commit. Hai thứ tiếng được
 * giữ riêng để mỗi màn hình hiện đúng thứ tiếng người đọc chọn, và phần tham
 * chiếu bị bỏ vì nó dành cho người phát triển, không dành cho người đang đọc.
 *
 * Được export cho tests/changelog-release.test.ts: hình dạng cuối cùng của một
 * dòng chính là thứ user đọc, nên cần test dù nó nằm trong một tệp cấu hình.
 */
export function releaseFromChangelog(markdown: string): Release {
   const empty: Release = { version: '', releasedAt: '', highlights: [], notes: [] };
   const lines = markdown.split(/\r?\n/);
   const start = lines.findIndex((line) => RELEASE_HEADING.test(line));
   if (start === -1) return empty;
   const [, version, releasedAt] = RELEASE_HEADING.exec(lines[start]) as RegExpExecArray;

   // A bullet is its first line plus every indented line that follows it. An
   // indented `VI:` line switches which language the rest of the bullet
   // continues, so a wrapped Vietnamese sentence never lands in the English one.
   // VI: Một dòng gồm dòng đầu của nó cộng mọi dòng thụt đầu phía sau. Dòng
   // `VI:` thụt đầu chuyển ngôn ngữ mà phần còn lại của bullet tiếp tục, nên
   // câu tiếng Việt bị ngắt dòng không bao giờ lọt vào câu tiếng Anh.
   const notes: ReleaseNote[] = [];
   let target: keyof ReleaseNote = 'en';
   for (const line of lines.slice(start + 1)) {
      if (line.startsWith('## ')) break;
      if (line.startsWith('- ')) {
         notes.push({ en: line.slice(2).trim(), vi: '' });
         target = 'en';
      } else if (notes.length > 0 && /^\s+\S/.test(line)) {
         const text = line.trim();
         const note = notes[notes.length - 1];
         if (VIETNAMESE_LINE.test(text)) {
            target = 'vi';
            note.vi = text.replace(VIETNAMESE_LINE, '');
         } else note[target] = `${note[target]} ${text}`.trim();
      }
   }

   const clean = notes.map(({ en, vi }) => ({
      en: withoutReferences(en),
      vi: withoutReferences(vi),
   }));
   return {
      version,
      releasedAt,
      highlights: clean.slice(0, 4).map(({ en, vi }) => ({ en: shorten(en), vi: shorten(vi) })),
      notes: clean,
   };
}

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
