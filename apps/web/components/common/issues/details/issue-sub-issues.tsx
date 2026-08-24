'use client';

import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useIssuesStore } from '@/store/issues-store';
import { CheckSquare, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type SubIssue = {
   id: string;
   identifier: string;
   title: string;
   status: { id: string; name: string; color: string; category: string };
};

/** Original Issue-detail sub-issue area backed by a parent-child Issue relationship. */
export function IssueSubIssues({
   issueId,
   teamId,
   orgId,
}: {
   issueId: string;
   teamId: string;
   orgId: string;
}) {
   const { workspaceId, loadIssues } = useIssuesStore();
   const [subIssues, setSubIssues] = useState<SubIssue[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [dialogOpen, setDialogOpen] = useState(false);
   const [title, setTitle] = useState('');
   const [description, setDescription] = useState('');
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   const load = useCallback(async () => {
      if (!workspaceId) return;
      const query = new URLSearchParams({ workspaceId });
      const response = await fetch(`${api}/issues/${issueId}/sub-issues?${query}`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load sub-issues.');
      const payload = (await response.json()) as { data: SubIssue[] };
      setSubIssues(payload.data);
   }, [issueId, workspaceId]);

   useEffect(() => {
      if (!workspaceId) return;
      setState('loading');
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load, workspaceId]);

   const createSubIssue = async () => {
      if (!workspaceId || title.trim().length < 2) return;
      setSaving(true);
      setError(undefined);
      try {
         const response = await fetch(`${api}/issues`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               teamId,
               parentIssueId: issueId,
               title: title.trim(),
               description: description.trim() || undefined,
            }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not create sub-issue.');
         }
         await Promise.all([load(), loadIssues()]);
         setDialogOpen(false);
         setTitle('');
         setDescription('');
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not create sub-issue.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <section className="mt-6">
         <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Sub-issues</h2>
            <Button size="xs" variant="ghost" onClick={() => setDialogOpen(true)}>
               <Plus /> New sub-issue
            </Button>
         </div>
         {state === 'loading' && (
            <p className="mt-3 text-sm text-muted-foreground">Loading sub-issues…</p>
         )}
         {state === 'error' && (
            <p className="mt-3 text-sm text-destructive">Could not load sub-issues.</p>
         )}
         {state === 'ready' && subIssues.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">No sub-issues.</p>
         )}
         {state === 'ready' && subIssues.length > 0 && (
            <div className="mt-3 space-y-1">
               {subIssues.map((subIssue) => (
                  <Link
                     key={subIssue.id}
                     href={`/${orgId}/issue/${subIssue.identifier}`}
                     className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                     <CheckSquare className="size-3.5 text-muted-foreground" />
                     <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: subIssue.status.color }}
                     />
                     <span className="shrink-0 text-muted-foreground">{subIssue.identifier}</span>
                     <span className="min-w-0 truncate">{subIssue.title}</span>
                  </Link>
               ))}
            </div>
         )}

         <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-[480px]">
               <DialogHeader>
                  <DialogTitle>New sub-issue</DialogTitle>
                  <DialogDescription>Create an issue under this parent issue.</DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={title}
                     onChange={(event) => setTitle(event.target.value)}
                     placeholder="Sub-issue title"
                     autoFocus
                  />
                  <Textarea
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     placeholder="Description (optional)"
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
               </div>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                     Cancel
                  </Button>
                  <Button
                     onClick={() => void createSubIssue()}
                     disabled={saving || title.trim().length < 2}
                  >
                     {saving ? 'Creating…' : 'Create sub-issue'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </section>
   );
}
