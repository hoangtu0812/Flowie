'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadWorkspaceMemberships } from '@/lib/workspaces';
import { canonicalWorkspacePath } from '@/lib/workspace-route';

export function WorkspaceCanonicalRoute() {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   useEffect(() => {
      let active = true;
      void loadWorkspaceMemberships()
         .then((memberships) => {
            if (!active) return;
            const { pathname, search, hash } = window.location;
            const destination = canonicalWorkspacePath(pathname, memberships, search + hash);
            if (destination) router.replace(destination, { scroll: false });
         })
         .catch(() => {
            // The workspace loader owns authentication and inaccessible-workspace errors.
         });
      return () => {
         active = false;
      };
   }, [orgId, router]);
   return null;
}
