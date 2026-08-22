'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { Activity, Calendar, ListChecks } from 'lucide-react';
import { useLiveProject, type LiveActivity } from './use-live-project';

interface ProjectActivityProps {
   projectId: string;
}

const activityLabel = (activity: LiveActivity) => {
   switch (activity.type) {
      case 'project.created':
         return 'created this project';
      case 'project.updated':
         return 'updated this project';
      case 'project.archived':
         return 'archived this project';
      case 'project.restored':
         return 'restored this project';
      default:
         return activity.type.replaceAll('.', ' ');
   }
};

/** Project Activity keeps the original detail tab, with a server-backed audit timeline. */
export default function ProjectActivity({ projectId }: ProjectActivityProps) {
   const { project, issues, activities, loading, error } = useLiveProject(projectId);

   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading activity…</div>;
   if (error || !project)
      return (
         <div className="px-8 py-10 text-sm text-destructive">{error ?? 'Project not found.'}</div>
      );

   const completed = issues.filter((issue) => issue.status.category === 'COMPLETED').length;
   const progress = issues.length ? Math.round((completed / issues.length) * 100) : 0;

   return (
      <div className="w-full h-full flex overflow-hidden">
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 lg:px-10 py-8">
               <div className="flex items-center gap-2 mb-6">
                  <Activity className="size-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Activity</h2>
               </div>

               {activities.length === 0 ? (
                  <div className="border rounded-lg px-5 py-10 text-center">
                     <p className="text-sm font-medium">No project activity yet</p>
                     <p className="mt-1 text-sm text-muted-foreground">
                        Changes to this project will appear here.
                     </p>
                  </div>
               ) : (
                  <div className="relative border-l ml-3 space-y-5 pb-5">
                     {activities.map((activity) => {
                        const actorName = activity.actor?.name ?? 'System';
                        return (
                           <div key={activity.id} className="relative pl-7">
                              <span className="absolute -left-[9px] top-1 size-4 rounded-full border bg-background" />
                              <div className="border rounded-lg px-4 py-3">
                                 <div className="flex items-center gap-2 text-sm">
                                    <Avatar className="size-5">
                                       <AvatarImage
                                          src={activity.actor?.avatarUrl ?? undefined}
                                          alt={actorName}
                                       />
                                       <AvatarFallback>{actorName[0]}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium">{actorName}</span>
                                    <span className="text-muted-foreground">
                                       {activityLabel(activity)}
                                    </span>
                                    <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                                       {format(new Date(activity.createdAt), 'MMM d, yyyy · p')}
                                    </span>
                                 </div>
                              </div>
                           </div>
                        );
                     })}
                  </div>
               )}
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
               <div className="h-1.5 rounded-full bg-accent overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${progress}%` }} />
               </div>
               <div className="mt-7 border-t pt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <ListChecks className="size-4" /> {project._count.issues} total issues
               </div>
               <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="size-4" /> {activities.length} recorded activities
               </div>
            </div>
         </aside>
      </div>
   );
}
