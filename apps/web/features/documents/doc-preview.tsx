'use client';

import { useEffect, useState } from 'react';
import {
   BadgeCheck,
   CloudUpload,
   Download,
   ExternalLink,
   FileText,
   Pencil,
   Send,
   Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { TableOfContents } from '@/components/common/teams/markdown-document-editor';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';
import { attachmentPreviewUrl } from '@/lib/attachments';
import type { DocStatus, TreeFile } from '@/lib/document-tree';
import { parseInstant } from '@/lib/time';
import { authenticatedFetch } from '@/lib/workspaces';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import {
   loadRelease,
   loadReleases,
   type DocumentRelease,
   type ProjectTreeDocument,
} from './project-docs-api';
import { DocStatusBadge, DocTypeBadge } from './document-badges';

function PreviewHeader({
   children,
   actions,
}: {
   children: React.ReactNode;
   actions: React.ReactNode;
}) {
   return (
      <div className="flex min-h-11 items-center gap-2 border-b px-4 py-1.5">
         <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
         <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
   );
}

/**
 * Read-only view of a Markdown document beside the tree: title, type, status, the latest
 * approved release (vN), the SharePoint state, review buttons, a picker to read earlier
 * releases, table of contents and the rendered content (Mermaid included). Edit opens the
 * full editor, where revision history lives.
 * VI: Xem chỉ đọc tài liệu Markdown cạnh cây: tiêu đề, loại, trạng thái, phiên bản đã duyệt
 * VI: mới nhất (vN), trạng thái SharePoint, các nút duyệt, ô chọn để đọc các phiên bản trước,
 * VI: mục lục và nội dung đã render (gồm Mermaid). Nút Sửa mở editor đầy đủ, nơi có lịch sử
 * VI: phiên bản.
 */
export function DocumentPreview({
   document,
   publishing,
   onEdit,
   onStatusChange,
   onConfigureSharepoint,
}: {
   document: ProjectTreeDocument;
   /** The project publishes to SharePoint. VI: Dự án đang phát hành lên SharePoint. */
   publishing: boolean;
   onEdit: () => void;
   onStatusChange: (status: DocStatus) => void;
   onConfigureSharepoint: () => void;
}) {
   const tx = useMessages(messages);
   const locale = useUiPreferencesStore((state) => state.locale);
   const [releases, setReleases] = useState<DocumentRelease[]>([]);
   const [selected, setSelected] = useState('current');
   const [shown, setShown] = useState<DocumentRelease>();
   const [releaseError, setReleaseError] = useState(false);
   const when = (value: string) => parseInstant(value).toLocaleString(locale);

   // A different document, or a new approval, starts again from the current text.
   // VI: Đổi tài liệu, hoặc có lần duyệt mới, thì quay lại nội dung hiện tại.
   useEffect(() => {
      let active = true;
      setSelected('current');
      setReleases([]);
      if (document.release)
         void loadReleases(document.id)
            .then((page) => active && setReleases(page.items))
            .catch(() => active && setReleaseError(true));
      return () => {
         active = false;
      };
   }, [document.id, document.release]);
   useEffect(() => {
      let active = true;
      setShown(undefined);
      setReleaseError(false);
      if (selected !== 'current')
         void loadRelease(document.id, Number(selected))
            .then((release) => active && setShown(release))
            .catch(() => active && setReleaseError(true));
      return () => {
         active = false;
      };
   }, [document.id, selected]);

   const content = shown?.content ?? document.content;
   return (
      <div className="flex h-full min-h-0 flex-col">
         <PreviewHeader
            actions={
               <>
                  <ReviewActions document={document} onStatusChange={onStatusChange} />
                  <Button size="xs" variant="secondary" onClick={onEdit}>
                     <Pencil className="size-3.5" />
                     {tx('Edit')}
                  </Button>
               </>
            }
         >
            <span aria-hidden>{document.icon}</span>
            <h2 className="truncate text-sm font-medium">{document.title}</h2>
            <DocTypeBadge type={document.docType} />
            <DocStatusBadge status={document.status} />
            <span
               className="shrink-0 text-xs text-muted-foreground"
               title={tx('Latest approved version')}
            >
               {document.release ? `v${document.release}` : tx('Not released')}
            </span>
            <PublicationStatus
               document={document}
               publishing={publishing}
               onConfigure={onConfigureSharepoint}
            />
         </PreviewHeader>
         <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-3xl space-y-4 px-6 py-5">
               {releases.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                     <Select value={selected} onValueChange={setSelected}>
                        <SelectTrigger
                           className="h-7 w-auto gap-1 text-xs"
                           aria-label={tx('Approved versions')}
                        >
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="current">{tx('Current version')}</SelectItem>
                           {releases.map((release) => (
                              <SelectItem key={release.release} value={String(release.release)}>
                                 v{release.release} · {when(release.approvedAt)}
                                 {release.approvedBy.name ? ` · ${release.approvedBy.name}` : ''}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                     {shown && (
                        <span role="status">
                           {tx('Viewing v{value0}, approved {value1} by {value2}.', {
                              value0: String(shown.release),
                              value1: when(shown.approvedAt),
                              value2: shown.approvedBy.name ?? '—',
                           })}
                        </span>
                     )}
                     {releaseError && (
                        <span role="alert">{tx('Could not load this version.')}</span>
                     )}
                  </div>
               )}
               <TableOfContents content={content} label={tx('Contents')} />
               <MarkdownPreview content={content} />
            </div>
         </div>
      </div>
   );
}

/**
 * Review buttons in place of a status picker: Draft offers Submit for review, In review offers
 * Return to draft, and both offer Approve, which asks for a second click naming the release it
 * will create. Approved documents show no buttons; editing one returns it to Draft on the server.
 * VI: Các nút duyệt thay cho ô chọn trạng thái: Nháp có Gửi duyệt, Đang duyệt có Trả về nháp, và
 * VI: cả hai có Duyệt, cần bấm lần hai ghi rõ phiên bản sẽ tạo. Tài liệu Đã duyệt không có nút;
 * VI: sửa nó thì server tự đưa về Nháp.
 */
function ReviewActions({
   document,
   onStatusChange,
}: {
   document: ProjectTreeDocument;
   onStatusChange: (status: DocStatus) => void;
}) {
   const tx = useMessages(messages);
   const [confirming, setConfirming] = useState(false);
   useEffect(() => setConfirming(false), [document.id, document.version]);
   if (document.status === 'APPROVED') return null;
   if (confirming)
      return (
         <>
            <Button
               size="xs"
               onClick={() => {
                  setConfirming(false);
                  onStatusChange('APPROVED');
               }}
            >
               <BadgeCheck className="size-3.5" />
               {tx('Confirm approval v{value0}', { value0: String((document.release ?? 0) + 1) })}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
               {tx('Cancel')}
            </Button>
         </>
      );
   return (
      <>
         {document.status === 'IN_REVIEW' ? (
            <Button size="xs" variant="ghost" onClick={() => onStatusChange('DRAFT')}>
               <Undo2 className="size-3.5" />
               {tx('Return to draft')}
            </Button>
         ) : (
            <Button size="xs" variant="ghost" onClick={() => onStatusChange('IN_REVIEW')}>
               <Send className="size-3.5" />
               {tx('Submit for review')}
            </Button>
         )}
         <Button size="xs" variant="ghost" onClick={() => setConfirming(true)}>
            <BadgeCheck className="size-3.5" />
            {tx('Approve')}
         </Button>
      </>
   );
}

/**
 * SharePoint publishing state of the latest release: a link to the published file with its
 * version, "waiting" until the next publish run (about a minute), the last error, or — for a
 * released document of a project without SharePoint — a button that opens the folder settings.
 * VI: Trạng thái phát hành SharePoint của phiên bản mới nhất: link tới file đã phát hành kèm
 * VI: version, "đang chờ" cho tới lượt phát hành kế tiếp (khoảng một phút), lỗi gần nhất, hoặc —
 * VI: với tài liệu đã có phiên bản của dự án chưa có SharePoint — nút mở phần cấu hình thư mục.
 */
function PublicationStatus({
   document,
   publishing,
   onConfigure,
}: {
   document: ProjectTreeDocument;
   publishing: boolean;
   onConfigure: () => void;
}) {
   const tx = useMessages(messages);
   const publication = document.publication;
   if (publication?.lastError)
      return (
         <span
            className="truncate text-xs text-amber-700 dark:text-amber-300"
            title={publication.lastError}
         >
            {tx('Publishing failed: {value0}', { value0: publication.lastError })}
         </span>
      );
   if (!document.release) return null;
   if (publication?.webUrl && publication.release === document.release)
      return (
         <a
            href={publication.webUrl}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title={tx('Open in SharePoint')}
         >
            <ExternalLink className="size-3" />
            {tx('Published v{value0}', { value0: String(publication.release) })}
         </a>
      );
   if (!publishing)
      return (
         <button
            type="button"
            onClick={onConfigure}
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
         >
            <CloudUpload className="size-3" />
            {tx('SharePoint not set up')}
         </button>
      );
   return (
      <span className="shrink-0 text-xs text-muted-foreground">{tx('Waiting to publish')}</span>
   );
}

/**
 * PDF viewer beside the tree. The file is private and the session cookie is SameSite=Lax,
 * so the bytes are fetched with the app's authenticated helper and shown from a blob URL in
 * the browser's built-in PDF viewer; the URL is revoked when the file changes or closes.
 * VI: Trình xem PDF cạnh cây. File là riêng tư và cookie phiên là SameSite=Lax, nên dữ liệu
 * VI: được tải bằng helper có xác thực của app rồi hiển thị từ blob URL bằng trình xem PDF
 * VI: sẵn có của trình duyệt; URL được thu hồi khi đổi file hoặc đóng.
 */
export function PdfPreview({ file }: { file: TreeFile }) {
   const tx = useMessages(messages);
   const [url, setUrl] = useState<string>();
   const [failed, setFailed] = useState(false);

   useEffect(() => {
      let active = true;
      let objectUrl: string | undefined;
      setUrl(undefined);
      setFailed(false);
      void (async () => {
         try {
            const response = await authenticatedFetch(attachmentPreviewUrl(file.id));
            if (!response.ok) throw new Error(response.statusText);
            const blob = new Blob([await response.arrayBuffer()], { type: 'application/pdf' });
            objectUrl = URL.createObjectURL(blob);
            if (active) setUrl(objectUrl);
            else URL.revokeObjectURL(objectUrl);
         } catch {
            if (active) setFailed(true);
         }
      })();
      return () => {
         active = false;
         if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
   }, [file.id]);

   return (
      <div className="flex h-full min-h-0 flex-col">
         <PreviewHeader
            actions={
               url && (
                  <>
                     <Button size="xs" variant="ghost" asChild>
                        <a href={url} target="_blank" rel="noreferrer">
                           <ExternalLink className="size-3.5" />
                           {tx('Open in new tab')}
                        </a>
                     </Button>
                     <Button size="xs" variant="ghost" asChild>
                        <a href={url} download={file.filename}>
                           <Download className="size-3.5" />
                           {tx('Download')}
                        </a>
                     </Button>
                  </>
               )
            }
         >
            <FileText className="size-4 shrink-0 text-red-600 dark:text-red-400" />
            <h2 className="truncate text-sm font-medium">{file.filename}</h2>
         </PreviewHeader>
         {failed ? (
            <p className="p-6 text-sm text-muted-foreground">{tx('Could not load the file.')}</p>
         ) : url ? (
            <iframe src={url} title={file.filename} className="min-h-0 w-full flex-1 border-0" />
         ) : (
            <div className="m-6 h-64 animate-pulse rounded-md bg-accent/50" />
         )}
      </div>
   );
}

/** Placeholder before anything is selected. VI: Hiển thị khi chưa chọn gì. */
export function EmptyPreview() {
   const tx = useMessages(messages);
   return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
         {tx('Select a document or PDF to preview it here.')}
      </div>
   );
}
