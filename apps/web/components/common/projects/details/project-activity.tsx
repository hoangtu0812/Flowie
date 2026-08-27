'use client';

import { LoadingState } from '@/components/common/loading-state';
import { ContentBlocks } from '@/components/common/issues/details/content-blocks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authenticatedFetch } from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import {
   ProjectUpdate,
   ProjectUpdateHealth,
   projectUpdateHealthColor,
   projectUpdateHealthLabel,
} from '@/types/project-details';
import { format, parseISO } from 'date-fns';
import { Paperclip, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { toIssueUi, toProjectDetailUi, toProjectUi } from './project-detail-ui-adapter';
import { ProjectSidePanel } from './project-side-panel';
import { useLiveProjectData } from './use-live-project';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

interface ProjectActivityProps {
   projectId: string;
}

function HealthBadge({ health }: { health: ProjectUpdateHealth }) {
   return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full border px-2 py-0.5">
         <span
            className="size-2 rounded-full"
            style={{ backgroundColor: projectUpdateHealthColor[health] }}
         />
         {projectUpdateHealthLabel[health]}
      </span>
   );
}

function UpdateCard({ update }: { update: ProjectUpdate }) {
   return (
      <div className="border rounded-lg p-4">
         <div className="flex items-center gap-2 text-sm">
            <Avatar className="size-5">
               <AvatarImage src={update.author.avatarUrl} alt={update.author.name} />
               <AvatarFallback>{update.author.name[0]}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{update.author.name}</span>
            <span className="text-xs text-muted-foreground">
               {format(parseISO(update.date), 'MMM d')}
            </span>
            <span className="ml-auto">
               <HealthBadge health={update.health} />
            </span>
         </div>
         <div className="mt-2 text-sm leading-relaxed">
            <ContentBlocks blocks={update.blocks} />
         </div>
      </div>
   );
}

/** Project "Activity" tab: update composer + monthly timeline. */
export default function ProjectActivity({ projectId }: ProjectActivityProps) {
   void projectId;
   const {
      workspaceId,
      project: liveProject,
      issues: liveIssues,
      milestones,
      updates: liveUpdates,
      activities,
      createUpdate,
      loading,
      error,
   } = useLiveProjectData();
   const [mode, setMode] = useState<'comment' | 'update'>('update');
   const [health, setHealth] = useState<ProjectUpdateHealth>('on-track');
   const [text, setText] = useState('');
   const [posting, setPosting] = useState(false);
   const [drafting, setDrafting] = useState(false);
   const project = useMemo(
      () => (liveProject ? toProjectUi(liveProject, liveIssues) : null),
      [liveProject, liveIssues]
   );
   const detail = useMemo(
      () =>
         liveProject ? toProjectDetailUi(liveProject, milestones, liveUpdates, activities) : null,
      [activities, liveProject, liveUpdates, milestones]
   );
   const issues = useMemo(
      () => (project ? liveIssues.map((issue) => toIssueUi(issue, project)) : []),
      [liveIssues, project]
   );

   const updatesByMonth = useMemo(() => {
      const groups = new Map<string, ProjectUpdate[]>();
      for (const update of detail?.updates ?? []) {
         const month = format(parseISO(update.date), 'MMMM');
         groups.set(month, [...(groups.get(month) ?? []), update]);
      }
      return [...groups.entries()];
   }, [detail]);

   if (loading) return <LoadingState label="Loading project…" />;
   if (error || !project || !detail)
      return (
         <div className="h-full grid place-items-center text-sm text-destructive">
            {error ?? 'Project not found.'}
         </div>
      );

   const completedPercent =
      issues.length > 0
         ? Math.round(
              (issues.filter((issue) => issue.status.category === 'completed').length /
                 issues.length) *
                 100
           )
         : 0;

   /**
    * The Agent drafts from the project's own record and hands the text back
    * here rather than posting it: an update carries the author's name, so it
    * is theirs to read and edit before it goes out. Anything already typed is
    * passed along as the angle to write from.
    */
   const draftWithAgent = async () => {
      if (!workspaceId || !liveProject || drafting) return;
      setDrafting(true);
      try {
         const response = await authenticatedFetch(`${api}/agent/compose/project-update`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               projectId: liveProject.id,
               kind: mode,
               ...(mode === 'update' ? { health } : {}),
               ...(text.trim() ? { notes: text.trim() } : {}),
            }),
         });
         const payload = (await response.json().catch(() => null)) as {
            data?: { body?: string };
            message?: string;
         } | null;
         if (!response.ok || !payload?.data?.body) {
            throw new Error(payload?.message ?? 'Could not draft with Agent.');
         }
         setText(payload.data.body);
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not draft with Agent.');
      } finally {
         setDrafting(false);
      }
   };

   const handlePost = async () => {
      if (text.trim() === '') return;
      setPosting(true);
      try {
         await createUpdate(text, health, mode);
         setText('');
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not post project update.');
      } finally {
         setPosting(false);
      }
   };

   return (
      <div className="w-full h-full flex overflow-hidden">
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 lg:px-10 py-8">
               {/* Composer */}
               <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2">
                     <div className="flex items-center rounded-md border p-0.5 text-xs">
                        {(['comment', 'update'] as const).map((value) => (
                           <button
                              key={value}
                              type="button"
                              onClick={() => setMode(value)}
                              className={cn(
                                 'px-2 py-1 rounded-[5px] capitalize transition-colors',
                                 mode === value
                                    ? 'bg-accent text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                              )}
                           >
                              {value}
                           </button>
                        ))}
                     </div>
                     {mode === 'update' && (
                        <DropdownMenu>
                           <DropdownMenuTrigger className="outline-none">
                              <HealthBadge health={health} />
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="start" className="w-40">
                              {(Object.keys(projectUpdateHealthLabel) as ProjectUpdateHealth[]).map(
                                 (value) => (
                                    <DropdownMenuItem key={value} onClick={() => setHealth(value)}>
                                       <span
                                          className="size-2 rounded-full"
                                          style={{
                                             backgroundColor: projectUpdateHealthColor[value],
                                          }}
                                       />
                                       {projectUpdateHealthLabel[value]}
                                    </DropdownMenuItem>
                                 )
                              )}
                           </DropdownMenuContent>
                        </DropdownMenu>
                     )}
                  </div>

                  <textarea
                     value={text}
                     onChange={(event) => setText(event.target.value)}
                     placeholder={
                        mode === 'update' ? 'Write a project update…' : 'Leave a comment…'
                     }
                     className="mt-3 w-full min-h-24 resize-y bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />

                  {mode === 'update' && (
                     <div className="mt-1 border-l-2 pl-4 py-1 flex flex-col gap-1.5 text-xs text-muted-foreground">
                        <div className="flex gap-6">
                           <span className="w-20">Priority</span>
                           <span>
                              No priority →{' '}
                              <span className="text-foreground">{project.priority.name}</span>
                           </span>
                        </div>
                        <div className="flex gap-6">
                           <span className="w-20">Lead</span>
                           <span>
                              <span className="text-foreground">{project.lead.name}</span> assigned
                           </span>
                        </div>
                        <div className="flex gap-6">
                           <span className="w-20">Target date</span>
                           <span>
                              set to{' '}
                              <span className="text-foreground">
                                 {project.targetDate
                                    ? format(parseISO(project.targetDate), 'MMM do')
                                    : '—'}
                              </span>
                           </span>
                        </div>
                        <div className="flex gap-6">
                           <span className="w-20">Progress</span>
                           <span>
                              0% → <span className="text-foreground">{completedPercent}%</span>
                           </span>
                        </div>
                     </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                     <Button
                        variant="outline"
                        size="xs"
                        className="gap-1.5"
                        onClick={() => void draftWithAgent()}
                        disabled={drafting || !workspaceId}
                     >
                        <Sparkles className={cn('size-3.5', drafting && 'animate-pulse')} />
                        {drafting ? 'Writing…' : 'Write with Agent'}
                     </Button>
                     <div className="flex items-center gap-2">
                        <Button
                           variant="ghost"
                           size="icon"
                           className="size-7 text-muted-foreground"
                        >
                           <Paperclip className="size-4" />
                        </Button>
                        <Button
                           size="xs"
                           onClick={() => void handlePost()}
                           disabled={text.trim() === '' || posting}
                        >
                           Post {mode === 'update' ? 'update' : 'comment'}
                        </Button>
                     </div>
                  </div>
               </div>

               {/* Timeline */}
               {updatesByMonth.length === 0 ? (
                  <p className="mt-10 text-sm text-muted-foreground text-center">
                     No updates yet — post the first one to keep the team in the loop.
                  </p>
               ) : (
                  updatesByMonth.map(([month, monthUpdates]) => (
                     <div key={month} className="mt-8">
                        <h3 className="text-lg font-semibold mb-3">{month}</h3>
                        <div className="flex flex-col gap-3">
                           {monthUpdates.map((update) => (
                              <UpdateCard key={update.id} update={update} />
                           ))}
                        </div>
                     </div>
                  ))
               )}
            </div>
         </div>

         <ProjectSidePanel project={project} detail={detail} issues={issues} />
      </div>
   );
}
