const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
import { responseData } from './http';
import { appPathname } from './base-path';

/**
 * Refresh tokens are single-use: `/auth/refresh` rotates its secret while
 * retaining the device session ID. A screen loads several protected
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

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'ADMIN_VIEWER';

export type WorkspaceMembership = {
   id: string;
   role: WorkspaceRole;
   workspace: WorkspaceSummary;
};

/**
 * Whether the role may change workspace settings. ADMIN_VIEWER reads admin pages (anything other
 * than MEMBER) but never edits, and the API refuses its writes.
 * VI: Role có được sửa cài đặt workspace hay không. ADMIN_VIEWER đọc được trang quản trị (mọi role
 * VI: khác MEMBER) nhưng không bao giờ sửa, và API từ chối thao tác ghi của role này.
 */
export const managesWorkspace = (role: WorkspaceRole) => role === 'OWNER' || role === 'ADMIN';

export async function loadWorkspaceMemberships(): Promise<WorkspaceMembership[]> {
   const response = await authenticatedFetch(`${api}/workspaces/me`);
   return responseData<WorkspaceMembership[]>(response, 'Could not load workspaces.');
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
   const segment = appPathname().split('/').filter(Boolean)[0];
   return segment ? decodeURIComponent(segment) : undefined;
}

// Earlier slugs already resolved in this tab, so every loader on a page asks the API once.
// VI: Các slug cũ đã phân giải trong tab này, để mọi loader trên trang chỉ hỏi API một lần.
const resolvedKeys = new Map<string, Promise<{ id: string; slug: string } | undefined>>();

/**
 * Resolves a workspace key that is not a current slug or id of the caller's memberships (an
 * earlier slug after a rename) to the workspace id and current slug. Undefined when the API does
 * not know it or the caller is not a member; other failures are not cached so a retry can work.
 * VI: Phân giải khoá workspace không phải slug hiện tại hay id của các membership (slug cũ sau khi
 * VI: đổi) thành id và slug hiện tại. Undefined khi API không biết khoá hoặc người gọi không phải
 * VI: thành viên; lỗi khác không được cache để thử lại vẫn được.
 */
export function resolveWorkspaceKey(key: string) {
   let pending = resolvedKeys.get(key);
   if (!pending) {
      pending = authenticatedFetch(`${api}/workspaces/resolve?${new URLSearchParams({ key })}`)
         .then((response) =>
            response.status === 404
               ? undefined
               : responseData<{ id: string; slug: string }>(
                    response,
                    'Could not open the workspace.'
                 )
         )
         .catch((error: unknown) => {
            resolvedKeys.delete(key);
            throw error;
         });
      resolvedKeys.set(key, pending);
   }
   return pending;
}

export async function loadCurrentWorkspaceMembership(
   workspaceSlug = workspaceSlugFromLocation()
): Promise<WorkspaceMembership> {
   if (!workspaceSlug) throw new Error('The workspace URL is missing.');
   const memberships = await loadWorkspaceMemberships();
   let membership = memberships.find(
      ({ workspace }) => workspace.id === workspaceSlug || workspace.slug === workspaceSlug
   );
   if (!membership) {
      // An earlier slug still opens the workspace while the route moves to the current slug.
      // VI: Slug cũ vẫn mở được workspace trong lúc route chuyển sang slug hiện tại.
      const resolved = await resolveWorkspaceKey(workspaceSlug);
      membership = resolved && memberships.find(({ workspace }) => workspace.id === resolved.id);
   }
   if (!membership) throw new Error('This workspace is not available to the current user.');
   return membership;
}

export async function loadCurrentWorkspace(workspaceSlug?: string): Promise<WorkspaceSummary> {
   return (await loadCurrentWorkspaceMembership(workspaceSlug)).workspace;
}
