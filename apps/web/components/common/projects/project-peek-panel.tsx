'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format, parseISO } from 'date-fns';
import {
   ArrowRight,
   Calendar,
   CalendarPlus,
   ChevronRight,
   FolderKanban,
   Plus,
   Star,
   Tag,
   X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { ProjectProgressChart } from './details/project-progress-chart';
import { useLiveProject } from './details/use-live-project';

interface ProjectPeekPanelProps {
   projectId: string;
   onClose: () => void;
}

const formatDay = (iso?: string | null) => (iso ? format(parseISO(iso), 'MMM do') : '—');

const displayValue = (value: string) =>
   value
      .replaceAll('-', ' ')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
   return (
      <div className="flex items-center gap-4 min-h-8">
         <span className="text-sm text-muted-foreground w-24 shrink-0">{label}</span>
         <div className="flex items-center gap-1.5 text-sm min-w-0">{children}</div>
      </div>
   );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
   return (
      <div className={`rounded-xl border bg-container shadow-lg p-4 ${className ?? ''}`}>
         {children}
      </div>
   );
}

/** Floating timeline peek backed solely by persisted Project, Issue, and Milestone data. */
export function ProjectPeekPanel({ projectId, onClose }: ProjectPeekPanelProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const { project, issues, milestones, loading, error } = useLiveProject(projectId);

   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [onClose]);

   const members = useMemo(() => {
      const seen = new Set<string>();
      return issues
         .map((issue) => issue.assignee)
         .filter((assignee): assignee is NonNullable<typeof assignee> => {
            if (!assignee || seen.has(assignee.id)) return false;
            seen.add(assignee.id);
            return true;
         });
   }, [issues]);

   if (loading) {
      return (
         <aside className="absolute top-10 right-2 bottom-2 w-[400px] max-w-[calc(100%-1rem)] z-40">
            <Card>Loading project…</Card>
         </aside>
      );
   }
   if (error || !project) {
      return (
         <aside className="absolute top-10 right-2 bottom-2 w-[400px] max-w-[calc(100%-1rem)] z-40">
            <Card className="text-destructive">{error ?? 'Project not found.'}</Card>
         </aside>
      );
   }

   const started = issues.filter(
      (issue) => issue.status.category.toLowerCase() === 'started'
   ).length;
   const completed = issues.filter(
      (issue) => issue.status.category.toLowerCase() === 'completed'
   ).length;
   const chartStartDate = project.startDate ?? project.createdAt;
   const initiativeNames = project.initiativeLinks.map((link) => link.initiative.name);

   return (
      <aside className="absolute top-10 right-2 bottom-2 w-[400px] max-w-[calc(100%-1rem)] z-40 flex flex-col gap-2 overflow-y-auto">
         <Card className="flex items-center gap-2 py-3">
            <span className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0">
               <FolderKanban className="size-3.5" />
            </span>
            <Link
               href={`/${orgId}/project/${project.id}/overview`}
               className="flex-1 min-w-0 flex items-center gap-1.5 group"
               aria-label="Open project"
            >
               <span className="font-medium truncate group-hover:text-foreground/80 transition-colors">
                  {project.name}
               </span>
               <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
            <button
               disabled
               title="Favorites are not available yet"
               className="text-muted-foreground/50 shrink-0"
               aria-label="Favorites are not available yet"
            >
               <Star className="size-4" />
            </button>
            <button
               onClick={onClose}
               className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
               aria-label="Close panel"
            >
               <X className="size-4" />
            </button>
         </Card>

         <Card>
            <div className="flex items-center justify-between mb-1.5">
               <h3 className="text-sm font-medium">Properties</h3>
               <button
                  disabled
                  title="Project custom properties are not available in this panel"
                  className="text-muted-foreground/50"
                  aria-label="Project custom properties are not available"
               >
                  <Plus className="size-3.5" />
               </button>
            </div>
            <div className="flex flex-col">
               <PropertyRow label="Status">
                  <span>{displayValue(project.status)}</span>
               </PropertyRow>
               <PropertyRow label="Priority">
                  <span>{displayValue(project.priority)}</span>
               </PropertyRow>
               <PropertyRow label="Lead">
                  {project.lead ? (
                     <>
                        <Avatar className="size-5">
                           <AvatarImage
                              src={project.lead.avatarUrl ?? undefined}
                              alt={project.lead.name}
                           />
                           <AvatarFallback>{project.lead.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="truncate max-w-40">{project.lead.name}</span>
                     </>
                  ) : (
                     <span className="text-muted-foreground">Unassigned</span>
                  )}
               </PropertyRow>
               <PropertyRow label="Members">
                  {members.length > 0 ? (
                     <span className="inline-flex items-center gap-1.5">
                        <span className="flex -space-x-1.5">
                           {members.slice(0, 3).map((member) => (
                              <Avatar key={member.id} className="size-5 border-2 border-container">
                                 <AvatarImage
                                    src={member.avatarUrl ?? undefined}
                                    alt={member.name}
                                 />
                                 <AvatarFallback>{member.name[0]}</AvatarFallback>
                              </Avatar>
                           ))}
                        </span>
                        {members.length} {members.length === 1 ? 'member' : 'members'}
                     </span>
                  ) : (
                     <span className="text-muted-foreground">No issue assignees yet</span>
                  )}
               </PropertyRow>
               <PropertyRow label="Dates">
                  <span className="inline-flex items-center gap-1">
                     <Calendar className="size-3.5 text-muted-foreground" />
                     {formatDay(chartStartDate)}
                  </span>
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                     <CalendarPlus className="size-3.5" />
                     {project.targetDate ? (
                        <span className="text-foreground">{formatDay(project.targetDate)}</span>
                     ) : (
                        'Target'
                     )}
                  </span>
               </PropertyRow>
               <PropertyRow label="Team">
                  <span>{project.team?.name ?? 'No team'}</span>
               </PropertyRow>
               <PropertyRow label="Slack">
                  <span className="text-muted-foreground">Unavailable</span>
               </PropertyRow>
               <PropertyRow label="Initiatives">
                  {initiativeNames.length ? (
                     <span className="truncate max-w-44">{initiativeNames.join(', ')}</span>
                  ) : (
                     <span className="text-muted-foreground">No initiative</span>
                  )}
               </PropertyRow>
               <PropertyRow label="Labels">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                     <Tag className="size-3.5" /> Unavailable
                  </span>
               </PropertyRow>
            </div>
         </Card>

         <Card>
            <div className="flex items-center justify-between mb-2">
               <h3 className="text-sm font-medium">Milestones</h3>
               <button
                  disabled
                  title="Create milestones from the Project page"
                  className="text-muted-foreground/50"
                  aria-label="Create milestones from the Project page"
               >
                  <Plus className="size-3.5" />
               </button>
            </div>
            {milestones.length === 0 ? (
               <p className="text-xs text-muted-foreground">
                  No milestones have been created for this project.
               </p>
            ) : (
               <div className="flex flex-col gap-1.5">
                  {milestones.map((milestone) => (
                     <div
                        key={milestone.id}
                        className="flex items-center justify-between gap-2 text-sm"
                     >
                        <span
                           className={
                              milestone.completedAt
                                 ? 'line-through text-muted-foreground truncate'
                                 : 'truncate'
                           }
                        >
                           {milestone.title}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                           {formatDay(milestone.targetDate)}
                        </span>
                     </div>
                  ))}
               </div>
            )}
         </Card>

         <Card>
            <h3 className="text-sm font-medium mb-3">Progress</h3>
            <div className="grid grid-cols-3 gap-2 mb-2">
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#8f9299]" /> Scope
                  </div>
                  <span className="text-sm font-medium">{issues.length}</span>
               </div>
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#facc15]" /> Started
                  </div>
                  <span className="text-sm font-medium">{started}</span>
               </div>
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#6771c5]" /> Completed
                  </div>
                  <span className="text-sm font-medium">{completed}</span>
               </div>
            </div>
            <ProjectProgressChart
               startDate={chartStartDate}
               endDate={project.targetDate ?? chartStartDate}
               scope={issues.length}
               started={started}
               completed={completed}
            />
         </Card>
      </aside>
   );
}
