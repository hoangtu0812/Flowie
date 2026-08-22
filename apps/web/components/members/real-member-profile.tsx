'use client';

import { useEffect, useState } from 'react';

type Member = {
   id: string;
   status: string;
   joinedAt: string | null;
   user: {
      id: string;
      name: string;
      email: string;
      username: string | null;
      avatarUrl: string | null;
      createdAt: string;
   };
};

export function RealMemberProfile({ memberId }: { memberId: string }) {
   const [member, setMember] = useState<Member>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

   useEffect(() => {
      const load = async () => {
         const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
         if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
         const workspace = (await workspaceResponse.json()) as {
            data: Array<{ workspace: { id: string } }>;
         };
         const workspaceId = workspace.data[0]?.workspace.id;
         if (!workspaceId) throw new Error('No workspace is available.');
         const membersResponse = await fetch(`${api}/workspaces/${workspaceId}/members`, {
            credentials: 'include',
         });
         if (!membersResponse.ok) throw new Error('Could not load members.');
         const members = ((await membersResponse.json()) as { data: Member[] }).data;
         const found = members.find((item) => item.user.id === memberId || item.id === memberId);
         if (!found) throw new Error('Member not found.');
         setMember(found);
      };
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [api, memberId]);

   if (state === 'loading')
      return <p className="p-6 text-sm text-muted-foreground">Loading profile…</p>;
   if (state === 'error' || !member)
      return <p className="p-6 text-sm text-destructive">Could not load this member.</p>;
   return (
      <section className="mx-auto w-full max-w-3xl p-4 sm:p-6">
         <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-muted text-lg font-semibold">
               {member.user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
               <h1 className="text-xl font-semibold">{member.user.name}</h1>
               <p className="text-sm text-muted-foreground">{member.user.email}</p>
            </div>
         </div>
         <dl className="mt-8 grid gap-5 rounded-md border p-4 text-sm sm:grid-cols-2">
            <div>
               <dt className="text-xs text-muted-foreground">Member status</dt>
               <dd className="mt-1">{member.status.toLowerCase()}</dd>
            </div>
            <div>
               <dt className="text-xs text-muted-foreground">Username</dt>
               <dd className="mt-1">{member.user.username ?? 'Not set'}</dd>
            </div>
            <div>
               <dt className="text-xs text-muted-foreground">Joined workspace</dt>
               <dd className="mt-1">
                  {member.joinedAt
                     ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                          new Date(member.joinedAt)
                       )
                     : 'Pending'}
               </dd>
            </div>
            <div>
               <dt className="text-xs text-muted-foreground">Account created</dt>
               <dd className="mt-1">
                  {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                     new Date(member.user.createdAt)
                  )}
               </dd>
            </div>
         </dl>
      </section>
   );
}
