'use client';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useIssuesStore } from '@/store/issues-store';
import { format } from 'date-fns';
import { useState } from 'react';

const formatCellDate = (value: string | undefined) =>
   value ? format(new Date(value), 'MMM dd') : '—';

function stopCellEvent(event: React.SyntheticEvent) {
   event.stopPropagation();
   if (event.nativeEvent) event.nativeEvent.stopImmediatePropagation?.();
}

/** Single date cell (Start / End / Due) with popover quick-edit. */
export function IssueDateCell({
   issueId,
   value,
   kind,
   accent = false,
}: {
   issueId: string;
   value: string | undefined;
   kind: 'start' | 'target' | 'due';
   accent?: boolean;
}) {
   const [open, setOpen] = useState(false);
   const [saving, setSaving] = useState(false);
   const { getIssueById, updateIssueSchedule, updateIssueDueDate } = useIssuesStore();

   const save = async (nextValue: string | undefined) => {
      if (kind === 'due') {
         setSaving(true);
         const saved = await updateIssueDueDate(issueId, nextValue);
         setSaving(false);
         if (saved) setOpen(false);
         return;
      }
      const current = getIssueById(issueId);
      setSaving(true);
      const saved = await updateIssueSchedule(issueId, {
         startDate: kind === 'start' ? nextValue : current?.startDate?.slice(0, 10) || undefined,
         targetDate: kind === 'target' ? nextValue : current?.targetDate?.slice(0, 10) || undefined,
      });
      setSaving(false);
      if (saved) setOpen(false);
   };

   const title = kind === 'start' ? 'Start date' : kind === 'target' ? 'End date' : 'Due date';

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <button
               type="button"
               disabled={saving}
               onClick={stopCellEvent}
               onMouseDown={stopCellEvent}
               title={`Edit ${title.toLowerCase()}`}
               className={cn(
                  '-ml-2 flex h-7 max-w-full items-center truncate rounded px-2 text-xs transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60',
                  accent && value ? 'text-orange-400' : 'text-muted-foreground'
               )}
            >
               <span className="truncate">{saving ? 'Saving…' : formatCellDate(value)}</span>
            </button>
         </PopoverTrigger>
         <PopoverContent
            align="start"
            className="w-60 space-y-2 p-3"
            onClick={stopCellEvent}
            onMouseDown={stopCellEvent}
         >
            <p className="text-sm font-medium">{title}</p>
            <Input
               type="date"
               defaultValue={value?.slice(0, 10) ?? ''}
               onChange={(event) => void save(event.target.value || undefined)}
            />
            <p className="text-xs text-muted-foreground">
               Pick a date to save, or clear the field to remove it.
            </p>
         </PopoverContent>
      </Popover>
   );
}

/** Single effort cell (Est / Act) with popover quick-edit. */
export function IssueEffortCell({
   issueId,
   value,
   kind,
}: {
   issueId: string;
   value: number | undefined;
   kind: 'estimated' | 'actual';
}) {
   const [open, setOpen] = useState(false);
   const [draft, setDraft] = useState('');
   const [saving, setSaving] = useState(false);
   const { getIssueById, updateIssueEffort } = useIssuesStore();

   const openEditor = () => {
      const current = getIssueById(issueId);
      const currentValue = kind === 'estimated' ? current?.estimatedEffort : current?.actualEffort;
      setDraft(currentValue?.toString() ?? '');
      setOpen(true);
   };

   const save = async () => {
      const trimmed = draft.trim();
      const parsed = Number(trimmed);
      const nextValue = trimmed && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
      const current = getIssueById(issueId);
      setSaving(true);
      const saved = await updateIssueEffort(issueId, {
         estimatedEffort:
            kind === 'estimated' ? nextValue : (current?.estimatedEffort ?? undefined),
         actualEffort: kind === 'actual' ? nextValue : (current?.actualEffort ?? undefined),
      });
      setSaving(false);
      if (saved) setOpen(false);
   };

   return (
      <Popover
         open={open}
         onOpenChange={(next) => {
            if (next) openEditor();
            else setOpen(false);
         }}
      >
         <PopoverTrigger asChild>
            <button
               type="button"
               disabled={saving}
               onClick={stopCellEvent}
               onMouseDown={stopCellEvent}
               title={`Edit ${kind === 'estimated' ? 'estimated' : 'actual'} effort`}
               className="-ml-2 flex h-7 max-w-full items-center truncate rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
            >
               <span className="truncate">{saving ? 'Saving…' : (value ?? '—')}</span>
            </button>
         </PopoverTrigger>
         <PopoverContent
            align="start"
            className="w-60 space-y-2 p-3"
            onClick={stopCellEvent}
            onMouseDown={stopCellEvent}
         >
            <p className="text-sm font-medium">
               {kind === 'estimated' ? 'Estimated effort' : 'Actual effort'} (mandays)
            </p>
            <Input
               type="number"
               min="0"
               step="0.25"
               autoFocus
               value={draft}
               onChange={(event) => setDraft(event.target.value)}
               onKeyDown={(event) => {
                  if (event.key === 'Enter') void save();
               }}
            />
            <div className="flex justify-end gap-2">
               <button
                  type="button"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
               >
                  Cancel
               </button>
               <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
               >
                  {saving ? 'Saving…' : 'Save'}
               </button>
            </div>
         </PopoverContent>
      </Popover>
   );
}
