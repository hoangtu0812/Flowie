'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function HeaderNav() {
   const { orgId } = useParams<{ orgId: string }>();
   const [count, setCount] = useState(0);
   useEffect(() => {
      const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
      void fetch(`${api}/workspaces/me`, { credentials: 'include' })
         .then((response) => (response.ok ? response.json() : Promise.reject()))
         .then((payload: { data: Array<{ workspace: { id: string } }> }) =>
            fetch(`${api}/teams?workspaceId=${payload.data[0]?.workspace.id}`, {
               credentials: 'include',
            })
         )
         .then((response) => (response.ok ? response.json() : Promise.reject()))
         .then((payload: { data: unknown[] }) => setCount(payload.data.length))
         .catch(() => undefined);
   }, []);
   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger className="" />
            <div className="flex items-center gap-1">
               <span className="text-sm font-medium">Teams</span>
               <span className="text-xs bg-accent rounded-md px-1.5 py-1">{count}</span>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <Button asChild className="relative" size="xs" variant="secondary">
               <Link href={`/${orgId}/settings/teams/new`}>
                  <Plus className="size-4" /> Add team
               </Link>
            </Button>
         </div>
      </div>
   );
}
