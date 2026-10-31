'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadWorkspaceMemberships, resolveWorkspaceKey } from '@/lib/workspaces';
import { canonicalWorkspacePath, withWorkspaceSegment, workspaceKey } from '@/lib/workspace-route';
import { appPathname } from '@/lib/base-path';

/**
 * Keeps the workspace segment of the address bar on the current slug: an id link moves to the
 * slug, and an earlier slug is resolved by the API and moves to the current one. The rest of the
 * path, the query and the hash are kept; replace() leaves no extra history entry.
 * VI: Giữ đoạn workspace trên thanh địa chỉ ở slug hiện tại: link theo id được chuyển sang slug,
 * VI: slug cũ được API phân giải rồi chuyển sang slug hiện tại. Phần còn lại của path, query và hash
 * VI: được giữ; replace() không thêm mục lịch sử.
 */
export function WorkspaceCanonicalRoute() {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   useEffect(() => {
      let active = true;
      void loadWorkspaceMemberships()
         .then((memberships) => {
            if (!active) return;
            const { search, hash } = window.location;
            const pathname = appPathname();
            const destination = canonicalWorkspacePath(pathname, memberships, search + hash);
            if (destination) return router.replace(destination, { scroll: false });
            const key = workspaceKey(pathname);
            if (
               !key ||
               memberships.some(({ workspace }) => workspace.id === key || workspace.slug === key)
            )
               return;
            return resolveWorkspaceKey(key).then((resolved) => {
               if (active && resolved)
                  router.replace(withWorkspaceSegment(pathname, resolved.slug, search + hash), {
                     scroll: false,
                  });
            });
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
