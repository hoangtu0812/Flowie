'use client';

import { Button } from '@/components/ui/button';
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
      if (!workspaceId) return;
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
         window.alert(payload?.message ?? 'Could not update team settings.');
         return;
      }
      const payload = (await response.json()) as { data: Partial<WorkspaceTeam> };
      setTeam((current) => (current ? { ...current, ...payload.data } : current));
   };

   const editGeneral = () => {
      const name = window.prompt('Team name:', team.name)?.trim();
      if (!name) return;
      const description = window.prompt('Team description:', team.description ?? '')?.trim();
      if (description === undefined) return;
      void updateTeam({ name, description });
   };

   const editNumberSetting = (
      label: string,
      key: 'cycleCadenceWeeks' | 'autoCloseDays' | 'autoArchiveDays',
      current: number | null,
      maximum: number
   ) => {
      const raw = window.prompt(`${label} (leave empty to turn off):`, current?.toString() ?? '');
      if (raw === null) return;
      if (!raw.trim()) return void updateTeam({ [key]: null });
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1 || value > maximum) {
         window.alert(`Enter a whole number from 1 to ${maximum}.`);
         return;
      }
      void updateTeam({ [key]: value });
   };

   const editTemplate = () => {
      const choices = templates.map((template) => template.name).join(', ');
      const current = templates.find((item) => item.id === team.defaultIssueTemplateId)?.name ?? '';
      const value = window.prompt(
         `Default issue template (${choices || 'none available'}):`,
         current
      );
      if (value === null) return;
      const template = templates.find(
         (item) => item.name.toLowerCase() === value.trim().toLowerCase()
      );
      if (value.trim() && !template) return window.alert('Template not found.');
      void updateTeam({ defaultIssueTemplateId: template?.id ?? null });
   };

   const editAutomation = () => {
      const closeRaw = window.prompt(
         'Automatically close completed issues after how many days? Leave empty to turn off.',
         team.autoCloseDays?.toString() ?? ''
      );
      if (closeRaw === null) return;
      const archiveRaw = window.prompt(
         'Automatically archive closed issues after how many days? Leave empty to turn off.',
         team.autoArchiveDays?.toString() ?? ''
      );
      if (archiveRaw === null) return;
      const parseDays = (value: string) => (value.trim() ? Number(value) : null);
      const autoCloseDays = parseDays(closeRaw);
      const autoArchiveDays = parseDays(archiveRaw);
      if (
         [autoCloseDays, autoArchiveDays].some(
            (value) => value !== null && (!Number.isInteger(value) || value < 1 || value > 3650)
         )
      ) {
         window.alert('Enter whole numbers from 1 to 3650.');
         return;
      }
      void updateTeam({ autoCloseDays, autoArchiveDays });
   };

   const editHierarchy = () => {
      const candidates = teams.filter((candidate) => candidate.id !== team.id);
      const current =
         candidates.find((candidate) => candidate.id === team.parentTeamId)?.name ?? '';
      const value = window.prompt(
         `Parent team (${candidates.map((candidate) => candidate.name).join(', ') || 'none'}):`,
         current
      );
      if (value === null) return;
      const parent = candidates.find(
         (candidate) => candidate.name.toLowerCase() === value.trim().toLowerCase()
      );
      if (value.trim() && !parent) return window.alert('Team not found.');
      void updateTeam({ parentTeamId: parent?.id ?? null });
   };

   return (
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
                        onClick={editGeneral}
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
                        onClick={editTemplate}
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
                        onClick={editAutomation}
                     />
                     <SettingsRow
                        icon={<Radar className="size-4" />}
                        title="Triage"
                        description="Streamline how you handle requests from outside your team"
                        trailing={<span>{team.triageEnabled ? 'Enabled' : 'Off'}</span>}
                        chevron
                        onClick={() => void updateTeam({ triageEnabled: !team.triageEnabled })}
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
                        onClick={() =>
                           editNumberSetting(
                              'Cycle cadence in weeks',
                              'cycleCadenceWeeks',
                              team.cycleCadenceWeeks,
                              12
                           )
                        }
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
                        onClick={editHierarchy}
                     />
                  </SettingsCard>
               </SettingsSection>

               <SettingsSection title="Danger zone">
                  <SettingsCard>
                     <SettingsRow
                        title="Leave team"
                        description="Remove yourself as a member of this team"
                        muted
                        trailing={
                           <Button size="xs" variant="ghost" disabled>
                              Leave team...
                           </Button>
                        }
                     />
                     <SettingsRow
                        title="Retire team"
                        description="Prevent creating and updating issues in this team while preserving all historical data"
                        muted
                        trailing={
                           <Button size="xs" variant="ghost" disabled>
                              Retire...
                           </Button>
                        }
                     />
                     <SettingsRow
                        title="Delete team"
                        description="Permanently delete this team and all its data, with a 30-day restoration window"
                        muted
                        trailing={
                           <Button size="xs" variant="ghost" disabled>
                              Delete...
                           </Button>
                        }
                     />
                  </SettingsCard>
               </SettingsSection>
            </div>
         </div>
      </div>
   );
}
