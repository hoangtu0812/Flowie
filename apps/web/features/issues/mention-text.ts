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
