'use client';

import { ContentBlocks } from '@/components/common/issues/details/content-blocks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
   ProjectUpdate,
   ProjectUpdateHealth,
   projectUpdateHealthColor,
   projectUpdateHealthLabel,
} from '@/mock-data/project-details';
import { format, parseISO } from 'date-fns';
import { Paperclip, Sparkles, X } from 'lucide-react';
import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { toIssueUi, toProjectDetailUi, toProjectUi } from './project-detail-ui-adapter';
import { ProjectSidePanel } from './project-side-panel';
import { useLiveProject } from './use-live-project';

interface ProjectActivityProps {
   projectId: string;
}

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const formatFileSize = (size: number) =>
   size >= 1024 * 1024
      ? `${(size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(size / 1024))} KB`;

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
               <AvatarImage src={update.author.avatarUrl || undefined} alt={update.author.name} />
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
         {update.attachments?.length ? (
            <ul className="mt-3 space-y-1.5">
               {update.attachments.map((attachment) => (
                  <li className="flex items-center gap-2 text-xs" key={attachment.id}>
                     <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                     <a
                        className="min-w-0 truncate hover:underline"
                        href={`${api}/attachments/${attachment.id}/download`}
                     >
                        {attachment.filename}
                     </a>
                     <span className="shrink-0 text-muted-foreground">
                        {formatFileSize(attachment.size)}
                     </span>
                  </li>
               ))}
            </ul>
         ) : null}
      </div>
   );
}

/** Project "Activity" tab: update composer + monthly timeline. */
export default function ProjectActivity({ projectId }: ProjectActivityProps) {
   const {
      project,
      issues,
      milestones,
      updates: liveUpdates,
      activities,
      loading,
      error,
      createUpdate,
      availableLabels,
      availableMembers,
      updateLabels,
      updateMembers,
      createMilestone,
      toggleMilestone,
   } = useLiveProject(projectId);
   const [mode, setMode] = useState<'comment' | 'update'>('update');
   const [health, setHealth] = useState<ProjectUpdateHealth>('on-track');
   const [text, setText] = useState('');
   const [posting, setPosting] = useState(false);
   const [postError, setPostError] = useState<string>();
   const [pendingAttachment, setPendingAttachment] = useState<File>();
   const attachmentInputRef = useRef<HTMLInputElement>(null);

   const uiProject = useMemo(
      () => (project ? toProjectUi(project, issues) : undefined),
      [issues, project]
   );
   const detail = useMemo(
      () => (project ? toProjectDetailUi(project, milestones, liveUpdates, activities) : undefined),
      [activities, liveUpdates, milestones, project]
   );
   const uiIssues = useMemo(
      () => (uiProject ? issues.map((issue) => toIssueUi(issue, uiProject)) : []),
      [issues, uiProject]
   );

   const updates = useMemo<ProjectUpdate[]>(() => detail?.updates ?? [], [detail?.updates]);

   const updatesByMonth = useMemo(() => {
      const groups = new Map<string, ProjectUpdate[]>();
      for (const update of updates) {
         const month = format(parseISO(update.date), 'MMMM');
         groups.set(month, [...(groups.get(month) ?? []), update]);
      }
      return [...groups.entries()];
   }, [updates]);

   const completedPercent = uiProject?.percentComplete ?? 0;

   const handlePost = async () => {
      if (text.trim() === '') return;
      setPosting(true);
      setPostError(undefined);
      try {
         await createUpdate(text.trim(), health, mode, pendingAttachment);
         setText('');
         setPendingAttachment(undefined);
      } catch (caught) {
         const message = caught instanceof Error ? caught.message : 'Could not post update.';
         if (message.startsWith('Project update was posted')) {
            setText('');
            setPendingAttachment(undefined);
         }
         setPostError(message);
      } finally {
         setPosting(false);
      }
   };

   const selectAttachment = (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
         setPostError('Files must be 10 MB or smaller.');
         return;
      }
      setPendingAttachment(file);
      setPostError(undefined);
   };

   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading activity…</div>;
   if (error || !project || !uiProject || !detail)
      return (
         <div className="px-8 py-10 text-sm text-destructive">{error ?? 'Project not found.'}</div>
      );

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
                              <span className="text-foreground">{uiProject.priority.name}</span>
                           </span>
                        </div>
                        <div className="flex gap-6">
                           <span className="w-20">Lead</span>
                           <span>
                              <span className="text-foreground">{uiProject.lead.name}</span>{' '}
                              assigned
                           </span>
                        </div>
                        <div className="flex gap-6">
                           <span className="w-20">Target date</span>
                           <span>
                              set to{' '}
                              <span className="text-foreground">
                                 {uiProject.targetDate
                                    ? format(parseISO(uiProject.targetDate), 'MMM do')
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

                  {pendingAttachment && (
                     <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Paperclip className="size-3.5 shrink-0" />
                        <span className="min-w-0 truncate">{pendingAttachment.name}</span>
                        <span className="shrink-0">{formatFileSize(pendingAttachment.size)}</span>
                        <button
                           type="button"
                           className="ml-auto rounded-sm p-0.5 hover:bg-accent"
                           aria-label="Remove project update attachment"
                           onClick={() => setPendingAttachment(undefined)}
                        >
                           <X className="size-3.5" />
                        </button>
                     </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                     <Button
                        variant="outline"
                        size="xs"
                        className="gap-1.5"
                        disabled
                        title="AI writing is unavailable until an AI backend is configured"
                     >
                        <Sparkles className="size-3.5" />
                        Write with Agent
                     </Button>
                     <div className="flex items-center gap-2">
                        <Button
                           variant="ghost"
                           size="icon"
                           className="size-7 text-muted-foreground"
                           disabled={posting}
                           title="Add attachment"
                           aria-label="Add project update attachment"
                           onClick={() => attachmentInputRef.current?.click()}
                        >
                           <Paperclip className="size-4" />
                        </Button>
                        <input
                           ref={attachmentInputRef}
                           type="file"
                           className="hidden"
                           onChange={selectAttachment}
                           aria-label="Upload project update attachment"
                        />
                        <Button
                           size="xs"
                           onClick={() => void handlePost()}
                           disabled={text.trim() === '' || posting}
                        >
                           {posting
                              ? 'Posting…'
                              : `Post ${mode === 'update' ? 'update' : 'comment'}`}
                        </Button>
                     </div>
                  </div>
                  {postError && <p className="mt-2 text-xs text-destructive">{postError}</p>}
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

         <ProjectSidePanel
            project={uiProject}
            detail={detail}
            issues={uiIssues}
            availableLabels={availableLabels}
            availableMembers={availableMembers}
            onLabelsChange={updateLabels}
            onMembersChange={updateMembers}
            onCreateMilestone={createMilestone}
            onToggleMilestone={toggleMilestone}
         />
      </div>
   );
}
