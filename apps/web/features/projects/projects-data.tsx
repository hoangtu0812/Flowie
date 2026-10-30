'use client';

import { health as healthOptions } from '@/lib/project-presentations';
import { priorities } from '@/lib/priority-presentations';
import type { Status } from '@/lib/status-presentations';
import { status as circleStatuses } from '@/mock-data/status';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import type { Project } from '@/types/projects';
import { projectIcon } from '@/components/common/projects/project-icon';
import {
   createContext,
   type ReactNode,
   useCallback,
   useContext,
   useEffect,
   useRef,
   useState,
} from 'react';
import { responseEnvelope } from '@/lib/http';
import type { PageMetadata } from '@/features/issues/issue-query';
import { useParams } from 'next/navigation';
import { RecoveryScreen } from '@/features/shared/recovery-screen';

type ApiProject = {
   id: string;
   slug?: string;
   name: string;
   icon?: string | null;
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
   issueSummary?: { total: number; completed?: number };
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
   templateId?: string;
   description?: string;
};

export type ProjectTemplateOption = {
   id: string;
   name: string;
   description: string | null;
   type: string;
};

type ProjectData = {
   workspaceId?: string;
   workspaceLoading: boolean;
   error?: string;
   pageError?: string;
   projectPage?: PageMetadata;
   loadingMore: boolean;
   loadMoreProjects: () => Promise<void>;
   resolvedTeamId?: string;
   allProjects: Array<Project & { issueCount: number }>;
   teamGroups: Array<{ id: string; name: string; icon?: string }>;
   projectTemplates: ProjectTemplateOption[];
   workspaceMembers: ProjectListMember[];
   createProject: (values: CreateProjectValues) => Promise<void>;
   updateProject: (projectId: string, update: ProjectListUpdate) => Promise<void>;
   /** Refetch the project list so bars reflect edits made outside this store. */
   refreshProjects: () => Promise<void>;
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
   const completed =
      project.issueSummary?.completed ??
      project.issues?.filter((issue) => issue.status.category.toLowerCase() === 'completed')
         .length ??
      0;
   const total = project.issueSummary?.total ?? project.issues?.length ?? 0;
   const priority =
      priorities.find(
         (item) => item.id === (project.priority === 'none' ? 'no-priority' : project.priority)
      ) ?? priorities[0];
   const health = healthOptions.find((item) => item.id === project.health) ?? healthOptions[0];

   return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      status: mapStatus(project.status),
      icon: projectIcon(project.icon),
      percentComplete: total ? Math.round((completed / total) * 100) : 0,
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
   const { orgId } = useParams<{ orgId: string }>();
   const [error, setError] = useState<string>();
   const [pageError, setPageError] = useState<string>();
   const [refreshKey, setRefreshKey] = useState(0);
   const [allProjects, setAllProjects] = useState<Array<Project & { issueCount: number }>>([]);
   const [teamGroups, setTeamGroups] = useState<Array<{ id: string; name: string; icon?: string }>>(
      []
   );
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [workspaceLoading, setWorkspaceLoading] = useState(true);
   const [resolvedTeamId, setResolvedTeamId] = useState<string>();
   const [workspaceMembers, setWorkspaceMembers] = useState<ProjectListMember[]>([]);
   const [projectTemplates, setProjectTemplates] = useState<ProjectTemplateOption[]>([]);

   const [projectPage, setProjectPage] = useState<PageMetadata>();
   const [loadingMore, setLoadingMore] = useState(false);
   const alive = useRef(true);
   const generation = useRef(0);
   useEffect(() => {
      alive.current = true;
      return () => {
         alive.current = false;
         generation.current++;
      };
   }, []);
   useEffect(() => {
      const request = ++generation.current;
      const current = () => alive.current && request === generation.current;
      setWorkspaceLoading(true);
      setError(undefined);
      setPageError(undefined);
      void (async () => {
         const workspace = await loadCurrentWorkspace(orgId);
         const [membersResponse, teamsResponse, templatesResponse] = await Promise.all([
            authenticatedFetch(`${api}/workspaces/${workspace.id}/members`),
            authenticatedFetch(`${api}/teams?workspaceId=${workspace.id}`),
            authenticatedFetch(`${api}/projects/templates?workspaceId=${workspace.id}`),
         ]);
         if (!membersResponse.ok || !teamsResponse.ok || !templatesResponse.ok)
            throw new Error('Could not load project options.');
         const members = (await membersResponse.json()).data as Array<{
            status: string;
            user: ProjectListMember;
         }>;
         const teams = (await teamsResponse.json()).data as ApiWorkspaceTeam[];
         const templates = (await templatesResponse.json()).data as ProjectTemplateOption[];
         const team = teamIdentifier
            ? teams.find((row) => row.id === teamIdentifier || row.identifier === teamIdentifier)
                 ?.id
            : undefined;
         if (teamIdentifier && !team) throw new Error('This team is unavailable.');
         const query = new URLSearchParams({ workspaceId: workspace.id, limit: '100' });
         if (team) query.set('teamId', team);
         const page = await responseEnvelope<ApiProject[], PageMetadata>(
            await authenticatedFetch(`${api}/projects?${query}`)
         );
         if (!current()) return;
         setWorkspaceId(workspace.id);
         setResolvedTeamId(team);
         setWorkspaceMembers(
            members.filter((row) => row.status === 'ACTIVE').map((row) => row.user)
         );
         setProjectTemplates(templates);
         setTeamGroups(
            teams.map((row) => ({ id: row.id, name: row.name, icon: row.icon ?? undefined }))
         );
         setAllProjects(page.data.map(mapProject));
         setProjectPage(page.meta);
      })()
         .catch((reason: unknown) => {
            if (current())
               setError(reason instanceof Error ? reason.message : 'Could not load projects.');
         })
         .finally(() => {
            if (current()) setWorkspaceLoading(false);
         });
   }, [teamIdentifier, orgId, refreshKey]);
   const loadMoreProjects = useCallback(async () => {
      if (!workspaceId || !projectPage?.nextCursor || loadingMore) return;
      const request = generation.current;
      setLoadingMore(true);
      setPageError(undefined);
      try {
         const query = new URLSearchParams({
            workspaceId,
            limit: '100',
            cursor: projectPage.nextCursor,
         });
         if (resolvedTeamId) query.set('teamId', resolvedTeamId);
         const page = await responseEnvelope<ApiProject[], PageMetadata>(
            await authenticatedFetch(`${api}/projects?${query}`)
         );
         if (!alive.current || generation.current !== request) return;
         setAllProjects((previous) => [
            ...new Map(
               [...previous, ...page.data.map(mapProject)].map((row) => [row.id, row])
            ).values(),
         ]);
         setProjectPage(page.meta);
      } catch (reason) {
         if (alive.current && generation.current === request)
            setPageError(
               reason instanceof Error ? reason.message : 'Could not load more projects.'
            );
      } finally {
         if (alive.current && generation.current === request) setLoadingMore(false);
      }
   }, [workspaceId, projectPage, resolvedTeamId, loadingMore]);

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
         if (!alive.current) return;
         setAllProjects((projects) =>
            projects.map((project) =>
               project.id === projectId ? mapProject(payload.data) : project
            )
         );
      },
      [workspaceId]
   );

   const refreshProjects = useCallback(async () => {
      setRefreshKey((value) => value + 1);
   }, []);

   const createProject = useCallback(
      async ({ name, identifier, teamId, templateId, description }: CreateProjectValues) => {
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
               ...(templateId ? { templateId } : {}),
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
         if (!alive.current) return;
         if (!resolvedTeamId || payload.data.teamId === resolvedTeamId) {
            setAllProjects((projects) => [mapProject(payload.data), ...projects]);
            setProjectPage((page) => (page ? { ...page, total: page.total + 1 } : page));
         }
      },
      [workspaceId, resolvedTeamId]
   );

   return {
      workspaceId,
      workspaceLoading,
      error,
      pageError,
      projectPage,
      loadingMore,
      loadMoreProjects,
      resolvedTeamId,
      allProjects,
      teamGroups,
      projectTemplates,
      workspaceMembers,
      createProject,
      updateProject,
      refreshProjects,
   };
}

export function ProjectsDataProvider({
   teamIdentifier,
   children,
}: {
   teamIdentifier?: string;
   children: ReactNode;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   return (
      <ProjectsDataScope key={`${orgId}:${teamIdentifier}`} teamIdentifier={teamIdentifier}>
         {children}
      </ProjectsDataScope>
   );
}

function ProjectsDataScope({
   teamIdentifier,
   children,
}: {
   teamIdentifier?: string;
   children: ReactNode;
}) {
   const value = useProjectsDataSource(teamIdentifier);
   if (value.error)
      return (
         <RecoveryScreen
            title="Could not load projects"
            message={value.error}
            retry={() => void value.refreshProjects()}
         />
      );
   return <ProjectsDataContext.Provider value={value}>{children}</ProjectsDataContext.Provider>;
}

export function useProjectsData(): ProjectData {
   const value = useContext(ProjectsDataContext);
   if (!value) throw new Error('useProjectsData must be used inside ProjectsDataProvider.');
   return value;
}
