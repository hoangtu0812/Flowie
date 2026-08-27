'use client';

import {
   imageMarkdown,
   imagesFromClipboard,
   insertAtCursor,
   uploadAttachment,
   type AttachmentEntityType,
} from '@/lib/attachments';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

interface UseImagePasteOptions {
   workspaceId?: string;
   entityType: AttachmentEntityType;
   entityId: string;
   /** Current text of the field being edited. */
   value: string;
   onChange: (value: string) => void;
}

/**
 * Pasting a screenshot into a plain-text field uploads it and drops the
 * markdown for it where the caret was, so the description and the comment box
 * both accept images without becoming rich-text editors.
 */
export function useImagePaste({
   workspaceId,
   entityType,
   entityId,
   value,
   onChange,
}: UseImagePasteOptions) {
   const [uploading, setUploading] = useState(false);
   // The caret has to be read before the upload awaits, and the value the
   // handler closed over goes stale while it runs — both are tracked here.
   const latestValue = useRef(value);
   latestValue.current = value;

   const onPaste = useCallback(
      (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
         const images = imagesFromClipboard(event.clipboardData);
         if (images.length === 0) return;
         event.preventDefault();
         if (!workspaceId) {
            toast.error('The workspace is still loading — try again in a moment.');
            return;
         }
         const textarea = event.currentTarget;
         const start = textarea.selectionStart ?? latestValue.current.length;
         const end = textarea.selectionEnd ?? start;
         setUploading(true);
         void (async () => {
            try {
               for (const image of images) {
                  const attachment = await uploadAttachment(
                     workspaceId,
                     entityType,
                     entityId,
                     image
                  );
                  // Re-reading the field each round keeps multi-image pastes in
                  // order instead of overwriting one another.
                  const current = latestValue.current;
                  const unchanged = current === value;
                  const next = insertAtCursor(
                     current,
                     unchanged ? start : current.length,
                     unchanged ? end : current.length,
                     imageMarkdown(attachment)
                  );
                  latestValue.current = next.value;
                  onChange(next.value);
               }
            } catch (caught) {
               toast.error(
                  caught instanceof Error ? caught.message : 'Could not upload the image.'
               );
            } finally {
               setUploading(false);
            }
         })();
      },
      [workspaceId, entityType, entityId, value, onChange]
   );

   return { onPaste, uploading };
}
