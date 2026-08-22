'use client';

import { FlowieLogo } from '@/components/brand/flowie-logo';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Invitation = {
   id: string;
   role: 'OWNER' | 'ADMIN' | 'MEMBER';
   workspace: { name: string; slug: string; organization: { name: string } };
   invitedBy: { name: string } | null;
};

export default function InvitationsPage() {
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const router = useRouter();
   const [invitations, setInvitations] = useState<Invitation[]>([]);
   const [error, setError] = useState<string>();

   const load = useCallback(async () => {
      const response = await fetch(`${api}/workspaces/invitations`, { credentials: 'include' });
      if (!response.ok) throw new Error('Could not load invitations.');
      setInvitations(((await response.json()) as { data: Invitation[] }).data);
   }, [api]);

   useEffect(() => {
      void load().catch(() => setError('Could not load your invitations.'));
   }, [load]);

   const respond = async (invitation: Invitation, action: 'accept' | 'decline') => {
      setError(undefined);
      const response = await fetch(
         `${api}/workspaces/invitations/${invitation.id}${action === 'accept' ? '/accept' : ''}`,
         {
            method: action === 'accept' ? 'POST' : 'DELETE',
            credentials: 'include',
         }
      );
      if (!response.ok) {
         setError('Could not update this invitation.');
         return;
      }
      if (action === 'accept') {
         router.replace(`/${invitation.workspace.slug}/teams`);
         return;
      }
      await load();
   };

   return (
      <main className="mx-auto grid min-h-svh w-full max-w-lg place-items-center p-6">
         <section className="w-full rounded-xl border bg-card p-6 shadow-sm">
            <FlowieLogo label />
            <h1 className="mt-6 text-xl font-semibold">Workspace invitations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
               Accept an invitation to join a Flowie workspace.
            </p>
            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
            <div className="mt-5 space-y-3">
               {invitations.map((invitation) => (
                  <article className="rounded-lg border p-4" key={invitation.id}>
                     <p className="font-medium">{invitation.workspace.name}</p>
                     <p className="mt-1 text-sm text-muted-foreground">
                        {invitation.workspace.organization.name} · {invitation.role.toLowerCase()}
                     </p>
                     {invitation.invitedBy && (
                        <p className="mt-1 text-xs text-muted-foreground">
                           Invited by {invitation.invitedBy.name}
                        </p>
                     )}
                     <div className="mt-4 flex justify-end gap-2">
                        <button
                           className="rounded-md border px-3 py-2 text-sm"
                           onClick={() => void respond(invitation, 'decline')}
                           type="button"
                        >
                           Decline
                        </button>
                        <button
                           className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                           onClick={() => void respond(invitation, 'accept')}
                           type="button"
                        >
                           Accept
                        </button>
                     </div>
                  </article>
               ))}
               {!invitations.length && (
                  <p className="py-4 text-sm text-muted-foreground">
                     You have no pending invitations.
                  </p>
               )}
            </div>
         </section>
      </main>
   );
}
