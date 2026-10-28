'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { LiveDocument } from '@/components/common/teams/use-live-team';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';
import { DocStatusBadge, DocTypeBadge } from './document-badges';
import { loadIssueDocuments } from './project-docs-api';

/**
 * Documents linked to the issue (for example its FDS/TDS), each opening the document page.
 * Renders nothing while loading, on error or when no document is linked.
 * VI: Tài liệu liên kết với issue (ví dụ FDS/TDS), mỗi mục mở trang tài liệu. Không hiển thị
 * VI: gì khi đang tải, khi lỗi hoặc khi chưa có tài liệu liên kết.
 */
export function IssueDocuments({ issueId }: { issueId: string }) {
   const tx = useMessages(messages);
   const { orgId } = useParams<{ orgId: string }>();
   const [documents, setDocuments] = useState<LiveDocument[]>([]);

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

   if (!documents.length) return null;
   return (
      <section aria-label={tx('Related documents')} className="space-y-1">
         <h2 className="text-xs font-medium text-muted-foreground">{tx('Related documents')}</h2>
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
