'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, Link2, TriangleAlert } from 'lucide-react';
import { FlowieLogo } from '@/components/brand/flowie-logo';
import { htmlPreviewPageUrl, SandboxedHtmlFrame } from '@/components/common/sandboxed-html-frame';
import { useLocale } from '@/features/shared/use-locale';
import { attachmentPreviewKind } from '@/lib/attachment-url';
import { authenticatedFetch } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type PreviewAttachment = { id: string; filename: string; uploadedByName: string | null };

/**
 * Shareable page for an uploaded HTML file: a fixed Flowie header (file name, uploader, a warning
 * not to enter passwords, Download, Copy link) above the file running in `SandboxedHtmlFrame`. The
 * API redirects every non-iframe request for the raw file here, so the file never fills a tab on
 * its own and cannot pose as a Flowie page (phishing). The metadata request checks access and
 * refreshes an expired session before the iframe loads; a missing or forbidden file shows an error.
 * VI: Trang chia sẻ được cho tệp HTML được tải lên: header Flowie cố định (tên tệp, người tải lên,
 * VI: cảnh báo không nhập mật khẩu, Tải xuống, Copy link) phía trên tệp đang chạy trong
 * VI: `SandboxedHtmlFrame`. API chuyển mọi request không phải iframe tới tệp thô về đây, nên tệp
 * VI: không bao giờ tự chiếm trọn tab và không giả được trang Flowie (chống phishing). Request
 * VI: metadata kiểm quyền và làm mới phiên hết hạn trước khi iframe tải; tệp không có hoặc không
 * VI: được phép xem thì hiện lỗi.
 */
export default function HtmlPreviewPage() {
   const { attachmentId } = useParams<{ attachmentId: string }>();
   const { t } = useLocale();
   const [attachment, setAttachment] = useState<PreviewAttachment>();
   const [failed, setFailed] = useState(false);
   const [copied, setCopied] = useState(false);
   useEffect(() => {
      void authenticatedFetch(`${api}/attachments/${encodeURIComponent(attachmentId)}`)
         .then(async (response) => {
            if (!response.ok) throw new Error(response.statusText);
            const data = ((await response.json()) as { data: PreviewAttachment }).data;
            if (attachmentPreviewKind(data.filename) !== 'html') throw new Error('Not HTML');
            setAttachment(data);
            document.title = `${data.filename} · Flowie`;
         })
         .catch(() => setFailed(true));
   }, [attachmentId]);
   return (
      <main className="flex h-svh flex-col bg-background">
         <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
            <FlowieLogo />
            <div className="min-w-0 flex-1">
               <h1 className="truncate text-sm font-semibold">{attachment?.filename ?? '…'}</h1>
               {attachment?.uploadedByName && (
                  <p className="truncate text-xs text-muted-foreground">
                     {t('uploadedBy')}: {attachment.uploadedByName}
                  </p>
               )}
            </div>
            <p
               role="note"
               className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
            >
               <TriangleAlert className="size-4 shrink-0" aria-hidden />
               {t('userContentWarning')}
            </p>
            {attachment && (
               <div className="flex items-center gap-3">
                  <a
                     href={`${api}/attachments/${encodeURIComponent(attachment.id)}/download`}
                     className="inline-flex items-center gap-1.5 text-sm hover:underline"
                  >
                     <Download className="size-4" aria-hidden />
                     {t('download')}
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
               </div>
            )}
         </header>
         {failed ? (
            <p role="alert" className="p-6 text-sm">
               {t('couldNotLoadFile')}
            </p>
         ) : attachment ? (
            <SandboxedHtmlFrame
               attachmentId={attachment.id}
               title={attachment.filename}
               className="min-h-0 w-full flex-1 border-0 bg-white"
            />
         ) : (
            <div className="m-6 h-40 animate-pulse rounded-md bg-accent/50" />
         )}
      </main>
   );
}
