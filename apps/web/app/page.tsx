'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadWorkspaceMemberships } from '@/lib/workspaces';
import { ApiRequestError } from '@/lib/http';
import { loadCurrentUser } from '@/features/identity/current-user';
import { preferredWorkspaceSlug, resolveWorkspaceRoot } from '@/lib/workspace-root';
import { accountPreferences } from '@/features/identity/account-preferences';
import { isRequester } from '@/features/service-desk/requester';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
export default function Home() {
   const router = useRouter();
   const [error, setError] = useState<string>();
   const [retry, setRetry] = useState(0);
   useEffect(() => {
      let active = true;
      setError(undefined);
      void Promise.all([loadCurrentUser(), loadWorkspaceMemberships()])
         .then(async ([user, memberships]) => {
            const preferences = await accountPreferences(user.id);
            const slug =
               preferredWorkspaceSlug(memberships, preferences.defaultWorkspaceId) ??
               memberships[0]?.workspace.slug;
            const home = memberships.find(({ workspace }) => workspace.slug === slug);
            const requester = !user.isPlatformAdmin && home && (await isRequester(home));
            if (!active) return;
            if (requester) {
               router.replace('/servicedesk');
               return;
            }
            const destination = resolveWorkspaceRoot({
               adminAccessible: Boolean(user.isPlatformAdmin),
               workspacesAccessible: true,
               workspaceSlug: memberships[0]?.workspace.slug,
               preferredWorkspaceSlug: preferredWorkspaceSlug(
                  memberships,
                  preferences.defaultWorkspaceId
               ),
               invitationCount: 0,
               defaultHome: preferences.defaultHome,
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
   }, [router, retry]);
   return error ? (
      <QueryState message={error} onRetry={() => setRetry((value) => value + 1)} />
   ) : (
      <LoadingState label="Opening your workspace…" />
   );
}
