/**
 * Reads the release the product should name after itself out of CHANGELOG.md.
 *
 * The changelog is the single source for release identity, so this parser is
 * what users actually read in the Help menu and in the announcement dialog. It
 * is a pure function over the file's text, separate from next.config, so the
 * shape of a bullet can be unit tested instead of being discovered in
 * production.
 *
 * Each entry is an English sentence followed by an indented `VI:` line with the
 * same meaning, and ends with its task, pull request and merge commit, as in
 * `(DTD-487, #169, b019c3f5)`. Both languages are kept apart so a screen can
 * show the one its reader asked for, and the references are dropped because
 * they address developers, not the person reading the dialog.
 *
 * VI: Đọc bản phát hành mà sản phẩm dùng để tự giới thiệu từ CHANGELOG.md.
 *
 * Changelog là nguồn duy nhất cho thông tin phiên bản, nên hàm phân tích này
 * chính là thứ user đọc trong menu Help và trong hộp thoại thông báo. Nó là hàm
 * thuần trên nội dung tệp, tách khỏi next.config, để hình dạng của một dòng
 * được unit test thay vì bị phát hiện trên production.
 *
 * Mỗi mục gồm một câu tiếng Anh, theo sau là dòng `VI:` thụt đầu mang cùng ý
 * nghĩa, và kết thúc bằng task, pull request và merge commit, ví dụ
 * `(DTD-487, #169, b019c3f5)`. Hai thứ tiếng được giữ riêng để mỗi màn hình
 * hiện đúng thứ tiếng người đọc chọn, và phần tham chiếu bị bỏ vì nó dành cho
 * người phát triển, không dành cho người đang đọc hộp thoại.
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
 * VI: Mục đã phát hành trên cùng của changelog, hoặc giá trị rỗng khi tệp chưa
 * có bản phát hành nào. Phần Unreleased cố ý không hiển thị: một thay đổi chỉ
 * được thông báo sau khi commit release đưa nó vào dưới một heading phiên bản.
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
