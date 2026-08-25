'use client';

import { health as healthOptions } from '@/lib/project-presentations';
import { priorities } from '@/lib/priority-presentations';
import type { Status } from '@/lib/status-presentations';
import { status as circleStatuses } from '@/mock-data/status';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import type { Project } from '@/types/projects';
import { FolderKanban } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
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

export type ProjectListUpdate = {
   leadId?: string | null;
   priority?: string;
   health?: string;
   status?: string;
   targetDate?: string | null;
   labelIds?: string[];
};

export type CreateProjectValues = {
   name: string;
   identifier: string;
   teamId?: string;
   description?: string;
};

type ProjectData = {
   workspaceId?: string;
   workspaceLoading: boolean;
   resolvedTeamId?: string;
   allProjects: Array<Project & { issueCount: number }>;
   teamGroups: Array<{ id: string; name: string; icon?: string }>;
   workspaceMembers: ProjectListMember[];
   createProject: (values: CreateProjectValues) => Promise<void>;
   updateProject: (projectId: string, update: ProjectListUpdate) => Promise<void>;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const ProjectsDataContext = createContext<ProjectData | null>(null);

const projectStatusAliases: Record<string, string> = {
   planned: 'to-do',
   completed: 'done',
   todo: 'to-do',
   active: 'in-progress',
   started: 'in-progress',
   cancelled: 'canceled',
};

const mapStatus = (value: string): Status => {
   const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, '-');
   const identifier = projectStatusAliases[normalized] ?? normalized;
   return (
      circleStatuses.find((candidate) => candidate.id === identifier) ??
      circleStatuses.find((candidate) => candidate.id === 'to-do')!
   );
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
   const [workspaceLoading, setWorkspaceLoading] = useState(true);
   const [resolvedTeamId, setResolvedTeamId] = useState<string>();
   const [workspaceMembers, setWorkspaceMembers] = useState<ProjectListMember[]>([]);

   useEffect(() => {
      let current = true;
      setWorkspaceLoading(true);
      void (async () => {
         const workspace = await loadCurrentWorkspace();
         const [projectsResponse, membersResponse, teamsResponse] = await Promise.all([
            authenticatedFetch(`${api}/projects?workspaceId=${workspace.id}`),
            authenticatedFetch(`${api}/workspaces/${workspace.id}/members`),
            authenticatedFetch(`${api}/teams?workspaceId=${workspace.id}`),
         ]);
         if (!projectsResponse.ok || !membersResponse.ok || !teamsResponse.ok) {
            throw new Error('Could not load projects.');
         }
         const projectsPayload = (await projectsResponse.json()) as { data: ApiProject[] };
         const membersPayload = (await membersResponse.json()) as {
            data: Array<{ status: string; user: ProjectListMember }>;
         };
         const teamsPayload = (await teamsResponse.json()) as { data: ApiWorkspaceTeam[] };
         if (!current) return;
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
         setTeamGroups(
            teamsPayload.data.map((team) => ({
               id: team.id,
               name: team.name,
               icon: team.icon ?? undefined,
            }))
         );
      })()
         .catch((error: unknown) => {
            if (current)
               toast.error(error instanceof Error ? error.message : 'Could not load projects.');
         })
         .finally(() => {
            if (current) setWorkspaceLoading(false);
         });
      return () => {
         current = false;
      };
   }, [teamIdentifier]);

   const updateProject = useCallback(
      async (projectId: string, update: ProjectListUpdate) => {
         if (!workspaceId) throw new Error('Workspace is not ready yet.');
         const response = await authenticatedFetch(
            `${api}/projects/${projectId}?workspaceId=${workspaceId}`,
            {
               method: 'PATCH',
               headers: { 'Content-Type': 'application/json' },
               credentials: 'include',
               body: JSON.stringify(update),
            }
         );
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
         setAllProjects((projects) =>
            projects.map((project) =>
               project.id === projectId ? mapProject(payload.data) : project
            )
         );
      },
      [workspaceId]
   );

   const createProject = useCallback(
      async ({ name, identifier, teamId, description }: CreateProjectValues) => {
         if (!workspaceId) throw new Error('Workspace is not ready yet.');
         const response = await authenticatedFetch(`${api}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
               workspaceId,
               name: name.trim(),
               identifier: identifier.trim(),
               ...(teamId ? { teamId } : {}),
               ...(description?.trim() ? { description: description.trim() } : {}),
            }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string | string[];
            } | null;
            throw new Error(
               Array.isArray(payload?.message)
                  ? payload.message.join(' ')
                  : (payload?.message ?? 'Could not create project.')
            );
         }
         const payload = (await response.json()) as { data: ApiProject };
         setAllProjects((projects) => [mapProject(payload.data), ...projects]);
      },
      [workspaceId]
   );

   return {
      workspaceId,
      workspaceLoading,
      resolvedTeamId,
      allProjects,
      teamGroups,
      workspaceMembers,
      createProject,
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
