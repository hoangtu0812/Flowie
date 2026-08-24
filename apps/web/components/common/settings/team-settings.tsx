'use client';

import { Button } from '@/components/ui/button';
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { loadJoinedWorkspaceTeams, type WorkspaceTeam } from '@/components/common/teams/team-types';
import {
   ChevronRight,
   FileText,
   Lock,
   Radar,
   RefreshCcw,
   Repeat,
   Settings,
   Tag,
   Target,
   Users,
   Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SettingsCard, SettingsRow, SettingsSection } from './shared';
import { TeamSettingsDialog, type TeamSettingsEditKind } from './team-settings-dialog';
import { toast } from 'sonner';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type IssueOptions = {
   statuses: Array<{ id: string }>;
   templates: Array<{ id: string; name: string }>;
};

interface TeamSettingsProps {
   teamId: string;
}

/** Per-team settings keeps the original layout while using live team and issue-option data. */
export default function TeamSettings({ teamId }: TeamSettingsProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const [team, setTeam] = useState<WorkspaceTeam>();
   const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [statusCount, setStatusCount] = useState(0);
   const [templates, setTemplates] = useState<IssueOptions['templates']>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [editKind, setEditKind] = useState<TeamSettingsEditKind>();
   const [dangerAction, setDangerAction] = useState<'leave' | 'retire' | 'delete'>();
   const [dangerPending, setDangerPending] = useState(false);
   const [dangerError, setDangerError] = useState<string>();

   useEffect(() => {
      setState('loading');
      void loadJoinedWorkspaceTeams()
         .then(async ({ workspaceId, teams }) => {
            const currentTeam = teams.find((candidate) => candidate.id === teamId);
            if (!currentTeam) throw new Error('Team not found.');
            const optionsResponse = await fetch(
               `${api}/issues/options?${new URLSearchParams({
                  workspaceId,
                  teamId: currentTeam.id,
               })}`,
               { credentials: 'include' }
            );
            if (!optionsResponse.ok) throw new Error('Could not load team workflow options.');
            const options = (await optionsResponse.json()) as { data: IssueOptions };
            setTeam(currentTeam);
            setTeams(teams);
            setWorkspaceId(workspaceId);
            setStatusCount(options.data.statuses.length);
            setTemplates(options.data.templates);
            setState('ready');
         })
         .catch(() => setState('error'));
   }, [teamId]);

   if (state === 'loading') {
      return <div className="p-10 text-sm text-muted-foreground">Loading team settings…</div>;
   }
   if (state === 'error' || !team) {
      return (
         <div className="p-10 text-sm text-destructive">
            Could not load this team&apos;s settings.
         </div>
      );
   }

   const unavailable = <span>Unavailable</span>;

   const updateTeam = async (data: Record<string, unknown>) => {
      if (!workspaceId) throw new Error('Workspace is unavailable.');
      const response = await fetch(
         `${api}/teams/${team.id}?${new URLSearchParams({ workspaceId })}`,
         {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(data),
         }
      );
      if (!response.ok) {
         const payload = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(payload?.message ?? 'Could not update team settings.');
      }
      const payload = (await response.json()) as { data: Partial<WorkspaceTeam> };
      setTeam((current) => (current ? { ...current, ...payload.data } : current));
   };

   const leaveTeam = async () => {
      if (!workspaceId) throw new Error('Workspace is unavailable.');
      const response = await fetch(
         `${api}/teams/${team.id}/leave?${new URLSearchParams({ workspaceId })}`,
         { method: 'POST', credentials: 'include' }
      );
      if (!response.ok) {
         const payload = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(payload?.message ?? 'Could not leave this team.');
      }
      router.push(`/${orgId}/teams`);
      router.refresh();
   };

   const retireTeam = async () => {
      if (!workspaceId) throw new Error('Workspace is unavailable.');
      const response = await fetch(
         `${api}/teams/${team.id}?${new URLSearchParams({ workspaceId })}`,
         { method: 'DELETE', credentials: 'include' }
      );
      if (!response.ok) {
         const payload = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(payload?.message ?? 'Could not retire this team.');
      }
      router.push(`/${orgId}/teams`);
      router.refresh();
   };

   const deleteTeam = async () => {
      if (!workspaceId) throw new Error('Workspace is unavailable.');
      const response = await fetch(
         `${api}/teams/${team.id}/schedule-deletion?${new URLSearchParams({ workspaceId })}`,
         { method: 'POST', credentials: 'include' }
      );
      if (!response.ok) {
         const payload = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(payload?.message ?? 'Could not delete this team.');
      }
      router.push(`/${orgId}/teams`);
      router.refresh();
   };

   const confirmDangerAction = async () => {
      if (!dangerAction || dangerPending) return;
      setDangerPending(true);
      setDangerError(undefined);
      try {
         if (dangerAction === 'leave') await leaveTeam();
         if (dangerAction === 'retire') await retireTeam();
         if (dangerAction === 'delete') await deleteTeam();
         setDangerAction(undefined);
      } catch (caught) {
         setDangerError(caught instanceof Error ? caught.message : 'Could not update this team.');
      } finally {
         setDangerPending(false);
      }
   };

   return (
      <>
         <div className="w-full overflow-y-auto h-full">
            <div className="max-w-2xl mx-auto px-6 py-10 pb-20">
               <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 bg-muted/50 items-center justify-center rounded-md text-lg">
                     {team.icon ?? '👥'}
                  </span>
                  <div className="flex-1">
                     <h1 className="text-2xl font-medium">{team.name}</h1>
                     <p className="text-sm text-muted-foreground">
                        {team.members.length} team members
                     </p>
                  </div>
                  <Link
                     href={`/${orgId}/team/${team.identifier}/overview`}
                     className="text-sm inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                     Team overview
                     <ChevronRight className="size-4" />
                  </Link>
               </div>

               <div className="flex flex-col gap-10 mt-10">
                  <SettingsSection>
                     <SettingsCard>
                        <SettingsRow
                           icon={<Settings className="size-4" />}
                           title="General"
                           description="Name, identifier, timezone, estimates, and broader settings"
                           chevron
                           onClick={() => setEditKind('general')}
                        />
                        <SettingsRow
                           icon={<Lock className="size-4" />}
                           title="Access and permissions"
                           description="Manage team access and who in the team can take certain actions"
                           trailing={unavailable}
                           muted
                        />
                        <SettingsRow
                           icon={<Users className="size-4" />}
                           title="Members"
                           description="Manage team members"
                           trailing={
                              <Link
                                 className="hover:text-foreground underline-offset-2 hover:underline"
                                 href={`/${orgId}/team/${team.identifier}/members`}
                              >
                                 {team.members.length} members
                              </Link>
                           }
                           chevron
                           onClick={() => router.push(`/${orgId}/team/${team.identifier}/members`)}
                        />
                     </SettingsCard>
                  </SettingsSection>

                  <SettingsSection title="Issues, projects, and docs">
                     <SettingsCard>
                        <SettingsRow
                           icon={<Tag className="size-4" />}
                           title="Issue labels"
                           description="Labels available to this team's issues"
                           trailing={unavailable}
                           muted
                        />
                        <SettingsRow
                           icon={<FileText className="size-4" />}
                           title="Templates"
                           description="Pre-filled templates for issues, documents, and projects"
                           trailing={
                              <span>
                                 {templates.find((item) => item.id === team.defaultIssueTemplateId)
                                    ?.name ?? 'None'}
                              </span>
                           }
                           chevron
                           onClick={() => setEditKind('template')}
                        />
                        <SettingsRow
                           icon={<Repeat className="size-4" />}
                           title="Recurring issues"
                           description="Automatically create issues on a schedule"
                           trailing={unavailable}
                           muted
                        />
                     </SettingsCard>
                  </SettingsSection>

                  <SettingsSection title="Workflow">
                     <SettingsCard>
                        <SettingsRow
                           icon={<Target className="size-4" />}
                           title="Issue statuses"
                           description="Customize the statuses issues go through"
                           trailing={<span>{statusCount} statuses</span>}
                        />
                        <SettingsRow
                           icon={<Workflow className="size-4" />}
                           title="Workflows & automations"
                           description="Manage issue automations and other workflows"
                           trailing={
                              <span>
                                 {team.autoCloseDays || team.autoArchiveDays
                                    ? `${team.autoCloseDays ?? '—'} / ${team.autoArchiveDays ?? '—'} days`
                                    : 'None'}
                              </span>
                           }
                           chevron
                           onClick={() => setEditKind('automation')}
                        />
                        <SettingsRow
                           icon={<Radar className="size-4" />}
                           title="Triage"
                           description="Streamline how you handle requests from outside your team"
                           trailing={<span>{team.triageEnabled ? 'Enabled' : 'Off'}</span>}
                           chevron
                           onClick={() =>
                              void updateTeam({ triageEnabled: !team.triageEnabled }).catch(
                                 (caught) =>
                                    toast.error(
                                       caught instanceof Error
                                          ? caught.message
                                          : 'Could not update triage.'
                                    )
                              )
                           }
                        />
                        <SettingsRow
                           icon={<RefreshCcw className="size-4" />}
                           title="Cycles"
                           description="Focus your team over short, time-boxed windows"
                           trailing={
                              <span>
                                 {team.cycleCadenceWeeks
                                    ? `Every ${team.cycleCadenceWeeks} weeks`
                                    : 'Off'}
                              </span>
                           }
                           chevron
                           onClick={() => setEditKind('cycles')}
                        />
                     </SettingsCard>
                  </SettingsSection>

                  <SettingsSection
                     title="Team hierarchy"
                     description="Teams can be nested to reflect your team structure and share workflows and settings."
                  >
                     <SettingsCard>
                        <SettingsRow
                           title="Team hierarchy"
                           trailing={
                              <span>
                                 {teams.find((candidate) => candidate.id === team.parentTeamId)
                                    ?.name ?? 'None'}
                              </span>
                           }
                           chevron
                           onClick={() => setEditKind('hierarchy')}
                        />
                     </SettingsCard>
                  </SettingsSection>

                  <SettingsSection title="Danger zone">
                     <SettingsCard>
                        <SettingsRow
                           title="Leave team"
                           description="Remove yourself as a member of this team"
                           trailing={
                              <Button
                                 size="xs"
                                 variant="ghost"
                                 onClick={() => setDangerAction('leave')}
                              >
                                 Leave team...
                              </Button>
                           }
                        />
                        <SettingsRow
                           title="Retire team"
                           description="Prevent creating and updating issues in this team while preserving all historical data"
                           muted
                           trailing={
                              <Button
                                 size="xs"
                                 variant="ghost"
                                 onClick={() => setDangerAction('retire')}
                              >
                                 Retire...
                              </Button>
                           }
                        />
                        <SettingsRow
                           title="Delete team"
                           description="Permanently delete this team and all its data, with a 30-day restoration window"
                           muted
                           trailing={
                              <Button
                                 size="xs"
                                 variant="ghost"
                                 disabled={dangerPending}
                                 onClick={() => setDangerAction('delete')}
                              >
                                 Delete...
                              </Button>
                           }
                        />
                     </SettingsCard>
                  </SettingsSection>
               </div>
            </div>
         </div>
         <TeamSettingsDialog
            kind={editKind}
            team={team}
            teams={teams}
            templates={templates}
            onOpenChange={(open) => !open && setEditKind(undefined)}
            onSave={updateTeam}
         />
         <AlertDialog
            open={Boolean(dangerAction)}
            onOpenChange={(open) => {
               if (!open && !dangerPending) {
                  setDangerAction(undefined);
                  setDangerError(undefined);
               }
            }}
         >
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>
                     {dangerAction === 'leave'
                        ? `Leave ${team.name}?`
                        : dangerAction === 'retire'
                          ? `Retire ${team.name}?`
                          : `Delete ${team.name}?`}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                     {dangerAction === 'leave'
                        ? 'You will lose access to this team until you join it again.'
                        : dangerAction === 'retire'
                          ? 'New work will be disabled while all historical data is preserved.'
                          : 'The team will be hidden now and can be restored for the next 30 days.'}
                  </AlertDialogDescription>
               </AlertDialogHeader>
               {dangerError && <p className="text-sm text-destructive">{dangerError}</p>}
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={dangerPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     disabled={dangerPending}
                     className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                     onClick={(event) => {
                        event.preventDefault();
                        void confirmDangerAction();
                     }}
                  >
                     {dangerPending
                        ? 'Working…'
                        : dangerAction === 'leave'
                          ? 'Leave team'
                          : dangerAction === 'retire'
                            ? 'Retire team'
                            : 'Delete team'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );
}
