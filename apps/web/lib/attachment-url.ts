const PREVIEW_PATH = /\/api\/v1\/attachments\/([A-Za-z0-9_-]+)\/preview$/;

/**
 * Returns the attachment id of a Flowie preview link, whatever host or base
 * path it was written with. Descriptions and comments store absolute links, so
 * links pasted before a domain or sub-path move (for example
 * `https://flowie.dtd.bsr.com.vn/api/v1/...` read from
 * `https://poc-dtd.bsr.com.vn/flowie`) must still resolve to the current API.
 * Only the path decides; a match inside a query string or fragment does not
 * count. Returns undefined for any other image URL.
 * VI: Trả về id đính kèm của link preview Flowie, bất kể host hay base path lúc
 * ghi. Mô tả và comment lưu link tuyệt đối, nên link dán trước khi đổi domain
 * hoặc sub-path (ví dụ `https://flowie.dtd.bsr.com.vn/api/v1/...` khi đọc từ
 * `https://poc-dtd.bsr.com.vn/flowie`) vẫn phải trỏ về API hiện tại. Chỉ xét
 * path; khớp trong query hoặc fragment không tính. Ảnh khác trả về undefined.
 */
export function attachmentIdFromUrl(src: string): string | undefined {
   let pathname: string;
   try {
      pathname = new URL(src, 'http://relative.invalid').pathname;
   } catch {
      return undefined;
   }
   return PREVIEW_PATH.exec(pathname)?.[1];
}

/**
 * How the attachment dialog previews a file, chosen by extension; null means the file only
 * downloads. `markdown` is rendered by the app, `pdf` is shown by the browser's PDF viewer from a
 * blob URL, and `page` is an HTML page the API's preview route builds (HTML as written, XLSX and
 * CSV as tables, DOCX converted, text escaped), shown in a sandboxed iframe that cannot run script.
 * VI: Cách hộp thoại đính kèm xem trước một tệp, chọn theo đuôi tệp; null là tệp chỉ tải xuống.
 * VI: `markdown` do app hiển thị, `pdf` do trình xem PDF của trình duyệt mở từ blob URL, còn `page`
 * VI: là trang HTML do route preview của API dựng (HTML giữ nguyên, XLSX và CSV thành bảng, DOCX
 * VI: được chuyển đổi, văn bản được escape), hiển thị trong iframe sandbox không chạy được script.
 */
export function attachmentPreviewKind(filename: string): 'markdown' | 'pdf' | 'page' | null {
   const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1].toLowerCase() ?? '';
   if (extension === 'md' || extension === 'markdown') return 'markdown';
   if (extension === 'pdf') return 'pdf';
   return ['html', 'htm', 'xlsx', 'xlsm', 'csv', 'docx', 'txt', 'log', 'json'].includes(extension)
      ? 'page'
      : null;
}
