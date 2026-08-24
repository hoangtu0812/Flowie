'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
   createWorkspaceTeam,
   joinWorkspaceTeam,
   loadDeletedWorkspaceTeams,
   loadCurrentWorkspaceTeams,
   restoreWorkspaceTeam,
   type DeletedWorkspaceTeam,
   WorkspaceTeam,
} from '@/components/common/teams/team-types';
import { loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import { Check } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** "Join or create a team" settings page. */
export default function NewTeam() {
   const router = useRouter();
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [name, setName] = useState('');
   const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
   const [error, setError] = useState<string>();
   const [saving, setSaving] = useState(false);
   const [joiningTeamId, setJoiningTeamId] = useState<string>();
   const [deletedTeams, setDeletedTeams] = useState<DeletedWorkspaceTeam[]>([]);
   const [restoringTeamId, setRestoringTeamId] = useState<string>();
   const notJoined = teams.filter((team) => !team.joined);

   useEffect(() => {
      void Promise.all([loadCurrentWorkspaceTeams(), loadCurrentWorkspaceMembership()])
         .then(async ([{ workspaceId, teams }, membership]) => {
            setWorkspaceId(workspaceId);
            setTeams(teams);
            if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
               setDeletedTeams(await loadDeletedWorkspaceTeams(workspaceId));
            }
         })
         .catch((error: unknown) =>
            setError(error instanceof Error ? error.message : 'Could not load teams.')
         );
   }, []);

   const createTeam = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || name.trim().length < 2 || saving) return;
      setSaving(true);
      setError(undefined);
      try {
         const identifier = name
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 12);
         await createWorkspaceTeam({
            workspaceId,
            name: name.trim(),
            identifier: identifier || 'TEAM',
         });
         router.push('../');
      } catch (error) {
         setError(error instanceof Error ? error.message : 'Could not create team.');
      } finally {
         setSaving(false);
      }
   };

   const restoreTeam = async (teamId: string) => {
      if (!workspaceId || restoringTeamId) return;
      setRestoringTeamId(teamId);
      setError(undefined);
      try {
         await restoreWorkspaceTeam(workspaceId, teamId);
         const [current, deleted] = await Promise.all([
            loadCurrentWorkspaceTeams(),
            loadDeletedWorkspaceTeams(workspaceId),
         ]);
         setTeams(current.teams);
         setDeletedTeams(deleted);
      } catch (error) {
         setError(error instanceof Error ? error.message : 'Could not restore this team.');
      } finally {
         setRestoringTeamId(undefined);
      }
   };

   const joinTeam = async (teamId: string) => {
      if (!workspaceId || joiningTeamId) return;
      setJoiningTeamId(teamId);
      setError(undefined);
      try {
         await joinWorkspaceTeam(workspaceId, teamId);
         const current = await loadCurrentWorkspaceTeams();
         setTeams(current.teams);
      } catch (error) {
         setError(error instanceof Error ? error.message : 'Could not join team.');
      } finally {
         setJoiningTeamId(undefined);
      }
   };

   return (
      <SettingsShell
         title="Join or create a team"
         description="Teams organize issues, cycles and projects around the people working together"
      >
         <SettingsSection title="Create a new team">
            <SettingsCard>
               <form className="flex items-center gap-3 p-4" onSubmit={createTeam}>
                  <Input
                     placeholder="Team name, e.g. Mobile"
                     className="h-8 flex-1"
                     value={name}
                     onChange={(event) => setName(event.target.value)}
                  />
                  <Button
                     size="xs"
                     type="submit"
                     disabled={!workspaceId || name.trim().length < 2 || saving}
                  >
                     {saving ? 'Creating…' : 'Create team'}
                  </Button>
               </form>
            </SettingsCard>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
         </SettingsSection>

         <SettingsSection title="Join an existing team">
            <SettingsCard>
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
                           disabled={!workspaceId || Boolean(joiningTeamId)}
                           onClick={() => void joinTeam(team.id)}
                        >
                           <Check className="size-3.5" />
                           {joiningTeamId === team.id ? 'Joining…' : 'Join'}
                        </Button>
                     }
                  />
               ))}
            </SettingsCard>
         </SettingsSection>

         {deletedTeams.length > 0 && (
            <SettingsSection
               title="Recently deleted teams"
               description="Deleted teams can be restored for 30 days"
            >
               <SettingsCard>
                  {deletedTeams.map((team) => (
                     <SettingsRow
                        key={team.id}
                        icon={<span className="text-sm">{team.icon ?? '👥'}</span>}
                        title={team.name}
                        description={`Deleted ${new Date(team.deletedAt).toLocaleDateString()}`}
                        trailing={
                           <Button
                              size="xs"
                              variant="secondary"
                              disabled={Boolean(restoringTeamId)}
                              onClick={() => void restoreTeam(team.id)}
                           >
                              {restoringTeamId === team.id ? 'Restoring…' : 'Restore'}
                           </Button>
                        }
                     />
                  ))}
               </SettingsCard>
            </SettingsSection>
         )}
      </SettingsShell>
   );
}
