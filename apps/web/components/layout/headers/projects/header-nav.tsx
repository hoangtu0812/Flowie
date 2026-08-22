'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function HeaderNav() {
   const [count, setCount] = useState<number>();

   useEffect(() => {
      void (async () => {
         const workspacesResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
         if (!workspacesResponse.ok) return;
         const workspaces = (await workspacesResponse.json()) as {
            data: Array<{ workspace: { id: string } }>;
         };
         const workspaceId = workspaces.data[0]?.workspace.id;
         if (!workspaceId) return;
         const projectsResponse = await fetch(`${api}/projects?workspaceId=${workspaceId}`, {
            credentials: 'include',
         });
         if (!projectsResponse.ok) return;
         const payload = (await projectsResponse.json()) as { data: unknown[] };
         setCount(payload.data.length);
      })();
   }, []);

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger className="" />
            <div className="flex items-center gap-1">
               <span className="text-sm font-medium">Projects</span>
               <span className="text-xs bg-accent rounded-md px-1.5 py-1">{count ?? '…'}</span>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <Button className="relative" size="xs" variant="secondary">
               <Plus className="size-4" />
               <span className="hidden sm:inline ml-1">Create project</span>
            </Button>
         </div>
      </div>
   );
}
