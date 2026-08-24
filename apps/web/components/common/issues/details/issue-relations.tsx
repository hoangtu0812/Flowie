'use client';

import { Button } from '@/components/ui/button';
import { useIssueRelationDialogStore } from '@/store/issue-relation-dialog-store';
import { useIssuesStore } from '@/store/issues-store';
import { Link2, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type RelatedIssue = {
   id: string;
   identifier: string;
   title: string;
   status: { id: string; name: string; color: string; category: string };
   team: { id: string; name: string; identifier: string };
};

/** Original detail-area relation list, backed by the persisted IssueRelation API. */
export function IssueRelations({ issueId, orgId }: { issueId: string; orgId: string }) {
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const { openForIssue } = useIssueRelationDialogStore();
   const [relations, setRelations] = useState<RelatedIssue[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [savingId, setSavingId] = useState<string>();

   const load = useCallback(async () => {
      if (!workspaceId) return;
      const query = new URLSearchParams({ workspaceId });
      const response = await fetch(`${api}/issues/${issueId}/relations?${query}`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load related issues.');
      const payload = (await response.json()) as { data: RelatedIssue[] };
      setRelations(payload.data);
   }, [issueId, workspaceId]);

   useEffect(() => {
      if (!workspaceId) return;
      setState('loading');
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load, workspaceId]);

   useEffect(() => {
      const reload = (event: Event) => {
         const affected = (event as CustomEvent<{ issueIds?: string[] }>).detail?.issueIds ?? [];
         if (affected.includes(issueId)) void load().catch(() => setState('error'));
      };
      window.addEventListener('flowie:issue-relations-changed', reload);
      return () => window.removeEventListener('flowie:issue-relations-changed', reload);
   }, [issueId, load]);

   const unlink = async (relatedIssueId: string) => {
      if (!workspaceId) return;
      setSavingId(relatedIssueId);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(
            `${api}/issues/${issueId}/relations/${relatedIssueId}?${query}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not remove issue link.');
         await load();
         window.dispatchEvent(
            new CustomEvent('flowie:issue-relations-changed', {
               detail: { issueIds: [issueId, relatedIssueId] },
            })
         );
      } catch {
         setState('error');
      } finally {
         setSavingId(undefined);
      }
   };

   return (
      <section className="mt-8">
         <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Related issues</h2>
            <Button size="xs" variant="ghost" onClick={() => openForIssue(issueId)}>
               <Link2 /> Add link
            </Button>
         </div>
         {state === 'loading' && (
            <p className="mt-3 text-sm text-muted-foreground">Loading links…</p>
         )}
         {state === 'error' && (
            <p className="mt-3 text-sm text-destructive">Could not load issue links.</p>
         )}
         {state === 'ready' && relations.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">No related issues.</p>
         )}
         {state === 'ready' && relations.length > 0 && (
            <div className="mt-3 space-y-1">
               {relations.map((related) => (
                  <div
                     key={related.id}
                     className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                  >
                     <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: related.status.color }}
                     />
                     <Link
                        href={`/${orgId}/issue/${related.identifier}`}
                        className="min-w-0 truncate text-sm hover:underline"
                     >
                        <span className="mr-1.5 text-muted-foreground">{related.identifier}</span>
                        {related.title}
                     </Link>
                     <button
                        type="button"
                        className="ml-auto opacity-0 text-muted-foreground hover:text-foreground group-hover:opacity-100 disabled:opacity-50"
                        aria-label={`Remove link to ${related.identifier}`}
                        disabled={savingId === related.id}
                        onClick={() => void unlink(related.id)}
                     >
                        <X className="size-3.5" />
                     </button>
                  </div>
               ))}
            </div>
         )}
      </section>
   );
}
