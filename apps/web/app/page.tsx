'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlowieLogo } from '@/components/brand/flowie-logo';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createWorkspace } from '@/lib/workspaces';
import { resolveWorkspaceRoot } from '@/lib/workspace-root';

export default function Home() {
   const router = useRouter();
   const defaultHome = useUiPreferencesStore((state) => state.defaultHome);
   const hasHydrated = useUiPreferencesStore((state) => state.hasHydrated);
   const [needsWorkspace, setNeedsWorkspace] = useState(false);
   const [workspaceName, setWorkspaceName] = useState('');
   const [createError, setCreateError] = useState<string>();
   const [creating, setCreating] = useState(false);

   useEffect(() => {
      if (!hasHydrated) return;
      const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
      let active = true;
      void Promise.all([
         fetch(`${api}/workspaces/me`, { credentials: 'include' }),
         fetch(`${api}/admin/overview`, { credentials: 'include' }),
         fetch(`${api}/workspaces/invitations`, { credentials: 'include' }),
      ])
         .then(async ([workspacesResponse, adminResponse, invitationsResponse]) => {
            const memberships = workspacesResponse.ok
               ? (
                    (await workspacesResponse.json()) as {
                       data: Array<{ workspace: { slug: string } }>;
                    }
                 ).data
               : [];
            const invitations = invitationsResponse.ok
               ? ((await invitationsResponse.json()) as { data: unknown[] }).data
               : [];
            const destination = resolveWorkspaceRoot({
               adminAccessible: adminResponse.ok,
               workspacesAccessible: workspacesResponse.ok,
               workspaceSlug: memberships[0]?.workspace.slug,
               invitationCount: invitations.length,
               defaultHome: defaultHome === 'my-issues' ? 'my-issues' : 'inbox',
            });
            if (!active) return;
            if (destination) router.replace(destination);
            else setNeedsWorkspace(true);
         })
         .catch(() => {
            if (active) router.replace('/auth/login');
         });
      return () => {
         active = false;
      };
   }, [defaultHome, hasHydrated, router]);

   const submitWorkspace = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = workspaceName.trim();
      if (name.length < 2 || creating) return;
      setCreating(true);
      setCreateError(undefined);
      try {
         const workspace = await createWorkspace(name);
         router.replace(`/${workspace.slug}`);
         router.refresh();
      } catch (error) {
         setCreateError(error instanceof Error ? error.message : 'Could not create workspace.');
         setCreating(false);
      }
   };

   if (needsWorkspace) {
      return (
         <AuthCard
            title="Create your workspace"
            description="Set up a workspace to organize your teams, projects, and issues."
            footer="You can create additional workspaces later from the workspace switcher."
         >
            <form className="space-y-4" onSubmit={submitWorkspace}>
               <div className="space-y-2">
                  <Label htmlFor="workspace-name">Workspace name</Label>
                  <Input
                     id="workspace-name"
                     value={workspaceName}
                     onChange={(event) => setWorkspaceName(event.target.value)}
                     placeholder="My workspace"
                     autoFocus
                     disabled={creating}
                  />
               </div>
               {createError && (
                  <p role="alert" className="text-sm text-destructive">
                     {createError}
                  </p>
               )}
               <Button
                  className="w-full"
                  type="submit"
                  disabled={workspaceName.trim().length < 2 || creating}
               >
                  {creating ? 'Creating workspace…' : 'Create workspace'}
               </Button>
            </form>
         </AuthCard>
      );
   }

   return (
      <main className="grid min-h-svh place-items-center text-sm text-muted-foreground">
         <FlowieLogo loading label />
      </main>
   );
}
