'use client';

import { useEffect, useRef, useState } from 'react';
import {
   Download,
   File as FileIcon,
   FileArchive,
   FileSpreadsheet,
   FileText,
   Paperclip,
   Plus,
} from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { AttachmentImage } from '@/components/common/attachment-image';
import { MarkdownEditor } from '@/components/common/markdown/markdown-editor';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { useLocale } from '@/features/shared/use-locale';
import type { useIssueAttachments } from '@/features/issues/use-issue-attachments';
import { attachmentPreviewUrl, isEmbeddableImage, type Attachment } from '@/lib/attachments';
import { parseInstant } from '@/lib/time';
import { authenticatedFetch } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const downloadUrl = (attachment: Attachment) =>
   `${api}/attachments/${encodeURIComponent(attachment.id)}/download`;
const isMarkdown = (attachment: Attachment) => /\.(md|markdown)$/i.test(attachment.filename);

function formatSize(bytes: number) {
   if (bytes < 1024) return `${bytes} B`;
   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
   return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function TypeIcon({ attachment }: { attachment: Attachment }) {
   const name = attachment.filename.toLowerCase();
   const Icon = /\.(zip|rar|7z|gz|tar)$/.test(name)
      ? FileArchive
      : /\.(csv|xlsx?|ods)$/.test(name)
        ? FileSpreadsheet
        : /\.(md|markdown|txt|docx?|pdf|log|json)$/.test(name)
          ? FileText
          : FileIcon;
   return (
      <Icon
         aria-hidden
         className={
            name.endsWith('.pdf')
               ? 'size-8 text-red-600 dark:text-red-400'
               : 'size-8 text-muted-foreground'
         }
      />
   );
}

/**
 * Attachments tab of an issue: a header with the file count, New (a Markdown document saved as
 * a `.md` attachment) and Attach file, then a grid of cards. Images show a thumbnail that opens
 * the image viewer, `.md` files open a rendered preview, other files download. The state comes
 * from the parent so the tab label can show the file count while this tab is closed.
 * VI: Tab tệp đính kèm của công việc: thanh đầu có số tệp, nút Mới (tài liệu Markdown lưu thành
 * VI: tệp `.md`) và Đính kèm tệp, rồi lưới thẻ tệp. Ảnh có thumbnail mở trình xem ảnh, tệp `.md`
 * VI: mở bản xem đã hiển thị, tệp khác tải xuống. State do component cha giữ để nhãn tab hiện
 * VI: được số tệp cả khi tab này đang đóng.
 */
export function IssueAttachments({
   workspaceId,
   state,
}: {
   workspaceId?: string;
   state: ReturnType<typeof useIssueAttachments>;
}) {
   const { t, tag } = useLocale();
   const picker = useRef<HTMLInputElement>(null);
   const [creating, setCreating] = useState(false);
   const [viewing, setViewing] = useState<Attachment>();
   return (
      <VStack gap={4} className="min-w-0">
         <input
            ref={picker}
            type="file"
            multiple
            hidden
            aria-label="Select files to attach"
            onChange={(event) => {
               void state.upload(event.target.files);
               event.target.value = '';
            }}
         />
         <HStack justify="between" vAlign="center" gap={2} wrap="wrap">
            <Text type="supporting">
               {state.attachments.length}{' '}
               {t(state.attachments.length === 1 ? 'fileCount' : 'filesCount')}
            </Text>
            <HStack gap={2}>
               <Button
                  label={t('newDocument')}
                  icon={<Plus className="size-4" />}
                  size="sm"
                  variant="secondary"
                  onClick={() => setCreating(true)}
                  isDisabled={!workspaceId}
               />
               <Button
                  label={t('attachFile')}
                  icon={<Paperclip className="size-4" />}
                  size="sm"
                  variant="secondary"
                  onClick={() => picker.current?.click()}
                  isDisabled={!workspaceId}
                  isLoading={state.uploading}
               />
            </HStack>
         </HStack>
         {state.error && <Text role="alert">{state.error}</Text>}
         {state.attachments.length === 0 && !state.error ? (
            <div className="grid h-32 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
               {t('noAttachments')}
            </div>
         ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
               {state.attachments.map((attachment) => {
                  const image = isEmbeddableImage(attachment.mimeType);
                  const meta = [
                     formatSize(attachment.size),
                     attachment.createdAt &&
                        parseInstant(attachment.createdAt).toLocaleDateString(tag),
                  ]
                     .filter(Boolean)
                     .join(' · ');
                  const label = (
                     <span className="block min-w-0 px-3 py-2">
                        <span
                           className="block truncate text-sm font-medium"
                           title={attachment.filename}
                        >
                           {attachment.filename}
                        </span>
                        <span className="block text-xs text-muted-foreground">{meta}</span>
                     </span>
                  );
                  return (
                     <div
                        key={attachment.id}
                        className="overflow-hidden rounded-lg border border-border/70 bg-background transition-colors hover:border-border"
                     >
                        {image ? (
                           <>
                              <div className="grid h-28 place-items-center overflow-hidden bg-muted/40">
                                 <AttachmentImage
                                    src={attachmentPreviewUrl(attachment.id)}
                                    alt={attachment.filename}
                                    className="h-28 w-full object-cover"
                                 />
                              </div>
                              {label}
                           </>
                        ) : isMarkdown(attachment) ? (
                           <button
                              type="button"
                              className="block w-full text-left"
                              onClick={() => setViewing(attachment)}
                           >
                              <span className="grid h-28 place-items-center bg-muted/40">
                                 <TypeIcon attachment={attachment} />
                              </span>
                              {label}
                           </button>
                        ) : (
                           <a
                              href={downloadUrl(attachment)}
                              target="_blank"
                              rel="noreferrer"
                              className="block"
                           >
                              <span className="grid h-28 place-items-center bg-muted/40">
                                 <TypeIcon attachment={attachment} />
                              </span>
                              {label}
                           </a>
                        )}
                     </div>
                  );
               })}
            </div>
         )}
         {creating && (
            <NewMarkdownDialog
               onClose={() => setCreating(false)}
               onSave={(file) => state.upload([file])}
               uploading={state.uploading}
               error={state.error}
            />
         )}
         {viewing && (
            <MarkdownAttachmentDialog attachment={viewing} onClose={() => setViewing(undefined)} />
         )}
      </VStack>
   );
}

/**
 * Writes a Markdown document and stores it as `<name>.md` through the normal attachment upload,
 * so it gets the same access checks and size limit as any other file. The dialog stays open
 * with the text intact when saving fails.
 * VI: Soạn tài liệu Markdown và lưu thành `<tên>.md` qua luồng tải đính kèm thông thường, nên có
 * VI: cùng kiểm tra quyền và giới hạn dung lượng như tệp khác. Lưu lỗi thì hộp thoại vẫn mở và
 * VI: giữ nguyên nội dung.
 */
function NewMarkdownDialog({
   onClose,
   onSave,
   uploading,
   error,
}: {
   onClose: () => void;
   onSave: (file: File) => Promise<boolean>;
   uploading: boolean;
   error?: string;
}) {
   const { t } = useLocale();
   const [name, setName] = useState('');
   const [content, setContent] = useState('');
   const [invalid, setInvalid] = useState(false);
   const save = async () => {
      const base = name.trim().replace(/\.(md|markdown)$/i, '');
      if (!base || !content.trim()) {
         setInvalid(true);
         return;
      }
      const file = new File([content], `${base}.md`, { type: 'text/markdown' });
      if (await onSave(file)) onClose();
   };
   return (
      <Dialog open onOpenChange={(open) => !open && !uploading && onClose()}>
         <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-5xl">
            <DialogHeader>
               <DialogTitle>{t('newMarkdownDocument')}</DialogTitle>
            </DialogHeader>
            <VStack gap={3} className="min-h-0 overflow-auto">
               <TextInput label={t('fileName')} value={name} onChange={setName} isRequired />
               <MarkdownEditor value={content} onChange={setContent} />
               {invalid && <Text role="alert">{t('markdownNeedsContent')}</Text>}
               {error && <Text role="alert">{error}</Text>}
            </VStack>
            <DialogFooter>
               <Button
                  label={t('cancel')}
                  variant="secondary"
                  onClick={onClose}
                  isDisabled={uploading}
               />
               <Button
                  label={t('save')}
                  variant="primary"
                  clickAction={save}
                  isLoading={uploading}
               />
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/**
 * Rendered view of a `.md` attachment. The file is private, so its text is fetched with the
 * app's authenticated helper; react-markdown drops raw HTML, so the file cannot run scripts.
 * VI: Bản xem đã hiển thị của tệp `.md`. Tệp là riêng tư nên nội dung được tải bằng helper có xác
 * VI: thực của app; react-markdown bỏ HTML thô nên tệp không chạy được script.
 */
function MarkdownAttachmentDialog({
   attachment,
   onClose,
}: {
   attachment: Attachment;
   onClose: () => void;
}) {
   const { t } = useLocale();
   const [content, setContent] = useState<string>();
   const [failed, setFailed] = useState(false);
   useEffect(() => {
      let active = true;
      setContent(undefined);
      setFailed(false);
      void authenticatedFetch(downloadUrl(attachment))
         .then(async (response) => {
            if (!response.ok) throw new Error(response.statusText);
            const text = await response.text();
            if (active) setContent(text);
         })
         .catch(() => active && setFailed(true));
      return () => {
         active = false;
      };
   }, [attachment]);
   return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
         <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
            <DialogHeader>
               <DialogTitle className="truncate">{attachment.filename}</DialogTitle>
            </DialogHeader>
            <div className="min-h-0 overflow-auto">
               {failed ? (
                  <Text role="alert">{t('couldNotLoadFile')}</Text>
               ) : content === undefined ? (
                  <div className="h-40 animate-pulse rounded-md bg-accent/50" />
               ) : (
                  <MarkdownPreview content={content} />
               )}
            </div>
            <DialogFooter>
               <a
                  href={downloadUrl(attachment)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm hover:underline"
               >
                  <Download className="size-4" aria-hidden />
                  {t('download')}
               </a>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
