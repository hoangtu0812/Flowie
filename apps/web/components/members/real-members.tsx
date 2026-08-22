'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Member = {
   id: string;
   status: string;
   user: { id: string; name: string; email: string; avatarUrl: string | null };
};

export function RealMembers() {
   const [members, setMembers] = useState<Member[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const { orgId } = useParams<{ orgId: string }>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   useEffect(() => {
      const load = async () => {
         const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
         if (!workspaceResponse.ok) throw new Error();
         const workspace = (await workspaceResponse.json()) as {
            data: Array<{ workspace: { id: string } }>;
         };
         const workspaceId = workspace.data[0]?.workspace.id;
         if (!workspaceId) throw new Error();
         const response = await fetch(`${api}/workspaces/${workspaceId}/members`, {
            credentials: 'include',
         });
         if (!response.ok) throw new Error();
         setMembers(((await response.json()) as { data: Member[] }).data);
      };
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [api]);
   if (state === 'loading')
      return <p className="p-6 text-sm text-muted-foreground">Loading members…</p>;
   if (state === 'error')
      return <p className="p-6 text-sm text-destructive">Could not load members.</p>;
   return (
      <section className="mx-auto w-full max-w-5xl p-6">
         <h1 className="mb-5 text-xl font-semibold">Members</h1>
         {members.length ? (
            <div className="overflow-hidden rounded-md border">
               {members.map((member) => (
                  <Link
                     className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                     href={`/${orgId}/profiles/${member.user.id}`}
                     key={member.id}
                  >
                     <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-xs font-medium">
                        {member.user.name.slice(0, 1).toUpperCase()}
                     </span>
                     <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{member.user.name}</p>
                        <p className="text-xs text-muted-foreground">{member.user.email}</p>
                     </div>
                     <span className="text-xs text-muted-foreground">
                        {member.status.toLowerCase()}
                     </span>
                  </Link>
               ))}
            </div>
         ) : (
            <p className="text-sm text-muted-foreground">No members yet.</p>
         )}
      </section>
   );
}
