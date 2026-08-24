'use client';

import { Button } from '@/components/ui/button';
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

/** Workspace "AI & Agents" settings retained as an explicit unavailable capability. */
export default function AiAgents() {
   return (
      <SettingsShell
         title="AI & Agents"
         description="AI agent services are not enabled in this Flowie deployment"
      >
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Usage feedback"
                  description="AI usage feedback is unavailable because AI services are not enabled"
                  trailing={<span>Unavailable</span>}
                  muted
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="LNDev Agent"
            description="Create issues and answer questions about your workspace"
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
                     muted
                  />
               ))}
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Agent integrations"
            description="Integrations available to the agent"
            action={
               <Button
                  size="xs"
                  variant="secondary"
                  disabled
                  title="Agent integrations are not available"
               >
                  Browse integrations
               </Button>
            }
         >
            <SettingsCard>
               <SettingsRow
                  icon={<RiSlackFill className="size-4" />}
                  title="Slack"
                  description="Slack integration is not enabled for this Flowie deployment"
                  trailing={<span>Unavailable</span>}
                  muted
               />
               <SettingsRow
                  icon={<MessageCircleQuestion className="size-4" />}
                  title="Asks for Slack"
                  description="Slack Ask workflows are not enabled for this Flowie deployment"
                  trailing={<span>Unavailable</span>}
                  muted
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
