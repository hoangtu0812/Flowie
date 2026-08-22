'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

export function RealNewTeam() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [name, setName] = useState('');
   const [identifier, setIdentifier] = useState('');
   const [error, setError] = useState<string>();
   const router = useRouter();
   const { orgId } = useParams<{ orgId: string }>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   useEffect(() => {
      void fetch(`${api}/workspaces/me`, { credentials: 'include' })
         .then((response) => (response.ok ? response.json() : Promise.reject()))
         .then((payload: { data: Array<{ workspace: { id: string } }> }) =>
            setWorkspaceId(payload.data[0]?.workspace.id)
         )
         .catch(() => setError('Could not load workspace.'));
   }, [api]);
   const create = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || name.trim().length < 2 || identifier.trim().length < 2) return;
      setError(undefined);
      const response = await fetch(`${api}/teams`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, name: name.trim(), identifier: identifier.trim() }),
      });
      if (!response.ok) {
         setError('Could not create team.');
         return;
      }
      router.push(`/${orgId}/teams`);
   };
   return (
      <section className="mx-auto w-full max-w-xl p-6">
         <h1 className="text-xl font-semibold">Create team</h1>
         <p className="mt-1 text-sm text-muted-foreground">
            Create a team in the active workspace.
         </p>
         <form className="mt-6 space-y-4 rounded-md border p-4" onSubmit={create}>
            <label className="block text-sm font-medium">
               Team name
               <input
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                  onChange={(event) => setName(event.target.value)}
                  value={name}
               />
            </label>
            <label className="block text-sm font-medium">
               Identifier
               <input
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 uppercase"
                  maxLength={12}
                  onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
                  placeholder="ENG"
                  value={identifier}
               />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
               className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
               disabled={!workspaceId || name.trim().length < 2 || identifier.trim().length < 2}
               type="submit"
            >
               Create team
            </button>
         </form>
      </section>
   );
}
