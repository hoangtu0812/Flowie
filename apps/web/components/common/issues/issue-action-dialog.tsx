'use client';

import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Label } from '@/components/ui/label';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { type IssueActionKind, useIssueActionDialogStore } from '@/store/issue-action-dialog-store';
import { useIssuesStore } from '@/store/issues-store';
import { authenticatedFetch } from '@/lib/workspaces';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const titles: Record<Exclude<IssueActionKind, 'archive'>, string> = {
   'duplicate': 'Mark as duplicate',
   'reminder': 'Set reminder',
   'move': 'Move issue',
   'due-date': 'Set due date',
   'rename': 'Rename issue',
   'create-related': 'Create related issue',
   'convert-comment': 'Convert into comment',
};

const successMessages: Record<Exclude<IssueActionKind, 'archive'>, string> = {
   'duplicate': 'Marked as duplicate',
   'reminder': 'Reminder updated',
   'move': 'Issue moved',
   'due-date': 'Due date updated',
   'rename': 'Issue renamed',
   'create-related': 'Related issue created',
   'convert-comment': 'Issue converted into a comment',
};

export function IssueActionDialog() {
   const { issueId, kind, close } = useIssueActionDialogStore();
   const {
      issues,
      teams,
      workspaceId,
      getIssueById,
      updateIssueDueDate,
      updateIssueTitle,
      createIssue,
      setIssueReminder,
      moveIssue,
      classifyIssue,
      convertIssueToComment,
      archiveIssue,
   } = useIssuesStore();
   const [value, setValue] = useState('');
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   const issue = issueId ? getIssueById(issueId) : undefined;
   const candidates = useMemo(
      () => issues.filter((candidate) => candidate.id !== issueId),
      [issueId, issues]
   );
   const destinations = useMemo(
      () => teams.filter((team) => team.id !== issue?.teamId),
      [issue?.teamId, teams]
   );

   useEffect(() => {
      if (!issue || !kind) return;
      if (kind === 'rename') setValue(issue.title);
      else if (kind === 'due-date') setValue(issue.dueDate?.slice(0, 10) ?? '');
      else if (kind === 'reminder') {
         const date = issue.reminderAt ? new Date(issue.reminderAt) : undefined;
         const local = date
            ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
                 .toISOString()
                 .slice(0, 16)
            : '';
         setValue(local);
      } else setValue('');
      setError(undefined);
   }, [issue, kind]);

   const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!issue || !kind || kind === 'archive' || saving) return;
      setSaving(true);
      setError(undefined);
      try {
         if (kind === 'duplicate') {
            const original = candidates.find((candidate) => candidate.id === value);
            if (!original) throw new Error('Choose the original issue.');
            await classifyIssue(issue.id, 'DUPLICATE', original.identifier);
         }
         if (kind === 'reminder') {
            if (!value) await setIssueReminder(issue.id, undefined);
            else {
               const remindAt = new Date(value);
               if (Number.isNaN(remindAt.getTime()) || remindAt.getTime() <= Date.now()) {
                  throw new Error('Choose a valid future time.');
               }
               await setIssueReminder(issue.id, remindAt.toISOString());
            }
         }
         if (kind === 'move') {
            const destination = destinations.find((team) => team.id === value);
            if (!destination) throw new Error('Choose an accessible destination team.');
            const moved = await moveIssue(issue.id, destination.id);
            toast.success(`Moved as ${moved.identifier}`);
         }
         if (kind === 'due-date') await updateIssueDueDate(issue.id, value || undefined);
         if (kind === 'rename') {
            if (value.trim().length < 2) throw new Error('Issue title is too short.');
            await updateIssueTitle(issue.id, value.trim());
         }
         if (kind === 'create-related') {
            if (!workspaceId || !issue.teamId) throw new Error('Workspace or team is unavailable.');
            if (value.trim().length < 2) throw new Error('Issue title is too short.');
            const related = await createIssue({ teamId: issue.teamId, title: value.trim() });
            const response = await authenticatedFetch(`${api}/issues/${issue.id}/relations`, {
               method: 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ workspaceId, relatedIssueId: related.id }),
            });
            if (!response.ok) throw new Error('Could not link the related issue.');
            window.dispatchEvent(
               new CustomEvent('flowie:issue-relations-changed', {
                  detail: { issueIds: [issue.id, related.id] },
               })
            );
            toast.success(`Created and linked ${related.identifier}`);
         }
         if (kind === 'convert-comment') {
            const target = candidates.find((candidate) => candidate.id === value);
            if (!target) throw new Error('Choose a target issue.');
            await convertIssueToComment(issue.id, target.identifier);
         }
         if (kind !== 'move' && kind !== 'create-related') toast.success(successMessages[kind]);
         close();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not update the issue.');
      } finally {
         setSaving(false);
      }
   };

   const archive = async () => {
      if (!issue || saving) return;
      setSaving(true);
      setError(undefined);
      try {
         await archiveIssue(issue.id);
         toast.success('Issue archived');
         close();
      } catch {
         setError('Could not archive issue.');
      } finally {
         setSaving(false);
      }
   };

   const needsIssueSelect = kind === 'duplicate' || kind === 'convert-comment';
   const needsTeamSelect = kind === 'move';
   const inputType = kind === 'due-date' ? 'date' : kind === 'reminder' ? 'datetime-local' : 'text';

   return (
      <>
         <Dialog
            open={Boolean(kind && kind !== 'archive')}
            onOpenChange={(open) => !open && close()}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>
                     {kind && kind !== 'archive' ? titles[kind] : 'Issue action'}
                  </DialogTitle>
                  <DialogDescription>
                     {issue ? `${issue.identifier} · ${issue.title}` : 'Update this issue.'}
                  </DialogDescription>
               </DialogHeader>
               <form className="space-y-4" onSubmit={submit}>
                  {needsIssueSelect ? (
                     <div className="space-y-2">
                        <Label>{kind === 'duplicate' ? 'Original issue' : 'Target issue'}</Label>
                        <Select value={value} onValueChange={setValue}>
                           <SelectTrigger>
                              <SelectValue placeholder="Select an issue…" />
                           </SelectTrigger>
                           <SelectContent>
                              {candidates.map((candidate) => (
                                 <SelectItem key={candidate.id} value={candidate.id}>
                                    <candidate.status.icon />
                                    <span className="text-muted-foreground">
                                       {candidate.identifier}
                                    </span>
                                    {candidate.title}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                  ) : needsTeamSelect ? (
                     <div className="space-y-2">
                        <Label>Destination team</Label>
                        <Select value={value} onValueChange={setValue}>
                           <SelectTrigger>
                              <SelectValue placeholder="Select a team…" />
                           </SelectTrigger>
                           <SelectContent>
                              {destinations.map((team) => (
                                 <SelectItem key={team.id} value={team.id}>
                                    <span className="text-sm">{team.icon}</span>
                                    {team.name} ({team.identifier})
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                  ) : (
                     <div className="space-y-2">
                        <Label htmlFor="issue-action-value">
                           {kind === 'reminder'
                              ? 'Reminder time'
                              : kind === 'due-date'
                                ? 'Due date'
                                : 'Title'}
                        </Label>
                        <Input
                           id="issue-action-value"
                           type={inputType}
                           value={value}
                           onChange={(event) => setValue(event.target.value)}
                           autoFocus
                        />
                        {(kind === 'reminder' || kind === 'due-date') && (
                           <p className="text-xs text-muted-foreground">
                              Leave empty to clear the current value.
                           </p>
                        )}
                     </div>
                  )}
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <DialogFooter>
                     <Button type="button" variant="outline" onClick={close} disabled={saving}>
                        Cancel
                     </Button>
                     <Button
                        type="submit"
                        disabled={
                           saving ||
                           ((needsIssueSelect ||
                              needsTeamSelect ||
                              kind === 'rename' ||
                              kind === 'create-related') &&
                              !value.trim())
                        }
                     >
                        {saving ? 'Saving…' : 'Save'}
                     </Button>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>
         <AlertDialog open={kind === 'archive'} onOpenChange={(open) => !open && close()}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Archive {issue?.identifier ?? 'issue'}?</AlertDialogTitle>
                  <AlertDialogDescription>
                     The issue will be removed from active work while its history is preserved.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               {error && <p className="text-sm text-destructive">{error}</p>}
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     disabled={saving}
                     className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                     onClick={(event) => {
                        event.preventDefault();
                        void archive();
                     }}
                  >
                     {saving ? 'Archiving…' : 'Archive'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );
}
