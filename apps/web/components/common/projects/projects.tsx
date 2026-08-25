'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { health as healthOptions } from '@/lib/project-presentations';
import type { Project } from '@/types/projects';
import { priorities } from '@/lib/priority-presentations';
import type { Status, StatusCategory } from '@/lib/status-presentations';
import { Circle, CircleCheck, CircleDashed, CirclePlay, CircleX, FolderKanban } from 'lucide-react';
import { createElement } from 'react';
import { useProjectsFilterStore } from '@/store/projects-filter-store';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { BarChart3 } from 'lucide-react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { loadCurrentWorkspace } from '@/lib/workspaces';
import { Filter } from '@/components/layout/headers/projects/filter';
import ProjectsBoard from './projects-board';
import { ProjectsDisplayOptions } from './projects-display-options';
import ProjectsInsightsPanel from './projects-insights-panel';
import ProjectsList from './projects-list';
import ProjectsTimeline from './projects-timeline';

export interface ProjectGroup {
   id: string;
   name: string;
   icon?: string;
   projects: Project[];
}

type ApiProject = {
   id: string;
   name: string;
   status: string;
   priority: string;
   health: string;
   startDate: string | null;
   targetDate: string | null;
   createdAt: string;
   teamId: string | null;
   team: { id: string; name: string; icon: string | null } | null;
   lead: { id: string; name: string; avatarUrl: string | null } | null;
   labelLinks: Array<{ label: { id: string; name: string; color: string } }>;
   issues: Array<{
      id: string;
      status: { category: string };
      assignee: { id: string; name: string; avatarUrl: string | null } | null;
   }>;
   _count: { issues: number };
   favorites?: Array<{ userId: string }>;
};
type ApiProjectStatus = {
   id: string;
   name: string;
   category: 'backlog' | 'planned' | 'in-progress' | 'completed' | 'canceled';
   color: string;
};
type ApiWorkspaceTeam = {
   id: string;
   identifier: string;
   name: string;
   icon: string | null;
};

export type ProjectListMember = {
   id: string;
   name: string;
   avatarUrl: string | null;
};

export type ProjectListLabel = {
   id: string;
   name: string;
   color: string;
};

export type ProjectListStatus = Status;

export type ProjectListUpdate = {
   leadId?: string | null;
   priority?: string;
   status?: string;
   targetDate?: string | null;
   labelIds?: string[];
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const mapStatus = (value: string): ProjectListStatus => {
   const normalized = value.trim().toLowerCase().replace(/_/g, '-');
   const category =
      normalized === 'completed' || normalized === 'done'
         ? 'completed'
         : normalized === 'canceled' || normalized === 'cancelled'
           ? 'canceled'
           : normalized === 'started' || normalized === 'in-progress' || normalized === 'active'
             ? 'started'
             : normalized === 'backlog'
               ? 'backlog'
               : 'unstarted';
   const icon =
      category === 'completed'
         ? CircleCheck
         : category === 'canceled'
           ? CircleX
           : category === 'started'
             ? CirclePlay
             : category === 'backlog'
               ? CircleDashed
               : Circle;
   const color =
      category === 'completed'
         ? '#5e6ad2'
         : category === 'canceled'
           ? '#95a2b3'
           : category === 'started'
             ? '#facc15'
             : category === 'backlog'
               ? '#95a2b3'
               : '#99a2b2';
   return {
      id: value,
      name: value
         .trim()
         .replace(/[_-]+/g, ' ')
         .replace(/\b\w/g, (character) => character.toUpperCase()),
      color,
      category: category as StatusCategory,
      icon: () => createElement(icon, { className: 'size-4' }),
   };
};

const uniqueProjectStatuses = (projects: ApiProject[]): ProjectListStatus[] =>
   [
      ...new Map(projects.map((project) => [project.status, mapStatus(project.status)])).values(),
   ].sort((left, right) => left.name.localeCompare(right.name));

const mapConfiguredStatus = (status: ApiProjectStatus): ProjectListStatus => {
   const category: StatusCategory =
      status.category === 'planned'
         ? 'unstarted'
         : status.category === 'in-progress'
           ? 'started'
           : status.category;
   const Icon =
      category === 'completed'
         ? CircleCheck
         : category === 'canceled'
           ? CircleX
           : category === 'started'
             ? CirclePlay
             : category === 'backlog'
               ? CircleDashed
               : Circle;
   return {
      id: status.name,
      name: status.name
         .replace(/[_-]+/g, ' ')
         .replace(/\b\w/g, (character) => character.toUpperCase()),
      color: status.color,
      category,
      icon: () => createElement(Icon, { className: 'size-4' }),
   };
};

const mapProject = (project: ApiProject): Project & { issueCount: number } => {
   const completed = project.issues.filter((issue) => issue.status.category === 'COMPLETED').length;
   const lead = project.lead
      ? {
           id: project.lead.id,
           name: project.lead.name,
           avatarUrl: project.lead.avatarUrl ?? '',
           email: '',
           status: 'offline' as const,
           role: 'Member' as const,
           joinedDate: project.createdAt,
           teamIds: [],
           timezone: 'UTC',
        }
      : {
           id: `unassigned-${project.id}`,
           name: 'Unassigned',
           avatarUrl: '',
           email: '',
           status: 'offline' as const,
           role: 'Member' as const,
           joinedDate: project.createdAt,
           teamIds: [],
           timezone: 'UTC',
        };
   const priority =
      priorities.find(
         (item) => item.id === (project.priority === 'none' ? 'no-priority' : project.priority)
      ) ?? priorities[0];
   const health = healthOptions.find((item) => item.id === project.health) ?? healthOptions[0];

   return {
      id: project.id,
      name: project.name,
      status: mapStatus(project.status),
      icon: FolderKanban,
      percentComplete: project.issues.length
         ? Math.round((completed / project.issues.length) * 100)
         : 0,
      startDate: project.startDate ?? project.createdAt,
      targetDate: project.targetDate ?? undefined,
      lead,
      priority,
      health,
      teamId: project.teamId ?? '',
      labels: project.labelLinks.map((link) => link.label),
      issueCount: project._count.issues,
      isFavorite: Boolean(project.favorites?.length),
   };
};

const TABS = ['all', 'active'] as const;

const TAB_ITEMS: { label: string; value: (typeof TABS)[number] }[] = [
   { label: 'All projects', value: 'all' },
   { label: 'Active projects', value: 'active' },
];

/** Status categories considered "active" for the Active projects tab. */
const ACTIVE_CATEGORIES = new Set(['triage', 'backlog', 'unstarted', 'started']);
/** Categories hidden by "Show closed projects: Hide closed". */
const CLOSED_CATEGORIES = new Set(['completed', 'canceled']);

/**
 * Projects page. With a `teamId` the whole page (tabs, filters, display
 * options, views, insights) is scoped to that team's projects.
 */
export default function Projects({ teamId }: { teamId?: string }) {
   const { filters } = useProjectsFilterStore();
   const { viewTypes, grouping, ordering, closedProjects, showEmptyGroups } =
      useProjectsDisplayStore();
   const { openPanel, togglePanel } = useRightPanelStore();
   const [tab, setTab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('all'));
   const [allProjects, setAllProjects] = useState<Array<Project & { issueCount: number }>>([]);
   const [teamGroups, setTeamGroups] = useState<Array<{ id: string; name: string; icon?: string }>>(
      []
   );
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [resolvedTeamId, setResolvedTeamId] = useState<string>();
   const [workspaceMembers, setWorkspaceMembers] = useState<ProjectListMember[]>([]);
   const [projectStatuses, setProjectStatuses] = useState<ProjectListStatus[]>([]);
   const [loadError, setLoadError] = useState<string>();
   const viewType = viewTypes[tab];

   useEffect(() => {
      void (async () => {
         const workspaceId = (await loadCurrentWorkspace()).id;
         const [response, membersResponse, statusesResponse, teamsResponse] = await Promise.all([
            fetch(`${api}/projects?workspaceId=${workspaceId}`, { credentials: 'include' }),
            fetch(`${api}/workspaces/${workspaceId}/members`, { credentials: 'include' }),
            fetch(`${api}/projects/statuses?workspaceId=${workspaceId}`, {
               credentials: 'include',
            }),
            fetch(`${api}/teams?workspaceId=${workspaceId}`, { credentials: 'include' }),
         ]);
         if (!response.ok || !membersResponse.ok || !statusesResponse.ok || !teamsResponse.ok)
            throw new Error('Could not load projects.');
         const payload = (await response.json()) as { data: ApiProject[] };
         const membersPayload = (await membersResponse.json()) as {
            data: Array<{
               status: string;
               user: { id: string; name: string; avatarUrl: string | null };
            }>;
         };
         const statusesPayload = (await statusesResponse.json()) as { data: ApiProjectStatus[] };
         const teamsPayload = (await teamsResponse.json()) as { data: ApiWorkspaceTeam[] };
         setWorkspaceId(workspaceId);
         setResolvedTeamId(
            teamId
               ? teamsPayload.data.find((team) => team.id === teamId || team.identifier === teamId)
                    ?.id
               : undefined
         );
         setWorkspaceMembers(
            membersPayload.data
               .filter((member) => member.status === 'ACTIVE')
               .map((member) => member.user)
         );
         setAllProjects(payload.data.map(mapProject));
         setProjectStatuses(
            statusesPayload.data.length
               ? statusesPayload.data.map(mapConfiguredStatus)
               : uniqueProjectStatuses(payload.data)
         );
         setTeamGroups(
            teamsPayload.data.map((team) => ({
               id: team.id,
               name: team.name,
               icon: team.icon ?? undefined,
            }))
         );
      })().catch((error: unknown) =>
         setLoadError(error instanceof Error ? error.message : 'Could not load projects.')
      );
   }, [teamId]);

   const updateProject = async (projectId: string, update: ProjectListUpdate) => {
      if (!workspaceId) throw new Error('Workspace is not ready yet.');
      setLoadError(undefined);
      const response = await fetch(`${api}/projects/${projectId}?workspaceId=${workspaceId}`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         credentials: 'include',
         body: JSON.stringify(update),
      });
      if (!response.ok) {
         const payload = (await response.json().catch(() => null)) as {
            message?: string | string[];
         } | null;
         const message = Array.isArray(payload?.message)
            ? payload.message.join(' ')
            : (payload?.message ?? 'Could not update project.');
         setLoadError(message);
         throw new Error(message);
      }
      const payload = (await response.json()) as { data: ApiProject };
      setProjectStatuses((statuses) => {
         const updated = mapStatus(payload.data.status);
         return statuses.some((status) => status.id === updated.id)
            ? statuses
            : [...statuses, updated].sort((left, right) => left.name.localeCompare(right.name));
      });
      setAllProjects((projects) =>
         projects.map((project) => (project.id === projectId ? mapProject(payload.data) : project))
      );
   };

   const displayed = useMemo(() => {
      let list = allProjects.slice();

      if (teamId) {
         if (!resolvedTeamId) return [];
         list = list.filter((project) => project.teamId === resolvedTeamId);
      }
      if (tab === 'active') {
         list = list.filter((project) => ACTIVE_CATEGORIES.has(project.status.category));
      }
      if (closedProjects === 'hide') {
         list = list.filter((project) => !CLOSED_CATEGORIES.has(project.status.category));
      }
      if (filters.health.length > 0) {
         const healthSet = new Set(filters.health);
         list = list.filter((project) => healthSet.has(project.health.id));
      }
      if (filters.priority.length > 0) {
         const prioritySet = new Set(filters.priority);
         list = list.filter((project) => prioritySet.has(project.priority.id));
      }

      const compare = (a: Project, b: Project) => {
         switch (ordering) {
            case 'title':
               return a.name.localeCompare(b.name);
            case 'target-date':
               return (a.targetDate ?? '').localeCompare(b.targetDate ?? '');
            case 'start-date':
            default:
               return a.startDate.localeCompare(b.startDate);
         }
      };
      return list.sort(compare);
   }, [allProjects, tab, closedProjects, filters, ordering, resolvedTeamId, teamId]);

   const groups = useMemo<ProjectGroup[]>(() => {
      if (grouping === 'none') {
         return [{ id: 'all', name: 'All projects', projects: displayed }];
      }
      const grouped = teamGroups
         .map((team) => ({
            id: team.id,
            name: team.name,
            icon: team.icon,
            projects: displayed.filter((project) => project.teamId === team.id),
         }))
         .filter((group) => showEmptyGroups || group.projects.length > 0);
      const unassigned = displayed.filter((project) => !project.teamId);
      if (unassigned.length > 0 || showEmptyGroups) {
         grouped.push({
            id: 'unassigned',
            name: 'Unassigned',
            icon: undefined,
            projects: unassigned,
         });
      }
      return grouped;
   }, [displayed, grouping, showEmptyGroups, teamGroups]);

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         {/* Tabs + view controls (Linear-style) */}
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10 shrink-0">
            <div className="flex items-center gap-1">
               {TAB_ITEMS.map((item) => {
                  const isActive = tab === item.value;
                  return (
                     <button
                        key={item.value}
                        type="button"
                        onClick={() => void setTab(item.value === 'all' ? null : item.value)}
                        className={cn(
                           'px-2.5 h-7 inline-flex items-center rounded-full border text-xs font-medium transition-colors',
                           isActive
                              ? 'bg-accent text-foreground border-border'
                              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
                        )}
                     >
                        {item.label}
                     </button>
                  );
               })}
            </div>
            <div className="flex items-center gap-1">
               <Filter />
               <ProjectsDisplayOptions />
               <Button
                  size="xs"
                  variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
                  onClick={() => togglePanel('insights')}
                  aria-label="Toggle projects insights panel"
               >
                  <BarChart3 className="size-4" />
               </Button>
            </div>
         </div>

         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               {viewType === 'timeline' && <ProjectsTimeline groups={groups} />}
               {viewType === 'board' && <ProjectsBoard groups={groups} />}
               {viewType === 'list' && (
                  <ProjectsList
                     groups={groups}
                     workspaceId={workspaceId}
                     workspaceMembers={workspaceMembers}
                     projectStatuses={projectStatuses}
                     onUpdateProject={updateProject}
                  />
               )}
            </div>

            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[360px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <ProjectsInsightsPanel projects={displayed} groups={groups} />
               </aside>
            )}
         </div>
         {loadError && <p className="px-6 py-3 text-sm text-destructive">{loadError}</p>}
      </div>
   );
}
