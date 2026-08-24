'use client';

import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { SearchIssues } from '@/components/common/issues/search-issues';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Issue } from '@/mock-data/issues';
import { priorities } from '@/mock-data/priorities';
import { statusUserColors } from '@/mock-data/users';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useSearchStore } from '@/store/search-store';
import { useViewStore } from '@/store/view-store';
import { formatDistanceToNowStrict } from 'date-fns';
import { FolderKanban } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { useLiveMember } from './use-live-members';

interface BreakdownRow {
   key: string;
   label: string;
   leading: React.ReactNode;
   count: number;
}

function countBy(issues: Issue[], keyOf: (issue: Issue) => string[]): Map<string, number> {
   const map = new Map<string, number>();
   for (const issue of issues) {
      for (const key of keyOf(issue)) {
         map.set(key, (map.get(key) ?? 0) + 1);
      }
   }
   return map;
}

function BreakdownList({ rows }: { rows: BreakdownRow[] }) {
   if (rows.length === 0) {
      return <p className="text-xs text-muted-foreground px-1 py-3">Nothing to show yet.</p>;
   }
   return (
      <div className="flex flex-col">
         {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3 py-2">
               <div className="flex items-center gap-2 min-w-0">
                  {row.leading}
                  <span className="text-sm truncate">{row.label}</span>
               </div>
               <span className="text-sm text-muted-foreground shrink-0">{row.count}</span>
            </div>
         ))}
      </div>
   );
}

/** Client-only relative/local time values (avoid SSR hydration mismatches). */
function useClientTimes(joinedAt?: string) {
   const [joinedAgo, setJoinedAgo] = useState<string | null>(null);

   useEffect(() => {
      if (joinedAt)
         setJoinedAgo(formatDistanceToNowStrict(new Date(joinedAt), { addSuffix: true }));
   }, [joinedAt]);

   return { localTime: null, joinedAgo };
}

/**
 * Member profile (Linear-style): assigned / created issues grouped by
 * status, with a right panel showing identity, teams, projects and
 * per-label / priority / project / team breakdowns.
 */
export default function MemberProfile({ memberId }: { memberId: string }) {
   const { member, loading, error } = useLiveMember(memberId);
   const {
      issues,
      statuses,
      loadIssues,
      isLoading: issuesLoading,
      error: issuesError,
   } = useIssuesStore();
   const [activeTab] = useQueryState('tab', parseAsString.withDefault('assigned'));
   const { localTime, joinedAgo } = useClientTimes(member?.joinedAt);
   const { isSearchOpen, searchQuery } = useSearchStore();
   const { viewType } = useViewStore();
   const { filters } = useFilterStore();
   const { openPanel } = useRightPanelStore();

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeGrid = viewType === 'grid';

   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);

   const scopedIssues = useMemo(() => {
      if (activeTab === 'created') {
         return issues.filter((issue) => issue.creator?.id === memberId);
      }
      return issues.filter((issue) => issue.assignee?.id === memberId);
   }, [activeTab, issues, memberId]);

   const displayedIssues = useMemo(
      () => applyIssueFilters(scopedIssues, filters),
      [scopedIssues, filters]
   );

   const memberTeams = useMemo(() => member?.teams ?? [], [member?.teams]);

   const memberProjects = useMemo(() => {
      const fromIssues = displayedIssues
         .map((issue) => issue.project)
         .filter((project): project is NonNullable<typeof project> => Boolean(project));
      const seen = new Set<string>();
      return fromIssues.filter((project) => {
         if (seen.has(project.id)) return false;
         seen.add(project.id);
         return true;
      });
   }, [displayedIssues]);

   const labelRows = useMemo<BreakdownRow[]>(() => {
      const counts = countBy(displayedIssues, (issue) => issue.labels.map((label) => label.id));
      const available = new Map(
         displayedIssues.flatMap((issue) => issue.labels).map((label) => [label.id, label])
      );
      return [...available.values()]
         .map((label) => ({
            key: label.id,
            label: label.name,
            leading: (
               <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: label.color }}
               />
            ),
            count: counts.get(label.id) ?? 0,
         }))
         .sort((a, b) => b.count - a.count);
   }, [displayedIssues]);

   const priorityRows = useMemo<BreakdownRow[]>(() => {
      const counts = countBy(displayedIssues, (issue) => [issue.priority.id]);
      return priorities
         .filter((priority) => counts.has(priority.id))
         .map((priority) => ({
            key: priority.id,
            label: priority.name,
            leading: <priority.icon className="size-3.5 text-muted-foreground shrink-0" />,
            count: counts.get(priority.id) ?? 0,
         }))
         .sort((a, b) => b.count - a.count);
   }, [displayedIssues]);

   const projectRows = useMemo<BreakdownRow[]>(() => {
      const counts = countBy(displayedIssues, (issue) => (issue.project ? [issue.project.id] : []));
      const available = new Map(
         displayedIssues
            .flatMap((issue) => (issue.project ? [issue.project] : []))
            .map((project) => [project.id, project])
      );
      return [...available.values()]
         .map((project) => ({
            key: project.id,
            label: project.name,
            leading: <project.icon className="size-3.5 text-muted-foreground shrink-0" />,
            count: counts.get(project.id) ?? 0,
         }))
         .sort((a, b) => b.count - a.count);
   }, [displayedIssues]);

   const teamRows = useMemo<BreakdownRow[]>(() => {
      const counts = countBy(displayedIssues, (issue) => (issue.team ? [issue.team.id] : []));
      return memberTeams
         .map((team) => ({
            key: team.id,
            label: team.name,
            leading: <span className="text-sm shrink-0">{team.icon ?? '👥'}</span>,
            count: counts.get(team.id) ?? 0,
         }))
         .filter((row) => row.count > 0)
         .sort((a, b) => b.count - a.count);
   }, [displayedIssues, memberTeams]);

   if (loading || issuesLoading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading profile…</div>;
   if (error || issuesError || !member)
      return (
         <div className="px-8 py-10 text-sm text-destructive">
            {error ?? issuesError ?? 'Member not found.'}
         </div>
      );

   if (isSearching) {
      return (
         <div className="w-full h-full">
            <div className="px-6 mb-6">
               <SearchIssues />
            </div>
         </div>
      );
   }

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <IssueFilterBar />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            {/* Issues */}
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={scopedIssues}
                  statuses={statuses}
                  isViewTypeGrid={isViewTypeGrid}
               />
            </div>

            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <InsightsPanel issues={displayedIssues} />
               </aside>
            )}

            {/* Profile panel */}
            {openPanel !== 'hidden' && openPanel !== 'insights' && (
               <aside className="hidden lg:flex flex-col w-[340px] shrink-0 border-l h-full overflow-y-auto bg-container">
                  <div className="px-5 pt-5 pb-4 border-b">
                     <div className="flex items-center gap-3">
                        <div className="relative">
                           <Avatar className="size-11">
                              <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                              <AvatarFallback>{member.name[0]}</AvatarFallback>
                           </Avatar>
                           <span
                              className="border-background absolute -end-0.5 -bottom-0.5 size-3 rounded-full border-2"
                              style={{ backgroundColor: statusUserColors.offline }}
                           />
                        </div>
                        <div className="min-w-0">
                           <h2 className="text-base font-semibold truncate">{member.name}</h2>
                           <p className="text-xs text-muted-foreground truncate">
                              {member.title || member.username || member.email} · Presence
                              unavailable
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
                        <span className="text-muted-foreground shrink-0">Local time</span>
                        <span>{localTime ?? '—'}</span>
                     </div>
                     <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground shrink-0">Joined</span>
                        <span>{joinedAgo ?? '—'}</span>
                     </div>
                     <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground shrink-0">Role</span>
                        <span>{member.workspaceRole === 'MEMBER' ? 'Member' : 'Admin'}</span>
                     </div>
                     <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground shrink-0 pt-0.5">Teams</span>
                        <div className="flex flex-wrap justify-end gap-1.5">
                           {memberTeams.map((team) => (
                              <span
                                 key={team.id}
                                 className="inline-flex items-center gap-1 text-xs bg-accent rounded-md px-1.5 py-0.5"
                              >
                                 {team.icon ?? '👥'} {team.name}
                              </span>
                           ))}
                        </div>
                     </div>
                     <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground shrink-0 pt-0.5">Projects</span>
                        <div className="flex flex-col items-end gap-1 min-w-0">
                           {memberProjects.slice(0, 4).map((project) => (
                              <span
                                 key={project.id}
                                 className="inline-flex items-center gap-1.5 text-xs min-w-0"
                              >
                                 <FolderKanban className="size-3.5 text-muted-foreground shrink-0" />
                                 <span className="truncate max-w-44">{project.name}</span>
                              </span>
                           ))}
                           {memberProjects.length > 4 && (
                              <span className="text-xs text-muted-foreground">
                                 +{memberProjects.length - 4} more
                              </span>
                           )}
                        </div>
                     </div>
                  </div>

                  <div className="px-5 py-4">
                     <Tabs defaultValue="labels">
                        <TabsList className="h-8 bg-transparent gap-1 p-0">
                           <TabsTrigger value="labels" className="text-xs px-2.5 rounded-full">
                              Labels
                           </TabsTrigger>
                           <TabsTrigger value="priority" className="text-xs px-2.5 rounded-full">
                              Priority
                           </TabsTrigger>
                           <TabsTrigger value="projects" className="text-xs px-2.5 rounded-full">
                              Projects
                           </TabsTrigger>
                           <TabsTrigger value="teams" className="text-xs px-2.5 rounded-full">
                              Teams
                           </TabsTrigger>
                        </TabsList>
                        <TabsContent value="labels">
                           <BreakdownList rows={labelRows} />
                        </TabsContent>
                        <TabsContent value="priority">
                           <BreakdownList rows={priorityRows} />
                        </TabsContent>
                        <TabsContent value="projects">
                           <BreakdownList rows={projectRows} />
                        </TabsContent>
                        <TabsContent value="teams">
                           <BreakdownList rows={teamRows} />
                        </TabsContent>
                     </Tabs>
                  </div>
               </aside>
            )}
         </div>
      </div>
   );
}
