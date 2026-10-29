'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { useParams } from 'next/navigation';
import type { LiveDocument } from '@/components/common/teams/use-live-team';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';
import { DocStatusBadge, DocTypeBadge } from './document-badges';
import { loadIssueDocuments } from './project-docs-api';

/**
 * Documents linked to the issue (for example its FDS/TDS), each opening the document page.
 * A project task without a linked FDS or TDS shows a warning with a link to the project's
 * Docs tab (the agreed "warn first" level; nothing is blocked). Renders nothing while
 * loading or on error, and nothing for a task outside a project with no documents.
 * VI: Tài liệu liên kết với issue (ví dụ FDS/TDS), mỗi mục mở trang tài liệu. Task thuộc dự
 * VI: án mà chưa liên kết FDS hoặc TDS sẽ hiện cảnh báo kèm link tới tab Docs của dự án (mức
 * VI: "cảnh báo trước" đã thống nhất; không chặn gì). Không hiển thị khi đang tải hoặc lỗi,
 * VI: và không hiển thị với task ngoài dự án chưa có tài liệu.
 */
export function IssueDocuments({ issueId, projectId }: { issueId: string; projectId?: string }) {
   const tx = useMessages(messages);
   const { orgId } = useParams<{ orgId: string }>();
   const [documents, setDocuments] = useState<LiveDocument[]>();

   useEffect(() => {
      let current = true;
      void loadIssueDocuments(issueId)
         .then((items) => {
            if (current) setDocuments(items);
         })
         .catch(() => undefined);
      return () => {
         current = false;
      };
   }, [issueId]);

   if (!documents) return null;
   const missingSpec =
      projectId && !documents.some((document) => ['FDS', 'TDS'].includes(document.docType ?? ''));
   if (!documents.length && !missingSpec) return null;
   return (
      <section aria-label={tx('Related documents')} className="space-y-1">
         <h2 className="text-xs font-medium text-muted-foreground">{tx('Related documents')}</h2>
         {missingSpec && (
            <p className="flex items-center gap-1.5 px-2 text-xs text-amber-700 dark:text-amber-300">
               <TriangleAlert className="size-3.5 shrink-0" />
               {tx('This task has no FDS/TDS yet.')}
               <Link href={`/${orgId}/project/${projectId}/docs`} className="underline">
                  {tx('Open Docs')}
               </Link>
            </p>
         )}
         <ul className="space-y-0.5">
            {documents.map((document) => (
               <li key={document.id}>
                  <Link
                     href={`/${orgId}/documents/${document.id}`}
                     className="flex h-8 items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60"
                  >
                     <span aria-hidden="true">{document.icon}</span>
                     <span className="min-w-0 flex-1 truncate">{document.title}</span>
                     <DocTypeBadge type={document.docType} />
                     <DocStatusBadge status={document.status} />
                  </Link>
               </li>
            ))}
         </ul>
      </section>
   );
}
