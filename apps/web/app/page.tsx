'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FlowieLogo } from '@/components/brand/flowie-logo';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';

export default function Home() {
   const router = useRouter();
   const defaultHome = useUiPreferencesStore((state) => state.defaultHome);
   const hasHydrated = useUiPreferencesStore((state) => state.hasHydrated);

   useEffect(() => {
      if (!hasHydrated) return;
      const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
      void Promise.all([
         fetch(`${api}/workspaces/me`, { credentials: 'include' }),
         fetch(`${api}/admin/overview`, { credentials: 'include' }),
         fetch(`${api}/workspaces/invitations`, { credentials: 'include' }),
      ]).then(async ([workspacesResponse, adminResponse, invitationsResponse]) => {
         if (adminResponse.ok) {
            router.replace('/admin');
            return;
         }
         if (!workspacesResponse.ok) {
            router.replace('/auth/login');
            return;
         }
         const payload = (await workspacesResponse.json()) as {
            data: Array<{ workspace: { slug: string } }>;
         };
         const workspace = payload.data[0]?.workspace;
         if (workspace) {
            const homePath = defaultHome === 'my-issues' ? 'my-issues' : 'inbox';
            router.replace(`/${workspace.slug}/${homePath}`);
            return;
         }
         const invitations = invitationsResponse.ok
            ? ((await invitationsResponse.json()) as { data: unknown[] }).data
            : [];
         router.replace(invitations.length ? '/invitations' : '/auth/login');
      });
   }, [defaultHome, hasHydrated, router]);

   return (
      <main className="grid min-h-svh place-items-center text-sm text-muted-foreground">
         <FlowieLogo loading label />
      </main>
   );
}
