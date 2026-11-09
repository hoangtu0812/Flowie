import { authenticatedFetch } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type ProjectRepositoryDraft = {
   projectId: string;
   name: string;
   repositoryUrl: string;
   baseBranch: string;
   testCommands: string[][];
   instructions?: string;
};
export type ProjectRepository = ProjectRepositoryDraft & { id: string };

async function request<T>(workspaceId: string, path: string, init?: RequestInit): Promise<T> {
   const response = await authenticatedFetch(
      `${api}/agent-runs/${path}${path.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(workspaceId)}`,
      init
   );
   const body = (await response.json()) as { data: T; message?: string };
   if (!response.ok) throw new Error(body.message ?? 'The repository request failed.');
   return body.data;
}

export async function loadProjectRepositories(workspaceId: string) {
   return request<ProjectRepository[]>(workspaceId, 'repositories');
}

/** Creates a repository, or updates the one with this id (its URL may change). */
/** VI: Tạo repository, hoặc cập nhật repository có id này (được đổi URL). */
export async function configureProjectRepository(
   workspaceId: string,
   draft: ProjectRepositoryDraft,
   repositoryId?: string
) {
   return request(
      workspaceId,
      repositoryId ? `repositories/${encodeURIComponent(repositoryId)}` : 'repositories',
      {
         method: repositoryId ? 'PUT' : 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(draft),
      }
   );
}

export async function removeProjectRepository(workspaceId: string, repositoryId: string) {
   return request(workspaceId, `repositories/${encodeURIComponent(repositoryId)}`, {
      method: 'DELETE',
   });
}
