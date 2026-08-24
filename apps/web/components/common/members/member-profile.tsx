'use client';

import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { formatDistanceToNowStrict } from 'date-fns';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo } from 'react';
import { useLiveMember } from './use-live-members';

interface MemberProfileProps {
   memberId: string;
}

/** Original profile layout backed by workspace members and live issue creator/assignee fields. */
export default function MemberProfile({ memberId }: MemberProfileProps) {
   const { member, loading, error } = useLiveMember(memberId);
   const { issues, statuses, loadIssues, isLoading: issuesLoading } = useIssuesStore();
   const [activeTab] = useQueryState('tab', parseAsString.withDefault('assigned'));
   const { openPanel } = useRightPanelStore();

   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);

   const scopedIssues = useMemo(
      () =>
         issues.filter((issue) =>
            activeTab === 'created'
               ? issue.creator?.id === memberId
               : issue.assignee?.id === memberId
         ),
      [activeTab, issues, memberId]
   );
   const memberProjects = useMemo(() => {
      const seen = new Set<string>();
      return scopedIssues
         .flatMap((issue) => (issue.project ? [issue.project] : []))
         .filter((project) => {
            if (seen.has(project.id)) return false;
            seen.add(project.id);
            return true;
         });
   }, [scopedIssues]);
   const labels = useMemo(() => {
      const counts = new Map<string, { name: string; color: string; count: number }>();
      scopedIssues
         .flatMap((issue) => issue.labels)
         .forEach((label) => {
            const current = counts.get(label.id);
            counts.set(label.id, {
               name: label.name,
               color: label.color,
               count: (current?.count ?? 0) + 1,
            });
         });
      return [...counts.entries()]
         .map(([id, value]) => ({ id, ...value }))
         .sort((a, b) => b.count - a.count);
   }, [scopedIssues]);

   if (loading || issuesLoading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading profile…</div>;
   if (error || !member)
      return (
         <div className="px-8 py-10 text-sm text-destructive">{error ?? 'Member not found.'}</div>
      );

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={scopedIssues}
                  totalIssues={scopedIssues}
                  statuses={statuses}
                  isViewTypeGrid={false}
               />
            </div>
            {openPanel !== 'hidden' && (
               <aside className="hidden lg:flex flex-col w-[340px] shrink-0 border-l h-full overflow-y-auto bg-container">
                  <div className="px-5 pt-5 pb-4 border-b">
                     <div className="flex items-center gap-3">
                        <Avatar className="size-11">
                           <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                           <AvatarFallback>{member.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                           <h2 className="text-base font-semibold truncate">{member.name}</h2>
                           <p className="text-xs text-muted-foreground truncate">
                              {member.title || member.email}
                           </p>
                        </div>
                     </div>
                  </div>
                  <div className="px-5 py-4 border-b flex flex-col gap-2.5 text-sm">
                     <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground shrink-0">Email</span>
                        <span className="truncate">{member.email}</span>
                     </div>
                     <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground shrink-0">Joined</span>
                        <span>
                           {formatDistanceToNowStrict(new Date(member.joinedAt), {
                              addSuffix: true,
                           })}
                        </span>
                     </div>
                     <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground shrink-0">Role</span>
                        <span>{member.workspaceRole === 'MEMBER' ? 'Member' : 'Admin'}</span>
                     </div>
                     <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground shrink-0 pt-0.5">Teams</span>
                        <div className="flex flex-wrap justify-end gap-1.5">
                           {member.teams.map((team) => (
                              <span
                                 key={team.id}
                                 className="inline-flex items-center gap-1 text-xs bg-accent rounded-md px-1.5 py-0.5"
                              >
                                 {team.icon ?? '👥'} {team.name}
                              </span>
                           ))}
                        </div>
                     </div>
                  </div>
                  <div className="px-5 py-4">
                     <Tabs defaultValue="labels">
                        <TabsList className="h-8 bg-transparent gap-1 p-0">
                           <TabsTrigger value="labels" className="text-xs px-2.5 rounded-full">
                              Labels
                           </TabsTrigger>
                           <TabsTrigger value="projects" className="text-xs px-2.5 rounded-full">
                              Projects
                           </TabsTrigger>
                           <TabsTrigger value="teams" className="text-xs px-2.5 rounded-full">
                              Teams
                           </TabsTrigger>
                        </TabsList>
                        <TabsContent value="labels" className="space-y-2">
                           {labels.length ? (
                              labels.map((label) => (
                                 <div key={label.id} className="flex justify-between text-sm">
                                    <span className="inline-flex items-center gap-2">
                                       <span
                                          className="size-2.5 rounded-full"
                                          style={{ backgroundColor: label.color }}
                                       />
                                       {label.name}
                                    </span>
                                    <span className="text-muted-foreground">{label.count}</span>
                                 </div>
                              ))
                           ) : (
                              <p className="text-xs text-muted-foreground py-3">
                                 Nothing to show yet.
                              </p>
                           )}
                        </TabsContent>
                        <TabsContent value="projects" className="space-y-2">
                           {memberProjects.length ? (
                              memberProjects.map((project) => (
                                 <div key={project.id} className="text-sm">
                                    {project.name}
                                 </div>
                              ))
                           ) : (
                              <p className="text-xs text-muted-foreground py-3">
                                 Nothing to show yet.
                              </p>
                           )}
                        </TabsContent>
                        <TabsContent value="teams" className="space-y-2">
                           {member.teams.map((team) => (
                              <div key={team.id} className="text-sm">
                                 {team.icon ?? '👥'} {team.name}
                              </div>
                           ))}
                        </TabsContent>
                     </Tabs>
                  </div>
               </aside>
            )}
         </div>
      </div>
   );
}
