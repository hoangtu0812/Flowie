'use client';

import { Button } from '@/components/ui/button';
import {
   loadCurrentWorkspaceTeams,
   type WorkspaceTeam,
} from '@/components/common/teams/team-types';
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
import { useEffect, useState } from 'react';
import { SettingsCard, SettingsRow, SettingsSection } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type IssueOptions = { statuses: Array<{ id: string }> };

interface TeamSettingsProps {
   teamId: string;
}

/** Per-team settings keeps the original layout while using live team and issue-option data. */
export default function TeamSettings({ teamId }: TeamSettingsProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const [team, setTeam] = useState<WorkspaceTeam>();
   const [statusCount, setStatusCount] = useState(0);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

   useEffect(() => {
      setState('loading');
      void loadCurrentWorkspaceTeams()
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
            setStatusCount(options.data.statuses.length);
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
                        trailing={unavailable}
                        muted
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
                     />
                     <SettingsRow
                        icon={<Zap className="size-4" />}
                        title="Slack notifications"
                        description="Broadcast notifications to Slack"
                        trailing={unavailable}
                        muted
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
                        trailing={unavailable}
                        muted
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
                        trailing={unavailable}
                        muted
                     />
                     <SettingsRow
                        icon={<Radar className="size-4" />}
                        title="Triage"
                        description="Streamline how you handle requests from outside your team"
                        trailing={unavailable}
                        muted
                     />
                     <SettingsRow
                        icon={<RefreshCcw className="size-4" />}
                        title="Cycles"
                        description="Focus your team over short, time-boxed windows"
                        trailing={<span>{team.cycleCount} cycles</span>}
                     />
                  </SettingsCard>
               </SettingsSection>

               <SettingsSection title="AI & Agents">
                  <SettingsCard>
                     <SettingsRow
                        icon={<Bot className="size-4" />}
                        title="Team agents"
                        description="Add guidance for how agents should operate within this team"
                        trailing={unavailable}
                        muted
                     />
                     <SettingsRow
                        icon={<Sparkles className="size-4" />}
                        title="Agent skills"
                        description="Agent skills shared with this team"
                        trailing={unavailable}
                        muted
                     />
                     <SettingsRow
                        icon={<RefreshCcw className="size-4" />}
                        title="Loops"
                        description="Automated agent workflows that run on a schedule or when an issue is updated"
                        trailing={unavailable}
                        muted
                     />
                     <SettingsRow
                        icon={<Zap className="size-4" />}
                        title="Project updates"
                        description="Automatically generate updates using recent activity and defined rules"
                        trailing={unavailable}
                        muted
                     />
                     <SettingsRow
                        icon={<FileText className="size-4" />}
                        title="Resolved thread summaries"
                        description="Automatically generate summaries for resolved threads"
                        trailing={unavailable}
                        muted
                     />
                  </SettingsCard>
               </SettingsSection>

               <SettingsSection
                  title="Team hierarchy"
                  description="Teams can be nested to reflect your team structure and share workflows and settings."
               >
                  <SettingsCard>
                     <SettingsRow title="Team hierarchy" trailing={unavailable} muted />
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
