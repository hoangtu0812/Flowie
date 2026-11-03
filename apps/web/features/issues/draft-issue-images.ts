import { attachmentPreviewUrl, type Attachment } from '@/lib/attachments';
import { imageReferences, removeImageReference } from '@/lib/markdown-images';

export type DraftIssueImage = { file: File; url: string; uploaded?: Attachment };

/**
 * Resolves uploaded clipboard references and removes pending local references before a server write.
 * An initial issue never persists a browser-only blob URL; retry can reuse successful attachments.
 * VI: Thay tham chiếu clipboard đã tải và bỏ tham chiếu cục bộ còn chờ trước khi ghi lên server.
 * Issue ban đầu không lưu blob URL chỉ có trong trình duyệt; retry dùng lại attachment đã thành công.
 */
export function draftDescriptionForServer(value: string, images: DraftIssueImage[]): string {
   let text = value;
   for (const image of images) {
      if (image.uploaded) {
         text = text.replaceAll(image.url, attachmentPreviewUrl(image.uploaded.id));
      } else {
         for (const reference of imageReferences(text).reverse())
            if (reference.src === image.url) text = removeImageReference(text, reference);
         text = text.replaceAll(image.url, '');
      }
   }
   return text.trim();
}
