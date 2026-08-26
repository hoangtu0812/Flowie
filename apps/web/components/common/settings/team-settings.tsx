'use client';

import { useLiveTeam } from '@/components/common/teams/use-live-team';
import type { WorkspaceTeam } from '@/components/common/teams/team-types';
import { authenticatedFetch } from '@/lib/workspaces';
import { Button } from '@/components/ui/button';
import {
   Bot,
   ChevronRight,
   FileText,
   Lock,
   Radar,
   RefreshCcw,
   Repeat,
   Settings,
   Sparkles,
   Tag,
   Target,
   Users,
   Workflow,
   Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { TeamSettingsDialog, type TeamSettingsEditKind } from './team-settings-dialog';
import { SettingsCard, SettingsRow, SettingsSection } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Team settings retains the Circle settings sections and persists supported Team fields. */
export default function TeamSettings({ teamId }: { teamId: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const { team, workspaceId, loading, error, updateTeam, reload } = useLiveTeam(teamId);
   const [allTeams, setAllTeams] = useState<WorkspaceTeam[]>([]);
   const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
   const [editing, setEditing] = useState<TeamSettingsEditKind>();

   useEffect(() => {
      if (!workspaceId) return;
      void Promise.all([
         authenticatedFetch(`${api}/teams?${new URLSearchParams({ workspaceId })}`),
         authenticatedFetch(`${api}/issues/templates?${new URLSearchParams({ workspaceId })}`),
      ]).then(async ([teamsResponse, templatesResponse]) => {
         if (teamsResponse.ok) {
            const payload = (await teamsResponse.json()) as { data: WorkspaceTeam[] };
            setAllTeams(payload.data);
         }
         if (templatesResponse.ok) {
            const payload = (await templatesResponse.json()) as {
               data: Array<{ id: string; name: string }>;
            };
            setTemplates(payload.data);
         }
      });
   }, [workspaceId]);

   const workspaceTeam = useMemo<WorkspaceTeam | undefined>(
      () =>
         team
            ? {
                 ...team,
                 joined: true,
                 members: team.members.map((member) => ({ ...member.user, role: member.role })),
                 projectCount: team._count.projects,
                 cycleCount: team._count.cycles,
              }
            : undefined,
      [team]
   );

   if (loading)
      return (
         <div className="h-full grid place-items-center text-sm text-muted-foreground">
            Loading team settings…
         </div>
      );
   if (error || !team || !workspaceTeam)
      return (
         <div className="h-full grid place-items-center text-sm text-destructive">
            {error ?? 'Team not found.'}
         </div>
      );

   const action = async (kind: 'leave' | 'retire' | 'delete') => {
      if (!workspaceId) return;
      const message =
         kind === 'leave'
            ? 'Leave this team?'
            : kind === 'retire'
              ? 'Retire this team? Issues remain readable but the team will stop accepting changes.'
              : 'Schedule this team for deletion? It can be restored for 30 days.';
      if (!window.confirm(message)) return;
      try {
         const path =
            kind === 'leave'
               ? `/teams/${team.id}/leave`
               : kind === 'retire'
                 ? `/teams/${team.id}`
                 : `/teams/${team.id}/schedule-deletion`;
         const response = await authenticatedFetch(
            `${api}${path}?${new URLSearchParams({ workspaceId })}`,
            { method: kind === 'retire' ? 'DELETE' : 'POST' }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update team.');
         }
         toast.success(
            kind === 'leave'
               ? 'Left team.'
               : kind === 'retire'
                 ? 'Team retired.'
                 : 'Team deletion scheduled.'
         );
         reload();
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not update team.');
      }
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-2xl mx-auto px-6 py-10 pb-20">
            <div className="flex items-center gap-3">
               <span className="inline-flex size-9 bg-muted/50 items-center justify-center rounded-md text-lg">
                  {team.icon}
               </span>
               <div className="flex-1">
                  <h1 className="text-2xl font-medium">{team.name}</h1>
                  <p className="text-sm text-muted-foreground">
                     {team.joinPolicy === 'OPEN'
                        ? 'Accessible to all workspace members'
                        : 'Invite-only team'}
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
                        description="Name, issue prefix and description"
                        chevron
                        onClick={() => setEditing('general')}
                     />
                     <SettingsRow
                        icon={<Lock className="size-4" />}
                        title="Access and permissions"
                        description="Control who can join this team"
                        trailing={
                           <span>{team.joinPolicy === 'OPEN' ? 'Open' : 'Invite only'}</span>
                        }
                        chevron
                        onClick={() => setEditing('access')}
                     />
                     <SettingsRow
                        icon={<Users className="size-4" />}
                        title="Members"
                        description="Manage team members"
                        trailing={<span>{team.members.length} members</span>}
                        chevron
                        onClick={() =>
                           window.location.assign(`/${orgId}/team/${team.identifier}/members`)
                        }
                     />
                     <SettingsRow
                        icon={<Zap className="size-4" />}
                        title="Slack notifications"
                        description="Discord/Slack delivery is configured at workspace integration level"
                        trailing={<span>Off</span>}
                     />
                  </SettingsCard>
               </SettingsSection>
               <SettingsSection title="Issues, projects, and docs">
                  <SettingsCard>
                     <SettingsRow
                        icon={<Tag className="size-4" />}
                        title="Issue labels"
                        description="Labels available to this team's issues"
                        chevron
                        onClick={() => window.location.assign(`/${orgId}/settings/issue-labels`)}
                     />
                     <SettingsRow
                        icon={<FileText className="size-4" />}
                        title="Templates"
                        description="Default issue template for this team"
                        chevron
                        onClick={() => setEditing('template')}
                     />
                     <SettingsRow
                        icon={<Repeat className="size-4" />}
                        title="Recurring issues"
                        description="Automatically create issues on a schedule"
                        trailing={<span>Not configured</span>}
                     />
                  </SettingsCard>
               </SettingsSection>
               <SettingsSection title="Workflow">
                  <SettingsCard>
                     <SettingsRow
                        icon={<Target className="size-4" />}
                        title="Issue statuses"
                        description="Customize workspace issue statuses"
                        chevron
                        onClick={() => window.location.assign(`/${orgId}/settings/issue-statuses`)}
                     />
                     <SettingsRow
                        icon={<Workflow className="size-4" />}
                        title="Workflows & automations"
                        description="Auto-close and auto-archive rules"
                        chevron
                        onClick={() => setEditing('automation')}
                     />
                     <SettingsRow
                        icon={<Radar className="size-4" />}
                        title="Triage"
                        description="Streamline incoming requests"
                        trailing={<span>{team.triageEnabled ? 'Enabled' : 'Off'}</span>}
                        chevron
                        onClick={() =>
                           void updateTeam({ triageEnabled: !team.triageEnabled }).catch((caught) =>
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
                        description="Focus your team over time-boxed windows"
                        trailing={
                           <span>
                              {team.cycleCadenceWeeks
                                 ? `Every ${team.cycleCadenceWeeks} weeks`
                                 : 'Off'}
                           </span>
                        }
                        chevron
                        onClick={() => setEditing('cycles')}
                     />
                  </SettingsCard>
               </SettingsSection>
               <SettingsSection title="AI & Agents">
                  <SettingsCard>
                     <SettingsRow
                        icon={<Bot className="size-4" />}
                        title="Team agents"
                        description="Team-specific agent guidance"
                        trailing={<span>Not configured</span>}
                     />
                     <SettingsRow
                        icon={<Sparkles className="size-4" />}
                        title="Agent skills"
                        description="Skills shared with this team"
                        trailing={<span>None</span>}
                     />
                  </SettingsCard>
               </SettingsSection>
               <SettingsSection
                  title="Team hierarchy"
                  description="Nest teams to reflect your organization."
               >
                  <SettingsCard>
                     <SettingsRow
                        icon={<Users className="size-4" />}
                        title="Parent team"
                        description={
                           team.parentTeamId
                              ? 'This team inherits from a parent team.'
                              : 'No parent team'
                        }
                        chevron
                        onClick={() => setEditing('hierarchy')}
                     />
                  </SettingsCard>
               </SettingsSection>
               <SettingsSection title="Danger zone">
                  <SettingsCard>
                     <SettingsRow
                        title="Leave team"
                        description="Remove yourself as a member of this team"
                        trailing={
                           <Button size="xs" variant="ghost" onClick={() => void action('leave')}>
                              Leave team...
                           </Button>
                        }
                     />
                     <SettingsRow
                        title="Retire team"
                        description="Preserve history but stop future work"
                        muted
                        trailing={
                           <Button size="xs" variant="ghost" onClick={() => void action('retire')}>
                              Retire...
                           </Button>
                        }
                     />
                     <SettingsRow
                        title="Delete team"
                        description="Schedule deletion with a 30-day restoration window"
                        muted
                        trailing={
                           <Button size="xs" variant="ghost" onClick={() => void action('delete')}>
                              Delete...
                           </Button>
                        }
                     />
                  </SettingsCard>
               </SettingsSection>
            </div>
            <TeamSettingsDialog
               kind={editing}
               team={workspaceTeam}
               teams={allTeams}
               templates={templates}
               onOpenChange={(open) => !open && setEditing(undefined)}
               onSave={updateTeam}
            />
         </div>
      </div>
   );
}
