'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Issue } from '@/mock-data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * The stored issue description, rendered as written and editable in place.
 * Text is kept verbatim — the API stores one plain string, so line breaks are
 * the only structure there is to preserve.
 */
export function IssueDescription({ issue }: { issue: Issue }) {
   const updateIssueDescription = useIssuesStore((state) => state.updateIssueDescription);
   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState(issue.description);
   const [saving, setSaving] = useState(false);

   useEffect(() => {
      setDraft(issue.description);
   }, [issue.id, issue.description]);

   const save = async () => {
      if (draft === issue.description) {
         setEditing(false);
         return;
      }
      setSaving(true);
      try {
         await updateIssueDescription(issue.id, draft.trim());
         setEditing(false);
      } catch (caught) {
         toast.error(
            caught instanceof Error ? caught.message : 'Could not update the description.'
         );
      } finally {
         setSaving(false);
      }
   };

   if (editing) {
      return (
         <div className="mt-6 space-y-2">
            <Textarea
               value={draft}
               onChange={(event) => setDraft(event.target.value)}
               onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                     setDraft(issue.description);
                     setEditing(false);
                  }
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save();
               }}
               rows={10}
               placeholder="Describe the issue…"
               autoFocus
            />
            <div className="flex items-center gap-2">
               <Button size="sm" onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
               </Button>
               <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                     setDraft(issue.description);
                     setEditing(false);
                  }}
               >
                  Cancel
               </Button>
               <span className="text-xs text-muted-foreground">⌘↵ to save · Esc to cancel</span>
            </div>
         </div>
      );
   }

   return (
      <button
         type="button"
         className="mt-6 block w-full text-left text-sm leading-relaxed whitespace-pre-wrap rounded-md -mx-2 px-2 py-1 hover:bg-sidebar/50 transition-colors"
         onClick={() => setEditing(true)}
      >
         {issue.description.trim() || (
            <span className="text-muted-foreground">Add description…</span>
         )}
      </button>
   );
}
