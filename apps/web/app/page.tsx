'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
   const router = useRouter();

   useEffect(() => {
      const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
      void Promise.all([
         fetch(`${api}/workspaces/me`, { credentials: 'include' }),
         fetch(`${api}/admin/overview`, { credentials: 'include' }),
      ]).then(async ([workspacesResponse, adminResponse]) => {
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
         router.replace(workspace ? `/${workspace.slug}/teams` : '/auth/login');
      });
   }, [router]);

   return (
      <main className="grid min-h-svh place-items-center text-sm text-muted-foreground">
         Đang mở Flowie…
      </main>
   );
}
