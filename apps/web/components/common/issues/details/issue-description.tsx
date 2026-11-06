'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { DraftImages } from '@/components/common/markdown/draft-images';
import { useImagePaste } from '@/hooks/use-image-paste';
import { attachmentPreviewUrl, uploadAttachment } from '@/lib/attachments';
import { imageReferences, removeImageReference } from '@/lib/markdown-images';
import { Issue } from '@/mock-data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useModifierKey } from '@/features/shared/use-modifier-key';
import { SubmissionGate } from '@/features/shared/submission-gate';

// Load the shared Rich Text/Markdown editor only when editing starts, keeping Tiptap out of the
// issue page bundle; it is client-only because ProseMirror needs the DOM.
// VI: Chỉ tải editor Rich Text/Markdown dùng chung khi bắt đầu sửa để Tiptap không vào bundle
// VI: trang issue; editor chỉ chạy ở client vì ProseMirror cần DOM.
const DescriptionEditor = dynamic(
   () => import('@/features/issues/description-editor').then((module) => module.DescriptionEditor),
   { ssr: false }
);

/**
 * Issue description: rendered Markdown with an edit button, or an editor that saves only on an
 * explicit Save (button or Ctrl/⌘+Enter), like a comment; there is no autosave. Esc leaves the
 * editor only while the draft is unchanged, so a stray key never drops typed text; Cancel discards
 * it. The draft lives here and survives tab switches because the Overview tab stays mounted.
 * Editing uses the shared Create issue editor (Rich Text, Markdown, Preview); Markdown stays the
 * stored format.
 * VI: Mô tả issue: Markdown đã hiển thị kèm nút sửa, hoặc ô soạn chỉ lưu khi bấm Save (nút hoặc
 * VI: Ctrl/⌘+Enter), giống bình luận; không tự động lưu. Esc chỉ thoát khi bản nháp chưa đổi, để
 * VI: lỡ tay bấm phím không làm mất nội dung đã gõ; Cancel mới bỏ bản nháp. Bản nháp nằm ở đây và
 * VI: còn nguyên khi đổi tab vì tab Overview luôn được giữ mount. Khi sửa dùng editor chung của
 * VI: Create issue (Rich Text, Markdown, Preview); Markdown vẫn là định dạng lưu.
 */
export function IssueDescription({ issue }: { issue: Issue }) {
   const tx = useMessages(messages);

   const update = useIssuesStore((state) => state.updateIssueDescription);
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState(issue.description);
   const [saving, setSaving] = useState(false);
   const [pendingImages, setPendingImages] = useState(0);
   const [error, setError] = useState<string>();
   const gate = useRef(new SubmissionGate());
   const modifier = useModifierKey();
   const identity = useRef(issue.id);
   const scope = useMemo(() => ({ id: issue.id }), [issue.id]);
   const currentScope = useRef(scope);
   currentScope.current = scope;
   // Only titles a lone pasted link in Markdown mode; images go through stageImages below.
   // VI: Chỉ đặt tiêu đề cho link dán đơn lẻ ở chế độ Markdown; ảnh đi qua stageImages bên dưới.
   const { onPaste } = useImagePaste({
      workspaceId,
      entityType: 'issue',
      entityId: issue.id,
      value: draft,
      onChange: setDraft,
   });
   useEffect(() => {
      if (identity.current !== issue.id) {
         identity.current = issue.id;
         setDraft(issue.description);
         setEditing(false);
         setError(undefined);
         setSaving(false);
         setPendingImages(0);
         gate.current = new SubmissionGate();
      }
   }, [issue.id, issue.description]);
   useEffect(() => {
      if (!editing) setDraft(issue.description);
   }, [issue.description, editing]);
   const uploading = pendingImages > 0;
   /**
    * Shows each pasted image at once through a local object URL, which the editor inserts at the
    * caret in either mode, and uploads it to this issue in the background. A finished upload swaps
    * the object URL for the attachment preview URL; a failed one removes the local reference. Save
    * stays locked while any upload runs, so a browser-only blob URL is never written to the server.
    * Results for a previous issue are dropped by the scope check.
    * VI: Hiện ngay từng ảnh dán bằng object URL cục bộ, editor chèn tại con trỏ ở cả hai chế độ,
    * VI: và upload nền vào chính issue này. Upload xong thì thay object URL bằng URL preview của
    * VI: attachment; lỗi thì gỡ tham chiếu cục bộ. Save bị khóa khi còn upload, nên blob URL chỉ có
    * VI: trong trình duyệt không bao giờ được ghi lên server. Kết quả của issue trước bị bỏ qua.
    */
   const stageImages = (files: File[]) => {
      if (!workspaceId) {
         toast.error(tx('The workspace is still loading — try again in a moment.'));
         return [];
      }
      const own = scope;
      return files.map((file) => {
         const url = URL.createObjectURL(file);
         setPendingImages((count) => count + 1);
         void uploadAttachment(workspaceId, 'issue', issue.id, file)
            .then((attachment) => {
               if (currentScope.current === own)
                  setDraft((text) => text.replaceAll(url, attachmentPreviewUrl(attachment.id)));
            })
            .catch((caught) => {
               if (currentScope.current !== own) return;
               setDraft((text) =>
                  imageReferences(text)
                     .reverse()
                     .filter((reference) => reference.src === url)
                     .reduce(removeImageReference, text)
               );
               toast.error(
                  caught instanceof Error ? caught.message : tx('Could not upload the image.')
               );
            })
            .finally(() => {
               URL.revokeObjectURL(url);
               if (currentScope.current === own) setPendingImages((count) => count - 1);
            });
         return { url, name: file.name.replace(/[\[\]\\]/g, '') };
      });
   };
   const save = () =>
      gate.current.run(async () => {
         if (uploading) return;
         setSaving(true);
         setError(undefined);
         try {
            if (draft !== issue.description) await update(issue.id, draft);
            if (currentScope.current === scope) setEditing(false);
         } catch (reason) {
            if (currentScope.current === scope)
               setError(
                  reason instanceof Error ? reason.message : tx('Could not save description.')
               );
         } finally {
            if (currentScope.current === scope) setSaving(false);
         }
      });
   return (
      <VStack
         gap={3}
         paddingBlock={0}
         className="min-w-0"
         onKeyDown={(event) => {
            if (!editing || event.nativeEvent.isComposing || saving) return;
            if (event.key === 'Escape' && draft === issue.description) setEditing(false);
         }}
         onKeyDownCapture={(event) => {
            // Ctrl/⌘+Enter saves before the Rich Text editor sees it; ProseMirror would otherwise
            // insert a hard break into the draft first.
            // VI: Ctrl/⌘+Enter lưu trước khi editor Rich Text nhận phím; nếu không ProseMirror sẽ
            // VI: chèn một hard break vào bản nháp trước.
            if (!editing || event.nativeEvent.isComposing) return;
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
               event.preventDefault();
               event.stopPropagation();
               if (!saving) void save();
            }
         }}
      >
         {editing ? (
            <VStack
               gap={3}
               padding={3}
               role="group"
               aria-label={tx('Issue description')}
               className="min-w-0 rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring"
            >
               <DescriptionEditor
                  value={draft}
                  onChange={setDraft}
                  isDisabled={saving}
                  onImages={stageImages}
                  onTextPaste={onPaste}
               />
               <DraftImages
                  value={draft}
                  onChange={setDraft}
                  label={tx('Images in this description')}
                  removeLabel={tx('Remove image')}
                  isDisabled={saving || uploading}
               />
               {error && <Text role="alert">{error}</Text>}
               <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                  <Text type="supporting">
                     {uploading
                        ? tx('Uploading image…')
                        : `${modifier}+Enter to save · paste to add an image`}
                  </Text>
                  <HStack gap={2} className="ml-auto">
                     <Button
                        label={tx('Cancel')}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                           setDraft(issue.description);
                           setEditing(false);
                        }}
                        isDisabled={saving}
                     />
                     <Button
                        label={tx('Save')}
                        variant="primary"
                        size="sm"
                        clickAction={save}
                        isLoading={saving}
                        isDisabled={uploading}
                     />
                  </HStack>
               </HStack>
            </VStack>
         ) : (
            <HStack gap={2} vAlign="start" className="min-w-0">
               <VStack className="min-w-0 flex-1">
                  {issue.description.trim() ? (
                     <MarkdownPreview content={issue.description} appearance="issue" />
                  ) : (
                     <Text type="supporting">{tx('No description yet.')}</Text>
                  )}
               </VStack>
               <Button
                  label={tx('Edit description')}
                  tooltip={tx('Edit description')}
                  icon={<Pencil className="size-4" />}
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
               />
            </HStack>
         )}
      </VStack>
   );
}
