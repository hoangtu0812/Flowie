'use client';

import { loadWorkspaceMemberships } from '@/lib/workspaces';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The root URL carries no workspace, so it resolves the signed-in user's own
 * workspace instead of pointing at a fixed one. Unauthenticated visitors never
 * reach this component — the middleware sends them to the login page first.
 */
export default function Home() {
   const router = useRouter();

   useEffect(() => {
      void loadWorkspaceMemberships()
         .then((memberships) => {
            const workspace = memberships[0]?.workspace;
            router.replace(workspace ? `/${workspace.slug}/teams` : '/auth/login');
         })
         .catch(() => router.replace('/auth/login'));
   }, [router]);

   return (
      <div className="h-dvh grid place-items-center text-sm text-muted-foreground">
         Opening your workspace…
      </div>
   );
}
