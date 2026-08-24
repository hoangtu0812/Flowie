export type WorkspaceRootInput = {
   adminAccessible: boolean;
   workspacesAccessible: boolean;
   workspaceSlug?: string;
   invitationCount: number;
   defaultHome: 'inbox' | 'my-issues';
};

/** Returns null only for an authenticated account that needs its first workspace. */
export function resolveWorkspaceRoot(input: WorkspaceRootInput): string | null {
   if (input.adminAccessible) return '/admin';
   if (!input.workspacesAccessible) return '/auth/login';
   if (input.workspaceSlug) return `/${input.workspaceSlug}/${input.defaultHome}`;
   if (input.invitationCount > 0) return '/invitations';
   return null;
}
