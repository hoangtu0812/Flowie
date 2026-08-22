'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { ArrowRight, Calendar, FolderKanban, ListChecks } from 'lucide-react';
import { useLiveProject } from './use-live-project';

interface ProjectOverviewProps {
   projectId: string;
}

const dateLabel = (value: string | null) => (value ? format(new Date(value), 'MMM do') : '—');

/** Project Overview retains the original two-column Circle detail layout. */
export default function ProjectOverview({ projectId }: ProjectOverviewProps) {
   const { project, issues, milestones, loading, error } = useLiveProject(projectId);

   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading project…</div>;
   if (error || !project)
      return (
         <div className="px-8 py-10 text-sm text-destructive">{error ?? 'Project not found.'}</div>
      );

   const completed = issues.filter((issue) => issue.status.category === 'COMPLETED').length;
   const progress = issues.length ? Math.round((completed / issues.length) * 100) : 0;

   return (
      <div className="w-full h-full flex overflow-hidden">
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 lg:px-10 py-10">
               <div className="inline-flex size-10 bg-muted/50 items-center justify-center rounded-md mb-4">
                  <FolderKanban className="size-6" />
               </div>
               <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
               {project.description && (
                  <p className="mt-3 text-muted-foreground leading-relaxed whitespace-pre-wrap">
                     {project.description}
                  </p>
               )}

               <div className="mt-6 flex flex-col gap-2.5 text-sm">
                  <div className="flex items-start gap-3">
                     <span className="w-24 text-muted-foreground shrink-0">Properties</span>
                     <div className="flex items-center gap-3 flex-wrap">
                        <span className="capitalize">{project.status.replace('-', ' ')}</span>
                        <span className="capitalize text-muted-foreground">{project.priority}</span>
                        {project.lead ? (
                           <span className="inline-flex items-center gap-1.5">
                              <Avatar className="size-4">
                                 <AvatarImage
                                    src={project.lead.avatarUrl ?? undefined}
                                    alt={project.lead.name}
                                 />
                                 <AvatarFallback>{project.lead.name[0]}</AvatarFallback>
                              </Avatar>
                              {project.lead.name}
                           </span>
                        ) : (
                           <span className="text-muted-foreground">Unassigned</span>
                        )}
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                           {dateLabel(project.startDate)} <ArrowRight className="size-3" />{' '}
                           {dateLabel(project.targetDate)}
                        </span>
                        {project.team && (
                           <span>
                              {project.team.icon ?? '👥'} {project.team.name}
                           </span>
                        )}
                     </div>
                  </div>
               </div>

               <div className="mt-10">
                  <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground mb-2">
                     Description
                  </div>
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                     {project.description || 'No description yet.'}
                  </p>
               </div>
            </div>
         </div>

         <aside className="hidden xl:flex w-[380px] shrink-0 border-l h-full overflow-y-auto bg-container">
            <div className="w-full px-5 py-5">
               <h3 className="text-sm font-medium mb-3">Progress</h3>
               <div className="flex items-center justify-between text-sm mb-5">
                  <span>
                     {completed} of {issues.length} completed
                  </span>
                  <span className="font-medium">{progress}%</span>
               </div>
               <div className="h-1.5 rounded-full bg-accent overflow-hidden mb-7">
                  <div className="h-full bg-indigo-500" style={{ width: `${progress}%` }} />
               </div>
               <div className="flex items-center gap-2 mb-3">
                  <ListChecks className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Milestones</h3>
               </div>
               {milestones.length ? (
                  <div className="space-y-2">
                     {milestones.map((milestone) => (
                        <div
                           key={milestone.id}
                           className="flex items-center justify-between gap-3 text-sm"
                        >
                           <span
                              className={
                                 milestone.completedAt ? 'line-through text-muted-foreground' : ''
                              }
                           >
                              {milestone.title}
                           </span>
                           <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {milestone.targetDate ? dateLabel(milestone.targetDate) : 'No date'}
                           </span>
                        </div>
                     ))}
                  </div>
               ) : (
                  <p className="text-sm text-muted-foreground">No milestones yet.</p>
               )}
               <div className="mt-7 border-t pt-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="size-4" /> {project._count.issues} total issues
               </div>
            </div>
         </aside>
      </div>
   );
}
