'use client';

import { Switch } from '@/components/ui/switch';
import { RiSlackFill } from '@remixicon/react';
import { Bot, MessageCircleQuestion, Radar, RefreshCcw, Sparkles, Terminal } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const AGENT_FEATURES = [
   {
      icon: <Bot className="size-4" />,
      title: 'LNDev Agent',
      description: 'Configure for your workspace',
   },
   {
      icon: <Terminal className="size-4" />,
      title: 'Coding sessions',
      description: 'Assign or ask the agent to make code changes',
   },
   {
      icon: <RefreshCcw className="size-4" />,
      title: 'Loops',
      description: 'Automated agent workflows that run on a schedule or when an issue is updated',
   },
   {
      icon: <Sparkles className="size-4" />,
      title: 'Code Intelligence',
      beta: true,
      description: 'Allow the agent to analyze and answer questions about your repositories',
   },
   {
      icon: <Radar className="size-4" />,
      title: 'Triage Intelligence',
      description:
         'Find related issues and infer properties like team, project, labels, and assignee',
   },
];

/** Workspace "AI & Agents" settings. */
export default function AiAgents() {
   return (
      <SettingsShell
         title="AI & Agents"
         description="Flowie automation is not available in this deployment yet"
      >
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Enable usage feedback"
                  description="This preference will be available when Flowie automation launches."
                  trailing={<Switch checked={false} disabled />}
                  disabled
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Flowie automation"
            description="Automation, coding sessions and agent workflows are coming soon"
         >
            <SettingsCard>
               {AGENT_FEATURES.map((feature) => (
                  <SettingsRow
                     key={feature.title}
                     icon={feature.icon}
                     title={
                        <>
                           {feature.title}
                           {feature.beta && (
                              <span className="text-[10px] font-medium uppercase tracking-wide border rounded px-1 py-px text-muted-foreground">
                                 Beta
                              </span>
                           )}
                        </>
                     }
                     description={feature.description}
                     trailing={<span>Unavailable</span>}
                     disabled
                  />
               ))}
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Agent integrations"
            description="Agent integrations are not available yet"
            action={<span className="text-xs text-muted-foreground opacity-60">Unavailable</span>}
         >
            <SettingsCard>
               <SettingsRow
                  icon={<RiSlackFill className="size-4" />}
                  title="Slack"
                  description="Will be available when Flowie automation is released."
                  trailing={<span>Unavailable</span>}
                  disabled
               />
               <SettingsRow
                  icon={<MessageCircleQuestion className="size-4" />}
                  title="Asks for Slack"
                  description="Will be available when Flowie automation is released."
                  trailing={<span>Unavailable</span>}
                  disabled
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
