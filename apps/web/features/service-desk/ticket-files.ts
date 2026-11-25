// Matches MAX_ATTACHMENT_BYTES in the API, so a file that would fail is caught before the ticket exists.
// VI: Bằng MAX_ATTACHMENT_BYTES của API, để file chắc chắn lỗi bị chặn trước khi tạo ticket.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Files pasted from the clipboard. Text copied from Word or Excel also carries a picture of itself,
 * so a paste with text is left alone. Screenshots all arrive as "image.png", so each gets its own name.
 * VI: Tệp dán từ clipboard. Chữ chép từ Word hay Excel cũng kèm ảnh của chính nó, nên lần dán có chữ
 * VI: được để nguyên. Ảnh chụp màn hình đều tên "image.png", nên mỗi ảnh được đặt tên riêng.
 */
export function pastedFiles(event: {
   clipboardData: Pick<DataTransfer, 'files' | 'getData'>;
}): File[] {
   if (event.clipboardData.getData('text/plain')) return [];
   const stamp = Date.now();
   return Array.from(event.clipboardData.files).map((file, index) =>
      file.type.startsWith('image/')
         ? new File(
              [file],
              `screenshot-${stamp}-${index + 1}.${file.type.split('/')[1] || 'png'}`,
              {
                 type: file.type,
              }
           )
         : file
   );
}

export const fileSize = (bytes: number) =>
   bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
