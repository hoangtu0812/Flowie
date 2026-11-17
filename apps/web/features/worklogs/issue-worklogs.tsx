'use client';

import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { Clock3, Pencil, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useMessages } from '@/features/shared/use-messages';
import { localDay } from '@/lib/week';
import {
   deleteWorklog,
   loadWorklogs,
   saveWorklog,
   type IssueWorklogs,
   type Worklog,
} from '@/lib/worklogs';
import { useIssuesStore } from '@/store/issues-store';
import { messages } from './messages.vi';

const emptyDraft = () => ({ workDate: localDay(), hours: '', note: '' });

/**
 * Time log of an issue: a form to log the signed-in user's hours and the list of every entry.
 * Edit and delete appear only on entries the server marks `canEdit` (the author, or a workspace
 * owner/admin), and the server checks the same rule again. After each write the issue's actual
 * effort in the store takes the value the server recomputed, so the properties panel follows.
 * VI: Chấm công của một issue: form ghi giờ của người đang đăng nhập và danh sách mọi bản ghi.
 * VI: Nút sửa và xoá chỉ hiện trên bản ghi server đánh dấu `canEdit` (người ghi, hoặc owner/admin
 * VI: workspace), và server kiểm tra lại cùng quy tắc. Sau mỗi lần ghi, actual effort của issue
 * VI: trong store lấy giá trị server đã tính lại, nên panel thuộc tính cập nhật theo.
 */
export function IssueWorklogs({ issueId }: { issueId: string }) {
   const tx = useMessages(messages);
   const workspaceId = useIssuesStore((state) => state.workspaceId) ?? '';
   const updateIssue = useIssuesStore((state) => state.updateIssue);
   const [state, setState] = useState<IssueWorklogs>();
   const [draft, setDraft] = useState(emptyDraft);
   const [editing, setEditing] = useState<string>();
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState('');

   useEffect(() => {
      if (!workspaceId) return;
      let current = true;
      void loadWorklogs(workspaceId, issueId)
         .then((next) => current && setState(next))
         .catch(() => current && setError(tx('Could not load worklogs.')));
      return () => {
         current = false;
      };
   }, [workspaceId, issueId, tx]);

   const apply = (next: IssueWorklogs) => {
      setState(next);
      updateIssue(issueId, { actualEffort: next.actualEffort ?? undefined });
   };

   const run = async (action: () => Promise<IssueWorklogs>) => {
      setBusy(true);
      setError('');
      try {
         apply(await action());
         return true;
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : String(reason));
         return false;
      } finally {
         setBusy(false);
      }
   };

   const submit = async () => {
      const hours = Number(draft.hours);
      if (!(hours >= 0.25 && hours <= 24 && Number.isInteger(hours * 4))) {
         setError(tx('Hours must be between 0.25 and 24 in steps of 0.25.'));
         return;
      }
      const saved = await run(() =>
         saveWorklog(
            workspaceId,
            issueId,
            { workDate: draft.workDate, hours, note: draft.note.trim() || undefined },
            editing
         )
      );
      if (saved) {
         setDraft(emptyDraft());
         setEditing(undefined);
      }
   };

   const edit = (entry: Worklog) => {
      setEditing(entry.id);
      setDraft({ workDate: entry.workDate, hours: String(entry.hours), note: entry.note ?? '' });
   };

   return (
      <section className="flex flex-col gap-2" aria-label={tx('Time log')}>
         <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {tx('Time log')}
            {state && state.totalHours > 0 && (
               <span className="tabular-nums">{tx('{hours} h', { hours: state.totalHours })}</span>
            )}
         </h3>
         <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
               event.preventDefault();
               void submit();
            }}
         >
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
               {tx('Work date')}
               <Input
                  type="date"
                  required
                  max={localDay()}
                  value={draft.workDate}
                  onChange={(event) => setDraft({ ...draft, workDate: event.target.value })}
                  className="h-8 w-40"
               />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
               {tx('Hours')}
               <Input
                  type="number"
                  required
                  min={0.25}
                  max={24}
                  step={0.25}
                  value={draft.hours}
                  onChange={(event) => setDraft({ ...draft, hours: event.target.value })}
                  className="h-8 w-24"
               />
            </label>
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground">
               {tx('Note (optional)')}
               <Input
                  maxLength={1000}
                  value={draft.note}
                  onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                  className="h-8"
               />
            </label>
            <Button
               label={editing ? tx('Save') : tx('Log time')}
               type="submit"
               size="sm"
               variant="primary"
               isDisabled={busy || !workspaceId}
            />
            {editing && (
               <Button
                  label={tx('Cancel')}
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                     setEditing(undefined);
                     setDraft(emptyDraft());
                  }}
               />
            )}
         </form>
         {error && (
            <Text type="supporting" className="text-destructive" role="alert">
               {error}
            </Text>
         )}
         {state && state.items.length === 0 && (
            <Text type="supporting">{tx('No time logged yet.')}</Text>
         )}
         {state && state.items.length > 0 && (
            <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/70">
               {state.items.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                     <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {entry.workDate}
                     </span>
                     <span className="w-32 shrink-0 truncate">{entry.user.name}</span>
                     <span className="w-16 shrink-0 tabular-nums">
                        {tx('{hours} h', { hours: entry.hours })}
                     </span>
                     <span
                        className="min-w-0 flex-1 truncate text-muted-foreground"
                        title={entry.note ?? undefined}
                     >
                        {entry.note}
                     </span>
                     {entry.canEdit && (
                        <span className="flex shrink-0 gap-1">
                           <Button
                              label={tx('Edit worklog')}
                              icon={<Pencil className="size-3.5" />}
                              isIconOnly
                              size="sm"
                              variant="ghost"
                              isDisabled={busy}
                              onClick={() => edit(entry)}
                           />
                           <Button
                              label={tx('Delete worklog')}
                              icon={<Trash2 className="size-3.5" />}
                              isIconOnly
                              size="sm"
                              variant="ghost"
                              isDisabled={busy || !workspaceId}
                              onClick={() =>
                                 void run(() => deleteWorklog(workspaceId, issueId, entry.id))
                              }
                           />
                        </span>
                     )}
                  </li>
               ))}
            </ul>
         )}
      </section>
   );
}
