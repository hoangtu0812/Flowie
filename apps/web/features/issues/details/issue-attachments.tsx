'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
   Download,
   ExternalLink,
   File as FileIcon,
   FileArchive,
   FileSpreadsheet,
   FileText,
   LayoutGrid,
   Link2,
   List,
   Paperclip,
   Plus,
   Trash2,
} from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
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
import { htmlPreviewPageUrl, SandboxedHtmlFrame } from '@/components/common/sandboxed-html-frame';
import { MarkdownEditor } from '@/components/common/markdown/markdown-editor';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { useLocale } from '@/features/shared/use-locale';
import type { useIssueAttachments } from '@/features/issues/use-issue-attachments';
import { attachmentPreviewUrl, isEmbeddableImage, type Attachment } from '@/lib/attachments';
import { attachmentPreviewKind } from '@/lib/attachment-url';
import { parseInstant } from '@/lib/time';
import { authenticatedFetch } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const downloadUrl = (attachment: Attachment) =>
   `${api}/attachments/${encodeURIComponent(attachment.id)}/download`;

function formatSize(bytes: number) {
   if (bytes < 1024) return `${bytes} B`;
   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
   return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function TypeIcon({
   attachment,
   className = 'size-8',
}: {
   attachment: Attachment;
   className?: string;
}) {
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
         className={`${className} ${
            name.endsWith('.pdf') ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
         }`}
      />
   );
}

type AttachmentView = 'grid' | 'list';
const VIEW_KEY = 'flowie.issueAttachments.view';

/**
 * Grid or list layout of the Attachments tab, remembered per browser in `localStorage`. Grid is
 * the default and is used whenever storage is empty, unreadable (private mode, blocked site data)
 * or holds an unknown value; a failed write keeps the choice for the current page only.
 * VI: Kiểu hiển thị lưới hoặc danh sách của tab Đính kèm, ghi nhớ theo trình duyệt trong
 * VI: `localStorage`. Mặc định là lưới, dùng khi storage trống, không đọc được (chế độ ẩn danh, chặn
 * VI: dữ liệu trang) hoặc chứa giá trị lạ; ghi lỗi thì lựa chọn chỉ giữ trong trang hiện tại.
 */
function useAttachmentView() {
   const [view, setView] = useState<AttachmentView>('grid');
   useEffect(() => {
      try {
         if (localStorage.getItem(VIEW_KEY) === 'list') setView('list');
      } catch {
         // Storage unavailable: keep the grid default. VI: Không có storage: giữ mặc định lưới.
      }
   }, []);
   const choose = (next: AttachmentView) => {
      setView(next);
      try {
         localStorage.setItem(VIEW_KEY, next);
      } catch {
         // Storage unavailable: the choice lasts for this page. VI: Không có storage: chỉ giữ trong trang.
      }
   };
   return [view, choose] as const;
}

/**
 * Attachments tab of an issue: a header with the file count, the Grid/List switch, New (a
 * Markdown document saved as a `.md` attachment) and Attach file, then the files as a grid of
 * cards or as a list of rows. The list shows the full file name (wrapped, never truncated), size,
 * upload date and uploader; the grid truncates the name and shows it in full on hover. In both
 * layouts images open the image viewer; Markdown, PDF, HTML, XLSX, CSV, DOCX and text files open a
 * preview dialog (`attachmentPreviewKind`); other files download; every file has the delete button
 * and the SharePoint link or copy error. The state comes from the parent so the tab label can show
 * the file count while this tab is closed.
 * VI: Tab tệp đính kèm của công việc: thanh đầu có số tệp, nút chuyển Lưới/Danh sách, nút Mới (tài
 * VI: liệu Markdown lưu thành tệp `.md`) và Đính kèm tệp, rồi các tệp dạng lưới thẻ hoặc danh sách
 * VI: dòng. Danh sách hiện đầy đủ tên tệp (xuống dòng, không cắt), dung lượng, ngày tải lên và người
 * VI: tải lên; lưới cắt tên và hiện đầy đủ khi rê chuột. Ở cả hai kiểu, ảnh mở trình xem ảnh; tệp
 * VI: Markdown, PDF, HTML, XLSX, CSV, DOCX và văn bản mở hộp thoại xem trước
 * VI: (`attachmentPreviewKind`); tệp khác tải xuống; tệp nào cũng có nút xoá và link SharePoint
 * VI: hoặc lỗi sao chép. State do component cha giữ để nhãn tab hiện được số tệp cả khi tab này
 * VI: đang đóng.
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
   const [view, setView] = useAttachmentView();
   const date = (attachment: Attachment) =>
      attachment.createdAt && parseInstant(attachment.createdAt).toLocaleDateString(tag);
   const remove = (attachment: Attachment) => {
      if (window.confirm(t('deleteAttachmentConfirm').replace('{name}', attachment.filename)))
         void state.remove(attachment);
   };
   // Opens the file the way its type allows: a preview dialog, or a download in a new tab. Images
   // return the children as they are, since their thumbnail opens the image viewer itself.
   // VI: Mở tệp theo cách loại tệp cho phép: hộp thoại xem trước, hoặc tải xuống ở tab mới. Ảnh trả
   // VI: nguyên children vì thumbnail của ảnh tự mở trình xem ảnh.
   const opener = (attachment: Attachment, className: string, children: ReactNode) =>
      isEmbeddableImage(attachment.mimeType) ? (
         children
      ) : attachmentPreviewKind(attachment.filename) ? (
         <button
            type="button"
            className={`${className} text-left`}
            onClick={() => setViewing(attachment)}
         >
            {children}
         </button>
      ) : (
         <a href={downloadUrl(attachment)} target="_blank" rel="noreferrer" className={className}>
            {children}
         </a>
      );
   const sharepoint = (attachment: Attachment, className: string) =>
      attachment.sharepoint?.webUrl ? (
         <a
            href={attachment.sharepoint.webUrl}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ${className}`}
         >
            <ExternalLink className="size-3" />
            {t('openInSharepoint')}
         </a>
      ) : attachment.sharepoint?.lastError ? (
         <span
            className={`block truncate text-xs text-destructive ${className}`}
            title={attachment.sharepoint.lastError}
         >
            {t('sharepointCopyFailed')}
         </span>
      ) : null;
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
            <HStack gap={2} wrap="wrap">
               <SegmentedControl
                  label={t('attachmentView')}
                  value={view}
                  onChange={(value) => setView(value as AttachmentView)}
                  size="sm"
               >
                  <SegmentedControlItem
                     value="grid"
                     label={t('gridView')}
                     icon={<LayoutGrid size={14} />}
                  />
                  <SegmentedControlItem
                     value="list"
                     label={t('listView')}
                     icon={<List size={14} />}
                  />
               </SegmentedControl>
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
         ) : view === 'list' ? (
            <ul
               aria-label={t('attachments')}
               className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70 bg-background"
            >
               {state.attachments.map((attachment) => (
                  <li key={attachment.id} className="flex items-start gap-3 px-3 py-2">
                     <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/40">
                        {isEmbeddableImage(attachment.mimeType) ? (
                           <AttachmentImage
                              src={attachmentPreviewUrl(attachment.id)}
                              alt={attachment.filename}
                              className="size-10 object-cover"
                           />
                        ) : (
                           <TypeIcon attachment={attachment} className="size-5" />
                        )}
                     </span>
                     <span className="block min-w-0 flex-1">
                        {opener(
                           attachment,
                           'block w-full break-words text-sm font-medium hover:underline',
                           attachment.filename
                        )}
                        <span className="block text-xs text-muted-foreground">
                           {[
                              formatSize(attachment.size),
                              date(attachment),
                              attachment.uploadedByName,
                           ]
                              .filter(Boolean)
                              .join(' · ')}
                        </span>
                        {sharepoint(attachment, 'pt-0.5')}
                     </span>
                     <button
                        type="button"
                        aria-label={`${t('deleteAttachment')} ${attachment.filename}`}
                        title={t('deleteAttachment')}
                        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-destructive"
                        onClick={() => remove(attachment)}
                     >
                        <Trash2 className="size-4" aria-hidden />
                     </button>
                  </li>
               ))}
            </ul>
         ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
               {state.attachments.map((attachment) => {
                  const image = isEmbeddableImage(attachment.mimeType);
                  const label = (
                     <span className="block min-w-0 px-3 py-2">
                        <span
                           className="block truncate text-sm font-medium"
                           title={attachment.filename}
                        >
                           {attachment.filename}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                           {[formatSize(attachment.size), date(attachment)]
                              .filter(Boolean)
                              .join(' · ')}
                        </span>
                     </span>
                  );
                  return (
                     <div
                        key={attachment.id}
                        className="group relative overflow-hidden rounded-lg border border-border/70 bg-background transition-colors hover:border-border"
                     >
                        <button
                           type="button"
                           aria-label={`${t('deleteAttachment')} ${attachment.filename}`}
                           title={t('deleteAttachment')}
                           className="absolute right-1.5 top-1.5 z-10 grid size-7 place-items-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                           onClick={() => remove(attachment)}
                        >
                           <Trash2 className="size-4" aria-hidden />
                        </button>
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
                        ) : (
                           opener(
                              attachment,
                              'block w-full',
                              <>
                                 <span className="grid h-28 place-items-center bg-muted/40">
                                    <TypeIcon attachment={attachment} />
                                 </span>
                                 {label}
                              </>
                           )
                        )}
                        {sharepoint(attachment, 'px-3 pb-2')}
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
            <AttachmentPreviewDialog attachment={viewing} onClose={() => setViewing(undefined)} />
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
 * Preview of an attachment the app can show (`attachmentPreviewKind`). The file is private and
 * the session cookie is SameSite=Lax, so it is fetched with the app's authenticated helper:
 * Markdown from the download route, rendered by react-markdown, which drops raw HTML; PDF from the
 * preview route into a blob URL for the browser's PDF viewer, revoked on close; an HTML file runs in
 * `SandboxedHtmlFrame` after a metadata request (which refreshes an expired session the iframe could
 * not refresh), with Open in new tab and Copy link pointing at the `/preview/{id}` page; every other
 * kind as the static page the preview route builds, placed in an iframe `srcdoc` with an empty
 * `sandbox`, which must never gain `allow-scripts` or `allow-same-origin` because `srcdoc` would
 * not get the API's CSP.
 * VI: Xem trước tệp đính kèm mà app hiển thị được (`attachmentPreviewKind`). Tệp là riêng tư và
 * VI: cookie phiên là SameSite=Lax, nên được tải bằng helper có xác thực của app: Markdown lấy từ
 * VI: route download, hiển thị bằng react-markdown vốn bỏ HTML thô; PDF lấy từ route preview thành
 * VI: blob URL cho trình xem PDF của trình duyệt, thu hồi khi đóng; tệp HTML chạy trong
 * VI: `SandboxedHtmlFrame` sau một request metadata (làm mới phiên hết hạn mà iframe không tự làm mới
 * VI: được), có nút Mở tab mới và Copy link trỏ tới trang `/preview/{id}`; các loại khác là trang
 * VI: tĩnh do route preview dựng, đặt trong iframe `srcdoc` có `sandbox` rỗng, không bao giờ được
 * VI: thêm `allow-scripts` hay `allow-same-origin` vì `srcdoc` không nhận CSP của API.
 */
function AttachmentPreviewDialog({
   attachment,
   onClose,
}: {
   attachment: Attachment;
   onClose: () => void;
}) {
   const { t } = useLocale();
   const kind = attachmentPreviewKind(attachment.filename);
   const [content, setContent] = useState<string>();
   const [failed, setFailed] = useState(false);
   const [copied, setCopied] = useState(false);
   useEffect(() => {
      let active = true;
      let objectUrl: string | undefined;
      setContent(undefined);
      setFailed(false);
      void authenticatedFetch(
         kind === 'markdown'
            ? downloadUrl(attachment)
            : kind === 'html'
              ? `${api}/attachments/${encodeURIComponent(attachment.id)}`
              : attachmentPreviewUrl(attachment.id)
      )
         .then(async (response) => {
            if (!response.ok) throw new Error(response.statusText);
            if (kind === 'html') {
               if (active) setContent('');
               return;
            }
            if (kind === 'pdf') {
               const blob = new Blob([await response.arrayBuffer()], { type: 'application/pdf' });
               objectUrl = URL.createObjectURL(blob);
               if (active) setContent(objectUrl);
               else URL.revokeObjectURL(objectUrl);
               return;
            }
            const text = await response.text();
            if (active) setContent(text);
         })
         .catch(() => active && setFailed(true));
      return () => {
         active = false;
         if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
   }, [attachment, kind]);
   return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
         <DialogContent
            className={`flex max-h-[90vh] flex-col ${kind === 'markdown' ? 'sm:max-w-3xl' : 'sm:max-w-5xl'}`}
         >
            <DialogHeader>
               <DialogTitle className="truncate">{attachment.filename}</DialogTitle>
            </DialogHeader>
            <div className="min-h-0 overflow-auto">
               {failed ? (
                  <Text role="alert">{t('couldNotLoadFile')}</Text>
               ) : content === undefined ? (
                  <div className="h-40 animate-pulse rounded-md bg-accent/50" />
               ) : kind === 'markdown' ? (
                  <MarkdownPreview content={content} documentMedia />
               ) : kind === 'html' ? (
                  <SandboxedHtmlFrame
                     attachmentId={attachment.id}
                     title={attachment.filename}
                     className="h-[70vh] w-full rounded-md border border-border bg-white"
                  />
               ) : kind === 'pdf' ? (
                  <iframe
                     src={content}
                     title={attachment.filename}
                     className="h-[70vh] w-full border-0"
                  />
               ) : (
                  <iframe
                     sandbox=""
                     srcDoc={content}
                     title={attachment.filename}
                     className="h-[70vh] w-full rounded-md border border-border bg-white"
                  />
               )}
            </div>
            <DialogFooter>
               {kind === 'html' && (
                  <>
                     <a
                        href={htmlPreviewPageUrl(attachment.id)}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1.5 text-sm hover:underline"
                     >
                        <ExternalLink className="size-4" aria-hidden />
                        {t('openInNewTab')}
                     </a>
                     <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-sm hover:underline"
                        onClick={() =>
                           void navigator.clipboard
                              .writeText(htmlPreviewPageUrl(attachment.id))
                              .then(() => setCopied(true))
                        }
                     >
                        <Link2 className="size-4" aria-hidden />
                        {t(copied ? 'linkCopied' : 'copyLink')}
                     </button>
                  </>
               )}
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
