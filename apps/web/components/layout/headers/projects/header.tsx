'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

type WorkspaceResponse = { data: Array<{ workspace: { id: string } }> };

export default function Header() {
   const [count, setCount] = useState<number | null>(null);

   useEffect(() => {
      const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
      void fetch(`${api}/workspaces/me`, { credentials: 'include' })
         .then((response) => (response.ok ? response.json() : { data: [] }))
         .then((workspaces: WorkspaceResponse) => {
            const workspaceId = workspaces.data[0]?.workspace.id;
            if (!workspaceId) return;
            return fetch(`${api}/projects?workspaceId=${workspaceId}`, { credentials: 'include' })
               .then((response) => (response.ok ? response.json() : { data: [] }))
               .then((payload: { data: unknown[] }) => setCount(payload.data.length));
         })
         .catch(() => undefined);
   }, []);

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger />
            <div className="flex items-center gap-1">
               <span className="text-sm font-medium">Projects</span>
               {count !== null && (
                  <span className="text-xs bg-accent rounded-md px-1.5 py-1">{count}</span>
               )}
            </div>
         </div>
         <Button
            className="relative"
            size="xs"
            variant="secondary"
            onClick={() => window.dispatchEvent(new Event('flowie:create-project'))}
         >
            <Plus className="size-4" />
            <span className="hidden sm:inline ml-1">Create project</span>
         </Button>
      </div>
   );
}
