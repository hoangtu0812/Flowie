'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Member = {
   id: string;
   status: string;
   role: 'OWNER' | 'ADMIN' | 'MEMBER';
   user: { id: string; name: string; email: string; avatarUrl: string | null };
};

export function RealMembers() {
   const [members, setMembers] = useState<Member[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [currentRole, setCurrentRole] = useState<Member['role']>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [email, setEmail] = useState('');
   const [inviteRole, setInviteRole] = useState<Member['role']>('MEMBER');
   const [error, setError] = useState<string>();
   const [creatingWorkspace, setCreatingWorkspace] = useState(false);
   const [inviteOpen, setInviteOpen] = useState(false);
   const [workspaceName, setWorkspaceName] = useState('');
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error();
      const workspace = (await workspaceResponse.json()) as {
         data: Array<{ workspace: { id: string }; role: Member['role'] }>;
      };
      const workspaceId = workspace.data[0]?.workspace.id;
      if (!workspaceId) throw new Error();
      setWorkspaceId(workspaceId);
      setCurrentRole(workspace.data[0]?.role);
      const response = await fetch(`${api}/workspaces/${workspaceId}/members`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error();
      setMembers(((await response.json()) as { data: Member[] }).data);
   }, [api]);
   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);
   useEffect(() => {
      const open = () => setInviteOpen(true);
      window.addEventListener('flowie:invite-member', open);
      return () => window.removeEventListener('flowie:invite-member', open);
   }, []);

   const invite = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !email.trim()) return;
      setError(undefined);
      const response = await fetch(`${api}/workspaces/${workspaceId}/invitations`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ email: email.trim(), role: inviteRole }),
      });
      if (!response.ok) {
         setError('Could not invite this account. The person must already have a Flowie account.');
         return;
      }
      setEmail('');
      await load();
   };

   const updateRole = async (member: Member, role: Member['role']) => {
      if (!workspaceId) return;
      setError(undefined);
      const response = await fetch(`${api}/workspaces/${workspaceId}/members/${member.id}`, {
         method: 'PATCH',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ role }),
      });
      if (!response.ok) {
         setError('Only the workspace owner can change member roles.');
         return;
      }
      await load();
   };

   const remove = async (member: Member) => {
      if (!workspaceId || !window.confirm(`Remove ${member.user.name} from this workspace?`))
         return;
      setError(undefined);
      const response = await fetch(`${api}/workspaces/${workspaceId}/members/${member.id}`, {
         method: 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) {
         setError('Could not remove this member.');
         return;
      }
      await load();
   };

   const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (workspaceName.trim().length < 2) return;
      setError(undefined);
      const response = await fetch(`${api}/workspaces`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ name: workspaceName.trim() }),
      });
      if (!response.ok) {
         setError('Could not create a new workspace.');
         return;
      }
      const created = (await response.json()) as { data: { workspaces: Array<{ slug: string }> } };
      const slug = created.data.workspaces[0]?.slug;
      if (slug) {
         router.replace(`/${slug}/teams`);
         return;
      }
      setError('Workspace was created but could not be opened.');
   };
   if (state === 'loading')
      return <p className="p-6 text-sm text-muted-foreground">Loading members…</p>;
   if (state === 'error')
      return <p className="p-6 text-sm text-destructive">Could not load members.</p>;
   return (
      <section className="mx-auto w-full max-w-5xl p-6">
         <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">Members</h1>
            <div className="flex items-center gap-2">
               <span className="rounded bg-muted px-2 py-1 text-xs">
                  {currentRole?.toLowerCase() ?? 'member'}
               </span>
               <button
                  className="rounded-md border px-2 py-1 text-xs"
                  onClick={() => setCreatingWorkspace((value) => !value)}
                  type="button"
               >
                  New workspace
               </button>
            </div>
         </div>
         {creatingWorkspace && (
            <form
               className="mb-5 flex flex-wrap gap-2 rounded-lg border p-3"
               onSubmit={createWorkspace}
            >
               <input
                  autoFocus
                  className="min-w-52 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Workspace name"
                  value={workspaceName}
               />
               <button
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                  disabled={workspaceName.trim().length < 2}
                  type="submit"
               >
                  Create workspace
               </button>
            </form>
         )}
         {(currentRole === 'OWNER' || currentRole === 'ADMIN') && inviteOpen && (
            <form className="mb-5 flex flex-wrap gap-2 rounded-lg border p-3" onSubmit={invite}>
               <input
                  className="min-w-52 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Existing account email"
                  type="email"
                  value={email}
               />
               <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  onChange={(event) => setInviteRole(event.target.value as Member['role'])}
                  value={inviteRole}
               >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
               </select>
               <button
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                  type="submit"
               >
                  Invite
               </button>
               <button
                  className="rounded-md border px-3 py-2 text-sm font-medium"
                  onClick={() => setInviteOpen(false)}
                  type="button"
               >
                  Cancel
               </button>
            </form>
         )}
         {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
         {members.length ? (
            <div className="overflow-hidden rounded-md border">
               {members.map((member) => (
                  <div
                     className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                     key={member.id}
                  >
                     <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-xs font-medium">
                        {member.user.name.slice(0, 1).toUpperCase()}
                     </span>
                     <Link className="min-w-0 flex-1" href={`/${orgId}/profiles/${member.user.id}`}>
                        <p className="text-sm font-medium">{member.user.name}</p>
                        <p className="text-xs text-muted-foreground">{member.user.email}</p>
                     </Link>
                     <span className="text-xs text-muted-foreground">
                        {member.status.toLowerCase()} · {member.role.toLowerCase()}
                     </span>
                     {currentRole === 'OWNER' && member.role !== 'OWNER' && (
                        <select
                           className="rounded border bg-background px-2 py-1 text-xs"
                           onChange={(event) =>
                              void updateRole(member, event.target.value as Member['role'])
                           }
                           value={member.role}
                        >
                           <option value="MEMBER">Member</option>
                           <option value="ADMIN">Admin</option>
                        </select>
                     )}
                     {(currentRole === 'OWNER' || currentRole === 'ADMIN') &&
                        member.role !== 'OWNER' && (
                           <button
                              className="rounded border px-2 py-1 text-xs text-destructive"
                              onClick={() => void remove(member)}
                              type="button"
                           >
                              Remove
                           </button>
                        )}
                  </div>
               ))}
            </div>
         ) : (
            <p className="text-sm text-muted-foreground">No members yet.</p>
         )}
      </section>
   );
}
