'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadWorkspaceMemberships } from '@/lib/workspaces';
import { ApiRequestError } from '@/lib/http';
import { loadCurrentUser } from '@/features/identity/current-user';
import { resolveWorkspaceRoot } from '@/lib/workspace-root';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
export default function Home() {
   const router = useRouter();
   const { defaultHome, hasHydrated } = useUiPreferencesStore();
   const [error, setError] = useState<string>();
   const [retry, setRetry] = useState(0);
   useEffect(() => {
      if (!hasHydrated) return;
      let active = true;
      setError(undefined);
      void Promise.all([loadCurrentUser(), loadWorkspaceMemberships()])
         .then(([user, memberships]) => {
            if (!active) return;
            const destination = resolveWorkspaceRoot({
               adminAccessible: Boolean(user.isPlatformAdmin),
               workspacesAccessible: true,
               workspaceSlug: memberships[0]?.workspace.slug,
               invitationCount: 0,
               defaultHome,
            });
            router.replace(destination ?? '/invitations');
         })
         .catch((reason) => {
            if (!active) return;
            if (reason instanceof ApiRequestError && reason.status === 401)
               router.replace('/auth/login');
            else
               setError(
                  reason instanceof Error ? reason.message : 'Could not open your workspace.'
               );
         });
      return () => {
         active = false;
      };
   }, [router, defaultHome, hasHydrated, retry]);
   return error ? (
      <QueryState message={error} onRetry={() => setRetry((value) => value + 1)} />
   ) : (
      <LoadingState label="Opening your workspace…" />
   );
}
