'use client';

import { Button } from '@/components/ui/button';
import type { Issue } from '@/mock-data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { CornerLeftUp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { IssueSearchDialog } from './issue-search-dialog';

/**
 * Parent line of the issue body: links to the parent and offers Change/Remove parent, or Set
 * parent for a root issue. It lives in the shared issue body, so the page, quick view and mobile
 * all have it. Removing the parent keeps the issue and its own sub-issues.
 * VI: Dòng cha của phần thân issue: liên kết tới cha, có Change/Remove parent, hoặc Set parent với
 * VI: issue gốc. Dòng này nằm trong phần thân dùng chung nên trang chi tiết, quick view và mobile
 * VI: đều có. Gỡ cha giữ nguyên issue và các sub-issue của nó.
 */
export function IssueParent({ issue, orgId }: { issue: Issue; orgId: string }) {
   const setIssueParent = useIssuesStore((state) => state.setIssueParent);
   const [open, setOpen] = useState(false);
   const [error, setError] = useState<string>();

   const remove = async () => {
      setError(undefined);
      try {
         await setIssueParent(issue.id, null);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not remove the parent issue.');
      }
   };

   return (
      <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground min-w-0">
         {issue.parent ? (
            <>
               <CornerLeftUp className="size-3.5 shrink-0" />
               <span className="shrink-0">Sub-issue of</span>
               <Link
                  href={`/${orgId}/issue/${issue.parent.identifier}`}
                  className="flex items-center gap-1.5 min-w-0 text-foreground hover:underline"
               >
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                     {issue.parent.identifier}
                  </span>
                  <span className="truncate max-w-64">{issue.parent.title}</span>
               </Link>
               <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
                  Change parent
               </Button>
               <Button size="xs" variant="ghost" onClick={() => void remove()}>
                  Remove parent
               </Button>
            </>
         ) : (
            <Button size="xs" variant="ghost" className="-ml-2" onClick={() => setOpen(true)}>
               <CornerLeftUp className="size-3.5" /> Set parent
            </Button>
         )}
         {error && <span className="text-destructive">{error}</span>}
         <IssueSearchDialog
            open={open}
            onOpenChange={setOpen}
            title={issue.parent ? 'Change parent' : 'Set parent'}
            description={`Pick the issue that ${issue.identifier} belongs under.`}
            teamId={issue.teamId}
            excludeIds={[issue.id, ...(issue.parent ? [issue.parent.id] : [])]}
            onPick={async (picked) => {
               await setIssueParent(issue.id, picked.id);
            }}
         />
      </div>
   );
}
