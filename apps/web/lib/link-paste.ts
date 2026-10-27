/**
 * Returns the URL when the clipboard holds exactly one http(s) link, so plain
 * text pastes and multi-word selections are left to the browser.
 * VI: Trả về URL khi clipboard chỉ chứa đúng một link http(s), để các lần dán
 * văn bản thường hoặc nhiều từ vẫn do trình duyệt xử lý.
 */
export function pastedUrl(text: string): string | undefined {
   // Leading whitespace would shift where the browser places the URL.
   // VI: Khoảng trắng đầu sẽ làm lệch vị trí trình duyệt chèn URL.
   const value = text.trimEnd();
   if (!/^https?:\/\/\S+$/i.test(value)) return undefined;
   try {
      return new URL(value).protocol.startsWith('http') ? value : undefined;
   } catch {
      return undefined;
   }
}

/**
 * Replaces the bare URL pasted at `start` with a titled Markdown link. Returns
 * undefined when the text moved or the URL already sits inside Markdown link
 * syntax, so a slow title lookup never rewrites what the user typed since.
 * VI: Thay URL trần được dán tại `start` bằng link Markdown có tiêu đề. Trả về
 * undefined khi văn bản đã đổi hoặc URL đã nằm trong cú pháp link Markdown, để
 * việc lấy tiêu đề chậm không ghi đè nội dung người dùng gõ sau đó.
 */
export function titledLink(
   value: string,
   start: number,
   url: string,
   title: string
): string | undefined {
   if (value.slice(start, start + url.length) !== url) return undefined;
   if (/[(<[]$/.test(value.slice(0, start))) return undefined;
   const label = title.replace(/[[\]\\]/g, '\\$&');
   return `${value.slice(0, start)}[${label}](${url})${value.slice(start + url.length)}`;
}
