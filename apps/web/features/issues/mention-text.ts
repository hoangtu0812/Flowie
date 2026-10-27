/**
 * Matches an `@query` the author is typing at the end of the draft.
 * shortcut: only the end of the draft is checked, not the caret position; editing a mention in
 * the middle of the text opens no suggestions. Track the textarea caret if that becomes common.
 * VI: Khớp `@từ-khoá` mà người viết đang gõ ở cuối bản nháp. Chỉ kiểm tra cuối bản nháp chứ
 * VI: không theo vị trí con trỏ; sửa mention ở giữa văn bản sẽ không hiện gợi ý.
 */
export function trailingMentionQuery(draft: string): string | null {
   return /(^|\s)@([^\s@]{0,30})$/.exec(draft)?.[2] ?? null;
}

/** Case- and accent-insensitive key, so "@tu" finds "Từ". */
/** VI: Khoá không phân biệt hoa thường và dấu, để "@tu" tìm được "Từ". */
export function mentionSearchKey(value: string): string {
   return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
}

/**
 * Replaces the trailing `@query` with `@Name `, or appends the mention when nothing is being
 * typed (picker selection), keeping a single space before it.
 * VI: Thay `@từ-khoá` ở cuối bằng `@Tên `, hoặc nối thêm mention khi không gõ dở (chọn từ bộ
 * VI: chọn), giữ đúng một dấu cách phía trước.
 */
export function insertMention(draft: string, name: string): string {
   const mention = `@${name} `;
   if (trailingMentionQuery(draft) !== null) return draft.replace(/@[^\s@]{0,30}$/, mention);
   return `${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}${mention}`;
}

export type MentionPart = string | { mention: string };

/**
 * Splits rendered comment text into plain runs and `@Name` mentions of the given names, so the
 * comment can highlight exactly the members it notified. Longer names win when one name starts
 * another ("@Tu" vs "@Tu Pham"); a match needs a non-word character (or nothing) on both sides,
 * so e-mail addresses and "@Tuan" for "Tu" stay plain. Without names the text comes back whole.
 * VI: Tách nội dung comment thành đoạn chữ thường và mention `@Tên` theo danh sách tên, để
 * VI: comment highlight đúng những thành viên đã được thông báo. Tên dài hơn được ưu tiên khi
 * VI: một tên là phần đầu của tên khác ("@Tu" và "@Tu Pham"); hai bên mention phải là ký tự
 * VI: không thuộc từ (hoặc đầu/cuối chuỗi), nên email và "@Tuan" với tên "Tu" vẫn là chữ thường.
 * VI: Không có tên nào thì trả nguyên văn bản.
 */
export function splitMentions(text: string, names: string[]): MentionPart[] {
   const unique = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
   if (!unique.length) return [text];
   const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_@])@(${unique.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}_])`,
      'gu'
   );
   const parts: MentionPart[] = [];
   let last = 0;
   for (const match of text.matchAll(pattern)) {
      const start = match.index + match[1].length;
      if (start > last) parts.push(text.slice(last, start));
      parts.push({ mention: `@${match[2]}` });
      last = start + match[2].length + 1;
   }
   if (last < text.length) parts.push(text.slice(last));
   return parts;
}
