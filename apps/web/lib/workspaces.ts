const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Refresh tokens are single-use: `/auth/refresh` revokes the session it was
 * given and issues a new cookie pair. A screen loads several protected
 * resources at once, so after the access cookie expires they all see 401 at
 * the same moment — and without this, each would spend the same refresh
 * token. The first call wins, every other one is rejected against the session
 * it just revoked, and the screen renders empty until the user reloads.
 * One shared attempt per burst is what keeps that from happening.
 */
let refreshInFlight: Promise<boolean> | undefined;

function refreshSession(): Promise<boolean> {
   refreshInFlight ??= fetch(`${api}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
         refreshInFlight = undefined;
      });
   return refreshInFlight;
}

/**
 * Workspace is the first protected resource requested after a page reload.
 * If only the durable refresh cookie remains, restore the short-lived access
 * cookie once and retry so a valid session never renders an empty workspace.
 */
export async function authenticatedFetch(url: string, init: RequestInit = {}): Promise<Response> {
   const request = { ...init, credentials: 'include' as const };
   const response = await fetch(url, request);
   if (response.status !== 401) return response;

   if (!(await refreshSession())) return response;
   return fetch(url, request);
}

export type WorkspaceSummary = {
   id: string;
   name: string;
   slug: string;
   icon?: string | null;
   organization?: { id: string; name: string; slug: string };
};

export type WorkspaceMembership = {
   id: string;
   role: 'OWNER' | 'ADMIN' | 'MEMBER';
   workspace: WorkspaceSummary;
};

export async function loadWorkspaceMemberships(): Promise<WorkspaceMembership[]> {
   const response = await authenticatedFetch(`${api}/workspaces/me`);
   if (!response.ok) throw new Error('Could not load workspaces.');
   return ((await response.json()) as { data: WorkspaceMembership[] }).data;
}

export async function createWorkspace(name: string): Promise<WorkspaceSummary> {
   const response = await authenticatedFetch(`${api}/workspaces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
   });
   if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
         message?: string | string[];
      } | null;
      throw new Error(
         Array.isArray(payload?.message)
            ? payload.message[0]
            : (payload?.message ?? 'Could not create workspace.')
      );
   }
   const payload = (await response.json()) as {
      data: { workspaces?: WorkspaceSummary[] };
   };
   const workspace = payload.data.workspaces?.[0];
   if (!workspace) throw new Error('The workspace was created without a valid destination.');
   return workspace;
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
