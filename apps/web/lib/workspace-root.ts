export type WorkspaceRootInput = {
   adminAccessible: boolean;
   workspacesAccessible: boolean;
   workspaceSlug?: string;
   preferredWorkspaceSlug?: string;
   invitationCount: number;
   defaultHome: 'inbox' | 'my-issues';
};

/** Returns null only for an authenticated account that needs its first workspace. */
export function resolveWorkspaceRoot(input: WorkspaceRootInput): string | null {
   if (input.workspacesAccessible && input.preferredWorkspaceSlug)
      return `/${input.preferredWorkspaceSlug}/${input.defaultHome}`;
   if (input.adminAccessible) return '/admin';
   if (!input.workspacesAccessible) return '/auth/login';
   if (input.workspaceSlug) return `/${input.workspaceSlug}/${input.defaultHome}`;
   if (input.invitationCount > 0) return '/invitations';
   return null;
}

/**
 * Resolves the saved default workspace (stored by id) to its current URL slug; a revoked
 * membership gives undefined. VI: Đổi workspace mặc định đã lưu (theo id) thành slug URL hiện tại;
 * VI: membership đã bị thu hồi trả undefined.
 */
export function preferredWorkspaceSlug(
   memberships: { workspace: { id: string; slug: string } }[],
   workspaceId?: string | null
): string | undefined {
   return memberships.find(({ workspace }) => workspace.id === workspaceId)?.workspace.slug;
}
