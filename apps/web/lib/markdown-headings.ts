import { documentFrontMatter } from './document-front-matter';

/**
 * Anchor id for a heading: lowercase, accents removed, words joined by "-". Repeated
 * headings get "-2", "-3"… in order, matching the ids the preview assigns while rendering.
 * VI: Id neo cho heading: chữ thường, bỏ dấu, nối từ bằng "-". Heading lặp lại nhận "-2",
 * VI: "-3"… theo thứ tự, khớp với id phần preview gán khi hiển thị.
 */
export function createSlugger() {
   const seen = new Map<string, number>();
   return (text: string) => {
      const base =
         text
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .replace(/đ/gi, 'd')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'section';
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      return count === 1 ? base : `${base}-${count}`;
   };
}

/**
 * Level 1–3 ATX headings of a Markdown source with their anchor ids, skipping fenced code,
 * for a table of contents. Inline emphasis and code marks are dropped from the text.
 * VI: Các heading ATX cấp 1–3 của nguồn Markdown kèm id neo, bỏ qua code block, dùng cho
 * VI: mục lục. Ký hiệu nhấn mạnh và code trong dòng được bỏ khỏi văn bản.
 */
export function markdownHeadings(source: string) {
   const slug = createSlugger();
   const headings: { level: number; text: string; id: string }[] = [];
   let fence: string | null = null;
   for (const line of documentFrontMatter(source).body.split('\n')) {
      const marker = /^\s*(```|~~~)/.exec(line)?.[1];
      if (marker) {
         fence = fence === marker ? null : (fence ?? marker);
         continue;
      }
      const match = fence ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (!match) continue;
      const text = match[2].replace(/[*_`]/g, '').trim();
      const id = slug(text);
      if (match[1].length <= 3) headings.push({ level: match[1].length, text, id });
   }
   return headings;
}

/**
 * Index of the heading being read, for the table of contents highlight. `tops` are heading
 * positions in pixels from the top of the reading area, in document order; a heading counts as
 * reached once its top is at or above `line`. Before the first heading is reached the first one
 * is active. At the bottom of the area the last heading wins, because a short closing section
 * can never scroll up to `line`.
 * VI: Chỉ số heading đang đọc, dùng để tô sáng mục lục. `tops` là vị trí heading tính bằng pixel
 * VI: từ đỉnh vùng đọc, theo thứ tự tài liệu; một heading được coi là đã tới khi đỉnh của nó ở
 * VI: ngang hoặc trên `line`. Chưa tới heading nào thì heading đầu tiên được chọn. Ở cuối vùng
 * VI: đọc thì heading cuối được chọn, vì phần cuối ngắn không bao giờ cuộn lên tới `line`.
 */
export function activeHeadingIndex(tops: number[], line: number, atBottom: boolean): number {
   if (atBottom) return tops.length - 1;
   let index = 0;
   tops.forEach((top, position) => {
      if (top <= line) index = position;
   });
   return index;
}
