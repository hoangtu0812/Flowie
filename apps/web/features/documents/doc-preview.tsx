'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { TableOfContents } from '@/components/common/teams/markdown-document-editor';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';
import { attachmentPreviewUrl } from '@/lib/attachments';
import type { TreeFile } from '@/lib/document-tree';
import { authenticatedFetch } from '@/lib/workspaces';
import type { ProjectTreeDocument } from './project-docs-api';
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
 * Read-only view of a Markdown document beside the tree: title, type and status, table of
 * contents and the rendered content (Mermaid included). Edit opens the full editor.
 * VI: Xem chỉ đọc tài liệu Markdown cạnh cây: tiêu đề, loại và trạng thái, mục lục và nội
 * VI: dung đã render (gồm Mermaid). Nút Sửa mở editor đầy đủ.
 */
export function DocumentPreview({
   document,
   onEdit,
}: {
   document: ProjectTreeDocument;
   onEdit: () => void;
}) {
   const tx = useMessages(messages);
   return (
      <div className="flex h-full min-h-0 flex-col">
         <PreviewHeader
            actions={
               <Button size="xs" variant="secondary" onClick={onEdit}>
                  <Pencil className="size-3.5" />
                  {tx('Edit')}
               </Button>
            }
         >
            <span aria-hidden>{document.icon}</span>
            <h2 className="truncate text-sm font-medium">{document.title}</h2>
            <DocTypeBadge type={document.docType} />
            <DocStatusBadge status={document.status} />
         </PreviewHeader>
         <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-3xl space-y-4 px-6 py-5">
               <TableOfContents content={document.content} label={tx('Contents')} />
               <MarkdownPreview content={document.content} />
            </div>
         </div>
      </div>
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
