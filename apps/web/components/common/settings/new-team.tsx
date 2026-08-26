'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
   createWorkspaceTeam,
   joinWorkspaceTeam,
   loadCurrentWorkspaceTeams,
   type WorkspaceTeam,
} from '@/components/common/teams/team-types';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const toIdentifier = (value: string) =>
   value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 12);

/** "Join or create a team" settings page. */
export default function NewTeam() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
   const [loading, setLoading] = useState(true);
   const [creating, setCreating] = useState(false);
   const [joiningId, setJoiningId] = useState<string>();
   const [name, setName] = useState('');
   const [identifier, setIdentifier] = useState('');

   const refresh = async () => {
      const result = await loadCurrentWorkspaceTeams();
      setWorkspaceId(result.workspaceId);
      setTeams(result.teams);
   };

   useEffect(() => {
      let active = true;
      void refresh()
         .catch((error: unknown) => {
            if (active)
               toast.error(error instanceof Error ? error.message : 'Could not load teams.');
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, []);

   const notJoined = useMemo(() => teams.filter((team) => !team.joined), [teams]);

   const create = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !name.trim() || !identifier.trim()) return;
      setCreating(true);
      try {
         await createWorkspaceTeam({
            workspaceId,
            name: name.trim(),
            identifier: identifier.trim(),
         });
         setName('');
         setIdentifier('');
         await refresh();
         window.dispatchEvent(new Event('flowie-teams-changed'));
         toast.success('Team created.');
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not create team.');
      } finally {
         setCreating(false);
      }
   };

   const join = async (teamId: string) => {
      if (!workspaceId) return;
      setJoiningId(teamId);
      try {
         await joinWorkspaceTeam(workspaceId, teamId);
         await refresh();
         window.dispatchEvent(new Event('flowie-teams-changed'));
         toast.success('Joined team.');
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not join team.');
      } finally {
         setJoiningId(undefined);
      }
   };

   return (
      <SettingsShell
         title="Join or create a team"
         description="Teams organize issues, cycles and projects around the people working together"
      >
         <SettingsSection title="Create a new team">
            <SettingsCard>
               <form className="flex items-center gap-3 p-4" onSubmit={create}>
                  <Input
                     value={name}
                     onChange={(event) => {
                        const value = event.target.value;
                        setName(value);
                        if (!identifier) setIdentifier(toIdentifier(value));
                     }}
                     placeholder="Team name, e.g. Mobile"
                     className="h-8 flex-1"
                     disabled={loading || creating}
                  />
                  <Input
                     value={identifier}
                     onChange={(event) => setIdentifier(toIdentifier(event.target.value))}
                     placeholder="IDENTIFIER"
                     className="h-8 w-32"
                     maxLength={12}
                     disabled={loading || creating}
                  />
                  <Button
                     type="submit"
                     size="xs"
                     disabled={
                        loading || creating || !workspaceId || !name.trim() || !identifier.trim()
                     }
                  >
                     {creating ? 'Creating…' : 'Create team'}
                  </Button>
               </form>
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Join an existing team">
            <SettingsCard>
               {!loading && notJoined.length === 0 && (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                     There are no other teams available to join.
                  </div>
               )}
               {notJoined.map((team) => (
                  <SettingsRow
                     key={team.id}
                     icon={<span className="text-sm">{team.icon}</span>}
                     title={team.name}
                     description={`${team.members.length} members · ${team.projectCount} projects`}
                     trailing={
                        <Button
                           size="xs"
                           variant="secondary"
                           disabled={Boolean(joiningId)}
                           onClick={() => void join(team.id)}
                        >
                           <Check className="size-3.5" />
                           {joiningId === team.id ? 'Joining…' : 'Join'}
                        </Button>
                     }
                  />
               ))}
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
