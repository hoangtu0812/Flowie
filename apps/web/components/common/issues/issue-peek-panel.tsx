'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { format, parseISO } from 'date-fns';
import { CalendarDays, ChevronRight, Circle, FolderKanban, Tag, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type PeekIssue = {
   id: string;
   identifier: string;
   title: string;
   description: string | null;
   dueDate: string | null;
   status: { name: string; color: string };
   priority: string;
   assignee: { name: string; avatarUrl: string | null } | null;
   project: { name: string } | null;
   labelLinks: Array<{ label: { id: string; name: string; color: string } }>;
};

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
         <span className="min-w-0 truncate">{children}</span>
      </div>
   );
}

/** Lightweight issue detail panel used from timeline bars without leaving the timeline. */
export function IssuePeekPanel({ issueId, onClose }: { issueId: string; onClose: () => void }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [issue, setIssue] = useState<PeekIssue>();

   useEffect(() => {
      let active = true;
      void (async () => {
         try {
            const workspace = await loadCurrentWorkspace();
            const response = await authenticatedFetch(
               `${api}/issues/${issueId}?workspaceId=${workspace.id}`
            );
            if (!response.ok) return;
            const payload = (await response.json()) as { data: PeekIssue };
            if (active) setIssue(payload.data);
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
            <Property
               icon={<Circle className="size-4" style={{ color: issue.status.color }} />}
               label="Status"
            >
               {issue.status.name}
            </Property>
            <Property icon={<Tag className="size-4" />} label="Priority">
               {issue.priority.toLowerCase()}
            </Property>
            <Property icon={<CalendarDays className="size-4" />} label="Due date">
               {due}
            </Property>
            <Property icon={<UserRound className="size-4" />} label="Assignee">
               {issue.assignee ? (
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
                  'Unassigned'
               )}
            </Property>
            <Property icon={<FolderKanban className="size-4" />} label="Project">
               {issue.project?.name ?? 'No project'}
            </Property>
         </div>
         {issue.description && (
            <p className="py-3 text-sm whitespace-pre-wrap text-muted-foreground">
               {issue.description}
            </p>
         )}
         {issue.labelLinks.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-3 border-t">
               {issue.labelLinks.map(({ label }) => (
                  <span
                     key={label.id}
                     className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                  >
                     <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: label.color }}
                     />
                     {label.name}
                  </span>
               ))}
            </div>
         )}
      </aside>
   );
}
