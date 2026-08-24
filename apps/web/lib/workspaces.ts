const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type WorkspaceSummary = {
   id: string;
   name: string;
   slug: string;
   organization?: { id: string; name: string; slug: string };
};

export type WorkspaceMembership = {
   id: string;
   role: 'OWNER' | 'ADMIN' | 'MEMBER';
   workspace: WorkspaceSummary;
};

export async function loadWorkspaceMemberships(): Promise<WorkspaceMembership[]> {
   const response = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
   if (!response.ok) throw new Error('Could not load workspaces.');
   return ((await response.json()) as { data: WorkspaceMembership[] }).data;
}

export function workspaceSlugFromLocation(): string | undefined {
   if (typeof window === 'undefined') return undefined;
   const segment = window.location.pathname.split('/').filter(Boolean)[0];
   return segment ? decodeURIComponent(segment) : undefined;
}

export async function loadCurrentWorkspaceMembership(
   workspaceSlug = workspaceSlugFromLocation()
): Promise<WorkspaceMembership> {
   if (!workspaceSlug) throw new Error('The workspace URL is missing.');
   const memberships = await loadWorkspaceMemberships();
   const membership = memberships.find(
      ({ workspace }) => workspace.slug === workspaceSlug || workspace.id === workspaceSlug
   );
   if (!membership) throw new Error('This workspace is not available to the current user.');
   return membership;
}

export async function loadCurrentWorkspace(workspaceSlug?: string): Promise<WorkspaceSummary> {
   return (await loadCurrentWorkspaceMembership(workspaceSlug)).workspace;
}
