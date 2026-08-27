import { authenticatedFetch } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type AttachmentEntityType = 'issue' | 'comment' | 'project' | 'project-update' | 'document';

export type Attachment = {
   id: string;
   filename: string;
   mimeType: string;
   size: number;
};

/** Image types the API is willing to serve inline through the preview route. */
const INLINE_IMAGE_MIME_TYPES = new Set([
   'image/png',
   'image/jpeg',
   'image/gif',
   'image/webp',
   'image/avif',
]);

export const isEmbeddableImage = (mimeType: string) => INLINE_IMAGE_MIME_TYPES.has(mimeType);

export const attachmentPreviewUrl = (attachmentId: string) =>
   `${api}/attachments/${attachmentId}/preview`;

/**
 * Images pasted from a clipboard arrive without a name, so they are stamped
 * with the paste time — an issue ends up with "screenshot" three times over
 * otherwise, and the filename is what a download falls back to.
 */
export function imagesFromClipboard(clipboardData: DataTransfer | null): File[] {
   if (!clipboardData) return [];
   const files: File[] = [];
   for (const item of Array.from(clipboardData.items)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (!file || !isEmbeddableImage(file.type)) continue;
      files.push(
         file.name && file.name !== 'image.png'
            ? file
            : new File([file], `screenshot-${Date.now()}.${file.type.split('/')[1]}`, {
                 type: file.type,
              })
      );
   }
   return files;
}

export async function uploadAttachment(
   workspaceId: string,
   entityType: AttachmentEntityType,
   entityId: string,
   file: File
): Promise<Attachment> {
   const form = new FormData();
   form.append('workspaceId', workspaceId);
   form.append('entityType', entityType);
   form.append('entityId', entityId);
   form.append('file', file);
   const response = await authenticatedFetch(`${api}/attachments`, { method: 'POST', body: form });
   if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? 'Could not upload the image.');
   }
   return ((await response.json()) as { data: Attachment }).data;
}

/** Markdown an editor inserts for an uploaded image. */
export const imageMarkdown = (attachment: Attachment) =>
   `![${attachment.filename}](${attachmentPreviewUrl(attachment.id)})`;

/**
 * Replaces the selected range and leaves the caret after the inserted text, so
 * a paste behaves the way typing would.
 */
export function insertAtCursor(
   value: string,
   start: number,
   end: number,
   insertion: string
): { value: string; caret: number } {
   const prefix = value.slice(0, start);
   const suffix = value.slice(end);
   const separator = prefix && !prefix.endsWith('\n') ? '\n' : '';
   const next = `${prefix}${separator}${insertion}\n${suffix}`;
   return { value: next, caret: prefix.length + separator.length + insertion.length + 1 };
}
