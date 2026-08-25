'use client';

import { health as healthOptions } from '@/lib/project-presentations';
import { priorities } from '@/lib/priority-presentations';
import type { Status, StatusCategory } from '@/lib/status-presentations';
import { loadCurrentWorkspace } from '@/lib/workspaces';
import type { Project } from '@/types/projects';
import { Circle, CircleCheck, CircleDashed, CirclePlay, CircleX, FolderKanban } from 'lucide-react';
import {
   createContext,
   createElement,
   type ReactNode,
   useCallback,
   useContext,
   useEffect,
   useState,
} from 'react';
import { toast } from 'sonner';

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
   issues: Array<{ id: string; status: { category: string } }>;
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

export type ProjectGroup = {
   id: string;
   name: string;
   icon?: string;
   projects: Array<Project & { issueCount: number }>;
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

type ProjectData = {
   workspaceId?: string;
   resolvedTeamId?: string;
   allProjects: Array<Project & { issueCount: number }>;
   teamGroups: Array<{ id: string; name: string; icon?: string }>;
   workspaceMembers: ProjectListMember[];
   projectStatuses: ProjectListStatus[];
   updateProject: (projectId: string, update: ProjectListUpdate) => Promise<void>;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const ProjectsDataContext = createContext<ProjectData | null>(null);

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
      id: value,
      name: value
         .trim()
         .replace(/[_-]+/g, ' ')
         .replace(/\b\w/g, (character) => character.toUpperCase()),
      color:
         category === 'completed'
            ? '#5e6ad2'
            : category === 'canceled' || category === 'backlog'
              ? '#95a2b3'
              : category === 'started'
                ? '#facc15'
                : '#99a2b2',
      category: category as StatusCategory,
      icon: () => createElement(Icon, { className: 'size-4' }),
   };
};

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
      // The presentation type requires a lead today. This is a neutral local
      // projection only for records whose API lead is null; it is never sent
      // to the server and will be removed when Project.lead becomes nullable.
      lead: project.lead
         ? {
              id: project.lead.id,
              name: project.lead.name,
              avatarUrl: project.lead.avatarUrl ?? '',
              email: '',
              status: 'offline',
              role: 'Member',
              joinedDate: project.createdAt,
              teamIds: [],
              timezone: 'UTC',
           }
         : {
              id: `unassigned-${project.id}`,
              name: 'Unassigned',
              avatarUrl: '',
              email: '',
              status: 'offline',
              role: 'Member',
              joinedDate: project.createdAt,
              teamIds: [],
              timezone: 'UTC',
           },
      priority,
      health,
      teamId: project.teamId ?? '',
      labels: project.labelLinks.map((link) => link.label),
      issueCount: project._count.issues,
      isFavorite: Boolean(project.favorites?.length),
   };
};

function useProjectsDataSource(teamIdentifier?: string): ProjectData {
   const [allProjects, setAllProjects] = useState<Array<Project & { issueCount: number }>>([]);
   const [teamGroups, setTeamGroups] = useState<Array<{ id: string; name: string; icon?: string }>>(
      []
   );
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [resolvedTeamId, setResolvedTeamId] = useState<string>();
   const [workspaceMembers, setWorkspaceMembers] = useState<ProjectListMember[]>([]);
   const [projectStatuses, setProjectStatuses] = useState<ProjectListStatus[]>([]);

   useEffect(() => {
      void (async () => {
         const workspace = await loadCurrentWorkspace();
         const [projectsResponse, membersResponse, statusesResponse, teamsResponse] =
            await Promise.all([
               fetch(`${api}/projects?workspaceId=${workspace.id}`, { credentials: 'include' }),
               fetch(`${api}/workspaces/${workspace.id}/members`, { credentials: 'include' }),
               fetch(`${api}/projects/statuses?workspaceId=${workspace.id}`, {
                  credentials: 'include',
               }),
               fetch(`${api}/teams?workspaceId=${workspace.id}`, { credentials: 'include' }),
            ]);
         if (
            !projectsResponse.ok ||
            !membersResponse.ok ||
            !statusesResponse.ok ||
            !teamsResponse.ok
         ) {
            throw new Error('Could not load projects.');
         }
         const projectsPayload = (await projectsResponse.json()) as { data: ApiProject[] };
         const membersPayload = (await membersResponse.json()) as {
            data: Array<{ status: string; user: ProjectListMember }>;
         };
         const statusesPayload = (await statusesResponse.json()) as { data: ApiProjectStatus[] };
         const teamsPayload = (await teamsResponse.json()) as { data: ApiWorkspaceTeam[] };
         setWorkspaceId(workspace.id);
         setResolvedTeamId(
            teamIdentifier
               ? teamsPayload.data.find(
                    (team) => team.id === teamIdentifier || team.identifier === teamIdentifier
                 )?.id
               : undefined
         );
         setWorkspaceMembers(
            membersPayload.data
               .filter((member) => member.status === 'ACTIVE')
               .map((member) => member.user)
         );
         setAllProjects(projectsPayload.data.map(mapProject));
         setProjectStatuses(
            statusesPayload.data.length
               ? statusesPayload.data.map(mapConfiguredStatus)
               : [
                    ...new Map(
                       projectsPayload.data.map((project) => [
                          project.status,
                          mapStatus(project.status),
                       ])
                    ).values(),
                 ]
         );
         setTeamGroups(
            teamsPayload.data.map((team) => ({
               id: team.id,
               name: team.name,
               icon: team.icon ?? undefined,
            }))
         );
      })().catch((error: unknown) => {
         toast.error(error instanceof Error ? error.message : 'Could not load projects.');
      });
   }, [teamIdentifier]);

   const updateProject = useCallback(
      async (projectId: string, update: ProjectListUpdate) => {
         if (!workspaceId) throw new Error('Workspace is not ready yet.');
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
            throw new Error(
               Array.isArray(payload?.message)
                  ? payload.message.join(' ')
                  : (payload?.message ?? 'Could not update project.')
            );
         }
         const payload = (await response.json()) as { data: ApiProject };
         setProjectStatuses((statuses) => {
            const updated = mapStatus(payload.data.status);
            return statuses.some((status) => status.id === updated.id)
               ? statuses
               : [...statuses, updated];
         });
         setAllProjects((projects) =>
            projects.map((project) =>
               project.id === projectId ? mapProject(payload.data) : project
            )
         );
      },
      [workspaceId]
   );

   return {
      workspaceId,
      resolvedTeamId,
      allProjects,
      teamGroups,
      workspaceMembers,
      projectStatuses,
      updateProject,
   };
}

export function ProjectsDataProvider({
   teamIdentifier,
   children,
}: {
   teamIdentifier?: string;
   children: ReactNode;
}) {
   const value = useProjectsDataSource(teamIdentifier);
   return <ProjectsDataContext.Provider value={value}>{children}</ProjectsDataContext.Provider>;
}

export function useProjectsData(): ProjectData {
   const value = useContext(ProjectsDataContext);
   if (!value) throw new Error('useProjectsData must be used inside ProjectsDataProvider.');
   return value;
}
