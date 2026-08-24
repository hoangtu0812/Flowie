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
import { useIssueRelationDialogStore } from '@/store/issue-relation-dialog-store';
import { useIssuesStore } from '@/store/issues-store';
import { Link2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Global dialog that makes the original “Add link…” issue menu action persisted. */
export function IssueRelationDialog() {
   const { open, issueId, close } = useIssueRelationDialogStore();
   const { issues, workspaceId } = useIssuesStore();
   const [relatedIssueId, setRelatedIssueId] = useState('');
   const [relationType, setRelationType] = useState<'RELATED' | 'BLOCKS'>('RELATED');
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   const source = useMemo(() => issues.find((issue) => issue.id === issueId), [issueId, issues]);
   const candidates = useMemo(
      () => issues.filter((issue) => issue.id !== issueId),
      [issueId, issues]
   );

   useEffect(() => {
      if (open) {
         setRelatedIssueId('');
         setRelationType('RELATED');
         setError(undefined);
      }
   }, [open, issueId]);

   const linkIssue = async () => {
      if (!issueId || !workspaceId || !relatedIssueId) return;
      setSaving(true);
      setError(undefined);
      try {
         const response = await fetch(`${api}/issues/${issueId}/relations`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, relatedIssueId, type: relationType }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not link issues.');
         }
         window.dispatchEvent(
            new CustomEvent('flowie:issue-relations-changed', {
               detail: { issueIds: [issueId, relatedIssueId] },
            })
         );
         close();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not link issues.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={(next) => !next && close()}>
         <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
               <DialogTitle>Add link</DialogTitle>
               <DialogDescription>
                  {source
                     ? `Link ${source.identifier} to another accessible issue.`
                     : 'Link two issues.'}
               </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
               <label className="block space-y-1.5 text-sm">
                  <span className="text-muted-foreground">Relation</span>
                  <select
                     value={relationType}
                     onChange={(event) =>
                        setRelationType(event.target.value as 'RELATED' | 'BLOCKS')
                     }
                     disabled={saving}
                     className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                  >
                     <option value="RELATED">Related</option>
                     <option value="BLOCKS">Blocked by</option>
                  </select>
               </label>
               <select
                  value={relatedIssueId}
                  onChange={(event) => setRelatedIssueId(event.target.value)}
                  disabled={!workspaceId || candidates.length === 0 || saving}
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
               >
                  <option value="">
                     {relationType === 'BLOCKS' ? 'Select a blocker…' : 'Select an issue…'}
                  </option>
                  {candidates.map((issue) => (
                     <option key={issue.id} value={issue.id}>
                        {issue.identifier} · {issue.title}
                     </option>
                  ))}
               </select>
               {!workspaceId && (
                  <p className="text-sm text-muted-foreground">Loading workspace issues…</p>
               )}
               {workspaceId && candidates.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                     No other accessible issues are loaded.
                  </p>
               )}
               {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
               <Button variant="outline" onClick={close} disabled={saving}>
                  Cancel
               </Button>
               <Button onClick={() => void linkIssue()} disabled={!relatedIssueId || saving}>
                  <Link2 />
                  {saving ? 'Linking…' : 'Link issue'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
