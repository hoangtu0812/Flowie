'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MarkdownDocumentEditor } from '@/components/common/teams/markdown-document-editor';
import type { LiveDocument } from '@/components/common/teams/use-live-team';
import { getDocument, documentRequest } from './document-api';
import { QueryState } from '@/components/common/query-state';
import { LoadingState } from '@/components/common/loading-state';
export function DocumentPage() {
   const tx = useMessages(messages);

   const { documentId, orgId } = useParams<{ documentId: string; orgId: string }>();
   const router = useRouter();
   const [document, setDocument] = useState<LiveDocument>(),
      [error, setError] = useState<string>(),
      [refresh, setRefresh] = useState(0);
   useEffect(() => {
      let active = true;
      setDocument(undefined);
      setError(undefined);
      void getDocument(documentId)
         .then((item) => {
            if (active) setDocument(item);
         })
         .catch((reason) => {
            if (active) setError(reason.message);
         });
      return () => {
         active = false;
      };
   }, [documentId, orgId, refresh]);
   if (error) return <QueryState message={error} onRetry={() => setRefresh((n) => n + 1)} />;
   if (!document) return <LoadingState label={tx('Loading document…')} />;
   return (
      <MarkdownDocumentEditor
         document={document}
         open
         onOpenChange={(open) => {
            if (!open) router.push(`/${orgId}/search`);
         }}
         onUpdate={async (id, draft) => {
            const updated = await documentRequest<LiveDocument>(id, '', {
               method: 'PATCH',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify(draft),
            });
            setDocument(updated);
            return updated;
         }}
      />
   );
}
