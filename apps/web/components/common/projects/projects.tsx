'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { health as healthOptions, Project } from '@/mock-data/projects';
import { priorities } from '@/mock-data/priorities';
import type { Status, StatusCategory } from '@/mock-data/status';
import { Circle, CircleCheck, CircleDashed, CirclePlay, CircleX, FolderKanban } from 'lucide-react';
import { createElement } from 'react';
import { useProjectsFilterStore } from '@/store/projects-filter-store';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { BarChart3 } from 'lucide-react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
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
   const [workspaceMembers, setWorkspaceMembers] = useState<ProjectListMember[]>([]);
   const [projectLabels, setProjectLabels] = useState<ProjectListLabel[]>([]);
   const [projectStatuses, setProjectStatuses] = useState<ProjectListStatus[]>([]);
   const [loadError, setLoadError] = useState<string>();
   const viewType = viewTypes[tab];

   useEffect(() => {
      void (async () => {
         const workspacesResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
         if (!workspacesResponse.ok) throw new Error('Could not load the current workspace.');
         const workspaces = (await workspacesResponse.json()) as {
            data: Array<{ workspace: { id: string } }>;
         };
         const workspaceId = workspaces.data[0]?.workspace.id;
         if (!workspaceId) throw new Error('No workspace is available for this account.');
         const [response, membersResponse, labelsResponse] = await Promise.all([
            fetch(`${api}/projects?workspaceId=${workspaceId}`, { credentials: 'include' }),
            fetch(`${api}/workspaces/${workspaceId}/members`, { credentials: 'include' }),
            fetch(`${api}/projects/labels?workspaceId=${workspaceId}`, { credentials: 'include' }),
         ]);
         if (!response.ok || !membersResponse.ok || !labelsResponse.ok)
            throw new Error('Could not load projects.');
         const payload = (await response.json()) as { data: ApiProject[] };
         const membersPayload = (await membersResponse.json()) as {
            data: Array<{
               status: string;
               user: { id: string; name: string; avatarUrl: string | null };
            }>;
         };
         const labelsPayload = (await labelsResponse.json()) as { data: ProjectListLabel[] };
         setWorkspaceId(workspaceId);
         setWorkspaceMembers(
            membersPayload.data
               .filter((member) => member.status === 'ACTIVE')
               .map((member) => member.user)
         );
         setProjectLabels(labelsPayload.data);
         setAllProjects(payload.data.map(mapProject));
         setProjectStatuses(uniqueProjectStatuses(payload.data));
         setTeamGroups(
            Array.from(
               new Map(
                  payload.data
                     .map((project) => project.team)
                     .filter((team): team is NonNullable<typeof team> => Boolean(team))
                     .map((team) => [
                        team.id,
                        { id: team.id, name: team.name, icon: team.icon ?? undefined },
                     ])
               ).values()
            )
         );
      })().catch((error: unknown) =>
         setLoadError(error instanceof Error ? error.message : 'Could not load projects.')
      );
   }, []);

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
         list = list.filter((project) => project.teamId === teamId);
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
   }, [allProjects, tab, closedProjects, filters, ordering, teamId]);

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
                     projectLabels={projectLabels}
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
