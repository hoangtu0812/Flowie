/**
 * Toolbar actions of the Markdown editor.
 * VI: Các thao tác trên thanh công cụ của trình soạn Markdown.
 */
export type MarkdownAction =
   | 'bold'
   | 'italic'
   | 'strike'
   | 'code'
   | 'codeBlock'
   | 'quote'
   | 'bullet'
   | 'ordered'
   | 'link'
   | 'image'
   | `h${1 | 2 | 3 | 4 | 5 | 6}`;

/**
 * Replace `value.slice(from, to)` with `text`, then select
 * `[selectionStart, selectionEnd)` in the resulting string.
 * VI: Thay `value.slice(from, to)` bằng `text`, rồi chọn
 * VI: `[selectionStart, selectionEnd)` trong chuỗi kết quả.
 */
export type MarkdownEdit = {
   from: number;
   to: number;
   text: string;
   selectionStart: number;
   selectionEnd: number;
};

const LIST_PREFIX = /^([-*+]|\d+\.)\s+/;

/**
 * Wraps the selection in `marker`, or unwraps it when the selection (or the text right
 * around it) is already wrapped, so pressing a button twice restores the original text.
 * An empty selection inserts the pair of markers with the caret between them.
 * VI: Bọc vùng chọn bằng `marker`, hoặc bỏ bọc khi vùng chọn (hoặc chữ ngay sát hai bên)
 * VI: đã được bọc, nên bấm nút hai lần trả lại văn bản ban đầu. Vùng chọn rỗng thì chèn cặp
 * VI: marker và đặt con trỏ ở giữa.
 */
function wrap(value: string, start: number, end: number, marker: string): MarkdownEdit {
   const selected = value.slice(start, end);
   const size = marker.length;
   if (selected.length >= size * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
      const text = selected.slice(size, -size);
      return {
         from: start,
         to: end,
         text,
         selectionStart: start,
         selectionEnd: start + text.length,
      };
   }
   if (value.slice(start - size, start) === marker && value.slice(end, end + size) === marker) {
      return {
         from: start - size,
         to: end + size,
         text: selected,
         selectionStart: start - size,
         selectionEnd: end - size,
      };
   }
   return {
      from: start,
      to: end,
      text: `${marker}${selected}${marker}`,
      selectionStart: start + size,
      selectionEnd: end + size,
   };
}

/**
 * Applies a prefix to every line the selection touches. When every target line already
 * matches `active`, the prefix is removed instead (toggle off). `strip` removes a competing
 * prefix first, so H1 becomes H2 and a bullet becomes a numbered item rather than stacking.
 * Blank lines inside a multi-line selection are left untouched and not numbered.
 * VI: Thêm tiền tố cho mọi dòng mà vùng chọn chạm tới. Khi mọi dòng đích đã khớp `active` thì
 * VI: gỡ tiền tố (bật/tắt). `strip` gỡ tiền tố khác trước, nên H1 thành H2 và gạch đầu dòng
 * VI: thành số thứ tự thay vì chồng lên nhau. Dòng trống trong vùng chọn nhiều dòng được giữ
 * VI: nguyên và không được đánh số.
 */
function prefixLines(
   value: string,
   start: number,
   end: number,
   active: RegExp,
   strip: RegExp,
   prefix: (index: number) => string
): MarkdownEdit {
   // A selection ending right after a newline does not include the next line.
   // VI: Vùng chọn kết thúc ngay sau ký tự xuống dòng thì không tính dòng kế tiếp.
   const last = end > start && value[end - 1] === '\n' ? end - 1 : end;
   const from = value.lastIndexOf('\n', start - 1) + 1;
   const newline = value.indexOf('\n', last);
   const to = newline === -1 ? value.length : newline;
   const lines = value.slice(from, to).split('\n');
   const hasText = lines.some((line) => line.trim());
   const targets = lines.map((line) => !hasText || Boolean(line.trim()));
   const off = lines.every((line, index) => !targets[index] || active.test(line));
   let count = 0;
   const text = lines
      .map((line, index) => {
         if (!targets[index]) return line;
         const bare = line.replace(strip, '');
         return off ? bare : prefix(count++) + bare;
      })
      .join('\n');
   // One untouched line keeps the caret at its end; several lines stay selected as a block.
   // VI: Một dòng thì đặt con trỏ ở cuối dòng; nhiều dòng thì giữ chọn cả khối.
   const selectionEnd = from + text.length;
   return {
      from,
      to,
      text,
      selectionStart: lines.length > 1 ? from : selectionEnd,
      selectionEnd,
   };
}

/**
 * Computes the edit a toolbar action makes to `value` for the selection `[start, end)`.
 * The caller applies it to the textarea so the browser keeps it in the undo history.
 * VI: Tính thay đổi mà một thao tác toolbar tạo ra trên `value` với vùng chọn `[start, end)`.
 * VI: Nơi gọi áp thay đổi vào textarea để trình duyệt giữ nó trong lịch sử hoàn tác.
 */
export function formatMarkdown(
   value: string,
   start: number,
   end: number,
   action: MarkdownAction
): MarkdownEdit {
   const selected = value.slice(start, end);
   switch (action) {
      case 'bold':
         return wrap(value, start, end, '**');
      case 'italic':
         return wrap(value, start, end, '_');
      case 'strike':
         return wrap(value, start, end, '~~');
      case 'code':
         return wrap(value, start, end, '`');
      case 'quote':
         return prefixLines(value, start, end, /^>\s?/, /^>\s?/, () => '> ');
      case 'bullet':
         return prefixLines(value, start, end, /^[-*+]\s+/, LIST_PREFIX, () => '- ');
      case 'ordered':
         return prefixLines(
            value,
            start,
            end,
            /^\d+\.\s+/,
            LIST_PREFIX,
            (index) => `${index + 1}. `
         );
      case 'codeBlock': {
         // Fences must sit on their own lines, so break the line around a mid-line selection.
         // VI: Hàng rào ``` phải nằm trên dòng riêng, nên ngắt dòng quanh vùng chọn giữa dòng.
         const before = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
         const after = end < value.length && value[end] !== '\n' ? '\n' : '';
         const open = `${before}\`\`\`\n`;
         return {
            from: start,
            to: end,
            text: `${open}${selected}\n\`\`\`${after}`,
            selectionStart: start + open.length,
            selectionEnd: start + open.length + selected.length,
         };
      }
      case 'link':
      case 'image': {
         // With a label, select the URL placeholder; without one, put the caret in the label.
         // VI: Có nhãn thì chọn sẵn chữ url; chưa có nhãn thì đặt con trỏ vào nhãn.
         const open = action === 'image' ? '![' : '[';
         const text = `${open}${selected}](url)`;
         const label = start + open.length;
         return selected
            ? {
                 from: start,
                 to: end,
                 text,
                 selectionStart: label + selected.length + 2,
                 selectionEnd: label + selected.length + 5,
              }
            : { from: start, to: end, text, selectionStart: label, selectionEnd: label };
      }
      default: {
         const level = Number(action.slice(1));
         return prefixLines(
            value,
            start,
            end,
            new RegExp(`^#{${level}}\\s+`),
            /^#{1,6}\s+/,
            () => `${'#'.repeat(level)} `
         );
      }
   }
}
