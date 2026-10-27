'use client';

import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';
import { useIssuesStore } from '@/store/issues-store';
import { authenticatedFetch } from '@/lib/workspaces';
import { Ban } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { IssueRefRow } from './content-blocks';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type RelatedIssue = {
   id: string;
   identifier: string;
   title: string;
   relationKind: 'RELATED' | 'BLOCKS' | 'BLOCKED_BY';
};

/**
 * "Blocked by" and "Related" sections of the properties sidebar, backed by perspective-aware
 * relation data. Each section renders only when it has entries.
 * VI: Mục "Bị chặn bởi" và "Liên quan" của sidebar thuộc tính, dựa trên dữ liệu quan hệ theo góc
 * VI: nhìn của issue hiện tại. Mỗi mục chỉ hiển thị khi có dữ liệu.
 */
export function IssueRelations({ issueId }: { issueId: string }) {
   const tx = useMessages(messages);
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const [relations, setRelations] = useState<RelatedIssue[]>([]);

   const load = useCallback(async () => {
      if (!workspaceId) return;
      const query = new URLSearchParams({ workspaceId });
      const response = await authenticatedFetch(`${api}/issues/${issueId}/relations?${query}`);
      if (!response.ok) throw new Error('Could not load related issues.');
      const payload = (await response.json()) as { data: RelatedIssue[] };
      setRelations(payload.data);
   }, [issueId, workspaceId]);

   useEffect(() => {
      if (!workspaceId) return;
      void load().catch(() => setRelations([]));
   }, [load, workspaceId]);

   useEffect(() => {
      const reload = (event: Event) => {
         const affected = (event as CustomEvent<{ issueIds?: string[] }>).detail?.issueIds ?? [];
         if (affected.includes(issueId)) void load().catch(() => setRelations([]));
      };
      window.addEventListener('flowie:issue-relations-changed', reload);
      return () => window.removeEventListener('flowie:issue-relations-changed', reload);
   }, [issueId, load]);

   const blockedBy = relations.filter((relation) => relation.relationKind === 'BLOCKED_BY');
   const related = relations.filter((relation) => relation.relationKind === 'RELATED');

   return (
      <>
         {blockedBy.length > 0 && (
            <div>
               <h3 className="text-xs font-medium text-muted-foreground mb-2">{tx('Blocked by')}</h3>
               <div className="flex flex-col">
                  {blockedBy.map((relation) => (
                     <div key={relation.id} className="flex items-center gap-1.5 min-w-0">
                        <Ban className="size-3.5 text-red-500 shrink-0" />
                        <IssueRefRow identifier={relation.identifier} title={relation.title} />
                     </div>
                  ))}
               </div>
            </div>
         )}

         {related.length > 0 && (
            <div>
               <h3 className="text-xs font-medium text-muted-foreground mb-2">{tx('Related')}</h3>
               <div className="flex flex-col">
                  {related.map((relation) => (
                     <IssueRefRow
                        key={relation.id}
                        identifier={relation.identifier}
                        title={relation.title}
                     />
                  ))}
               </div>
            </div>
         )}
      </>
   );
}
