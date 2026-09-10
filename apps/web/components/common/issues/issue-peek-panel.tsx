'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { format, parseISO } from 'date-fns';
import {
   CalendarDays,
   Check,
   ChevronRight,
   Circle,
   FolderKanban,
   Tag,
   UserRound,
   X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

type PeekIssue = {
   id: string;
   identifier: string;
   title: string;
   description: string | null;
   dueDate: string | null;
   statusId: string;
   status: { name: string; color: string };
   priority: string;
   assignee: { id: string; name: string; avatarUrl: string | null } | null;
   project: { name: string } | null;
   labelLinks: Array<{ label: { id: string; name: string; color: string } }>;
};

type PeekOption = { id: string; name: string; color?: string; avatarUrl?: string | null };

function Property({
   icon,
   label,
   children,
}: {
   icon: React.ReactNode;
   label: string;
   children: React.ReactNode;
}) {
   return (
      <div className="flex items-center gap-2 min-h-8 text-sm">
         <span className="text-muted-foreground">{icon}</span>
         <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
         <span className="min-w-0 flex-1 truncate">{children}</span>
      </div>
   );
}

function EditableProperty({
   icon,
   label,
   display,
   title,
   open,
   onOpenChange,
   children,
}: {
   icon: React.ReactNode;
   label: string;
   display: React.ReactNode;
   title: string;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   children: React.ReactNode;
}) {
   return (
      <div className="flex items-center gap-2 min-h-8 text-sm">
         <span className="text-muted-foreground">{icon}</span>
         <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
         <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
               <button
                  type="button"
                  title={title}
                  className="min-w-0 flex-1 truncate text-left rounded px-1 -mx-1 py-0.5 hover:bg-accent transition-colors"
               >
                  {display}
               </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 p-1.5">
               {children}
            </PopoverContent>
         </Popover>
      </div>
   );
}

function OptionRow({
   selected,
   onSelect,
   children,
}: {
   selected: boolean;
   onSelect: () => void;
   children: React.ReactNode;
}) {
   return (
      <button
         type="button"
         onClick={onSelect}
         className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left"
      >
         <span className="min-w-0 flex-1 truncate">{children}</span>
         {selected && <Check className="size-4 shrink-0" />}
      </button>
   );
}

/** Issue peek panel with inline editing, so timeline bars need no detour. */
export function IssuePeekPanel({ issueId, onClose }: { issueId: string; onClose: () => void }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [issue, setIssue] = useState<PeekIssue>();
   const [statuses, setStatuses] = useState<PeekOption[]>([]);
   const [members, setMembers] = useState<PeekOption[]>([]);
   const [labels, setLabels] = useState<PeekOption[]>([]);
   const [openEditor, setOpenEditor] = useState<string | null>(null);
   const [saving, setSaving] = useState(false);

   useEffect(() => {
      let active = true;
      void (async () => {
         try {
            const workspace = await loadCurrentWorkspace();
            const query = new URLSearchParams({ workspaceId: workspace.id });
            const [issueResponse, optionsResponse] = await Promise.all([
               authenticatedFetch(`${api}/issues/${issueId}?${query}`),
               authenticatedFetch(`${api}/issues/options?${query}`),
            ]);
            if (!active || !issueResponse.ok) return;
            setIssue(((await issueResponse.json()) as { data: PeekIssue }).data);
            if (optionsResponse.ok) {
               const options = (await optionsResponse.json()) as {
                  data: { statuses?: PeekOption[]; members?: PeekOption[]; labels?: PeekOption[] };
               };
               setStatuses(options.data.statuses ?? []);
               setMembers(options.data.members ?? []);
               setLabels(options.data.labels ?? []);
            }
         } catch {
            if (active) setIssue(undefined);
         }
      })();
      return () => {
         active = false;
      };
   }, [issueId]);

   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [onClose]);

   if (!issue) return null;
   const due = issue.dueDate ? format(parseISO(issue.dueDate), 'MMM d, yyyy') : 'No due date';

   const patch = async (
      body: Record<string, unknown>,
      apply: (current: PeekIssue) => PeekIssue
   ) => {
      setSaving(true);
      try {
         const workspace = await loadCurrentWorkspace();
         const response = await authenticatedFetch(
            `${api}/issues/${issue.id}?workspaceId=${workspace.id}`,
            {
               method: 'PATCH',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify(body),
            }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update this issue.');
         }
         setIssue((prev) => (prev ? apply(prev) : prev));
         setOpenEditor(null);
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not update this issue.');
      } finally {
         setSaving(false);
      }
   };

   const setStatus = (status: PeekOption) =>
      void patch({ statusId: status.id }, (current) => ({
         ...current,
         statusId: status.id,
         status: { name: status.name, color: status.color ?? current.status.color },
      }));

   const setPriority = (priority: string) =>
      void patch({ priority }, (current) => ({ ...current, priority: priority.toLowerCase() }));

   const setDueDate = (value: string) =>
      void patch({ dueDate: value || null }, (current) => ({ ...current, dueDate: value || null }));

   const setAssignee = (member: PeekOption | null) =>
      void patch({ assigneeId: member?.id ?? null }, (current) => ({
         ...current,
         assignee: member
            ? { id: member.id, name: member.name, avatarUrl: member.avatarUrl ?? null }
            : null,
      }));

   const toggleLabel = (label: PeekOption) => {
      const has = issue.labelLinks.some(({ label: linked }) => linked.id === label.id);
      const nextIds = has
         ? issue.labelLinks.map(({ label: linked }) => linked.id).filter((id) => id !== label.id)
         : [...issue.labelLinks.map(({ label: linked }) => linked.id), label.id];
      const nextLinks = labels
         .filter((candidate) => nextIds.includes(candidate.id))
         .map((candidate) => ({
            label: { id: candidate.id, name: candidate.name, color: candidate.color ?? '#8f9299' },
         }));
      void patch({ labelIds: nextIds }, (current) => ({ ...current, labelLinks: nextLinks }));
   };

   const editorProps = (key: string) => ({
      open: openEditor === key && !saving,
      onOpenChange: (open: boolean) => setOpenEditor(open ? key : null),
   });

   return (
      <aside className="absolute top-10 right-2 bottom-2 w-[380px] max-w-[calc(100%-1rem)] z-40 overflow-y-auto rounded-xl border bg-container shadow-lg p-4">
         <div className="flex items-start gap-2 pb-4 border-b">
            <Circle className="size-4 mt-1 shrink-0" style={{ color: issue.status.color }} />
            <Link href={`/${orgId}/issue/${issue.identifier}`} className="min-w-0 flex-1 group">
               <p className="text-xs text-muted-foreground">{issue.identifier}</p>
               <p className="font-medium leading-5 group-hover:text-foreground/75">{issue.title}</p>
            </Link>
            <Link
               href={`/${orgId}/issue/${issue.identifier}`}
               aria-label="Open issue"
               className="text-muted-foreground hover:text-foreground"
            >
               <ChevronRight className="size-4" />
            </Link>
            <button
               type="button"
               onClick={onClose}
               aria-label="Close panel"
               className="text-muted-foreground hover:text-foreground"
            >
               <X className="size-4" />
            </button>
         </div>
         <div className="py-3 border-b">
            <EditableProperty
               icon={<Circle className="size-4" style={{ color: issue.status.color }} />}
               label="Status"
               display={issue.status.name}
               title="Change status"
               {...editorProps('status')}
            >
               {statuses.map((status) => (
                  <OptionRow
                     key={status.id}
                     selected={status.id === issue.statusId}
                     onSelect={() => setStatus(status)}
                  >
                     <span className="inline-flex items-center gap-2">
                        <span
                           className="size-2.5 rounded-full"
                           style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                     </span>
                  </OptionRow>
               ))}
               {statuses.length === 0 && (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                     No statuses available.
                  </p>
               )}
            </EditableProperty>
            <EditableProperty
               icon={<Tag className="size-4" />}
               label="Priority"
               display={issue.priority.toLowerCase()}
               title="Change priority"
               {...editorProps('priority')}
            >
               {PRIORITIES.map((priority) => (
                  <OptionRow
                     key={priority}
                     selected={priority.toLowerCase() === issue.priority.toLowerCase()}
                     onSelect={() => setPriority(priority)}
                  >
                     {priority.toLowerCase()}
                  </OptionRow>
               ))}
            </EditableProperty>
            <EditableProperty
               icon={<CalendarDays className="size-4" />}
               label="Due date"
               display={due}
               title="Change due date"
               {...editorProps('due')}
            >
               <div className="p-1 space-y-2" onClick={(event) => event.stopPropagation()}>
                  <Input
                     type="date"
                     defaultValue={issue.dueDate?.slice(0, 10) ?? ''}
                     onChange={(event) => setDueDate(event.target.value)}
                  />
                  <p className="px-1 text-xs text-muted-foreground">
                     Pick a date to save, or clear the field to remove it.
                  </p>
               </div>
            </EditableProperty>
            <EditableProperty
               icon={<UserRound className="size-4" />}
               label="Assignee"
               display={
                  issue.assignee ? (
                     <span className="inline-flex items-center gap-1.5">
                        <Avatar className="size-5">
                           <AvatarImage
                              src={issue.assignee.avatarUrl ?? undefined}
                              alt={issue.assignee.name}
                           />
                           <AvatarFallback>{issue.assignee.name[0]}</AvatarFallback>
                        </Avatar>
                        {issue.assignee.name}
                     </span>
                  ) : (
                     <span className="text-muted-foreground">Unassigned</span>
                  )
               }
               title="Change assignee"
               {...editorProps('assignee')}
            >
               <OptionRow selected={!issue.assignee} onSelect={() => setAssignee(null)}>
                  <span className="text-muted-foreground">No assignee</span>
               </OptionRow>
               {members.map((member) => (
                  <OptionRow
                     key={member.id}
                     selected={member.id === issue.assignee?.id}
                     onSelect={() => setAssignee(member)}
                  >
                     <span className="inline-flex items-center gap-2">
                        <Avatar className="size-5">
                           <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                           <AvatarFallback>{member.name[0]}</AvatarFallback>
                        </Avatar>
                        {member.name}
                     </span>
                  </OptionRow>
               ))}
            </EditableProperty>
            <Property icon={<FolderKanban className="size-4" />} label="Project">
               {issue.project?.name ?? 'No project'}
            </Property>
         </div>
         {issue.description && (
            <p className="py-3 text-sm whitespace-pre-wrap text-muted-foreground">
               {issue.description}
            </p>
         )}
         <div className="flex flex-wrap items-center gap-1 pt-3 border-t">
            {issue.labelLinks.map(({ label }) => (
               <button
                  key={label.id}
                  type="button"
                  title="Remove label"
                  onClick={() =>
                     toggleLabel({ id: label.id, name: label.name, color: label.color })
                  }
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-accent transition-colors"
               >
                  <span
                     className="size-1.5 rounded-full"
                     style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                  <X className="size-3 text-muted-foreground" />
               </button>
            ))}
            <Popover
               open={openEditor === 'labels' && !saving}
               onOpenChange={(open) => setOpenEditor(open ? 'labels' : null)}
            >
               <PopoverTrigger asChild>
                  <button
                     type="button"
                     title="Edit labels"
                     className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                     <Tag className="size-3" />
                     {issue.labelLinks.length > 0 ? 'Edit' : 'Add label'}
                  </button>
               </PopoverTrigger>
               <PopoverContent align="start" className="w-60 p-1.5">
                  {labels.map((label) => (
                     <OptionRow
                        key={label.id}
                        selected={issue.labelLinks.some(
                           ({ label: linked }) => linked.id === label.id
                        )}
                        onSelect={() => toggleLabel(label)}
                     >
                        <span className="inline-flex items-center gap-2">
                           <span
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: label.color }}
                           />
                           {label.name}
                        </span>
                     </OptionRow>
                  ))}
                  {labels.length === 0 && (
                     <p className="px-2 py-1.5 text-sm text-muted-foreground">
                        No workspace labels yet.
                     </p>
                  )}
               </PopoverContent>
            </Popover>
         </div>
      </aside>
   );
}
