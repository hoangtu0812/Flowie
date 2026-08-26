'use client';

import { Plus } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Personal settings for the workspace agent. */
export default function AgentPersonalization() {
   return (
      <SettingsShell
         title="Agent personalization"
         description="Personal settings for Flowie automation (coming soon)"
      >
         <SettingsSection
            title="Guidance"
            description="Provide personal instructions and context for the agent when responding to conversations"
         >
            <textarea
               placeholder="Enter personal guidance for the agent (optional)..."
               disabled
               aria-disabled="true"
               className="w-full min-h-36 rounded-lg border bg-container p-4 text-sm outline-none resize-y placeholder:text-muted-foreground opacity-60 cursor-not-allowed"
            />
         </SettingsSection>

         <SettingsSection
            title="Skills"
            description="Reusable prompts auto-selected by the agent or invoked via slash commands"
         >
            <SettingsCard>
               <SettingsRow
                  title="No skills created"
                  description="Skills are not available in Flowie yet."
                  disabled
                  trailing={
                     <span
                        aria-disabled="true"
                        className="inline-flex size-7 items-center justify-center rounded-md opacity-60 cursor-not-allowed"
                     >
                        <Plus className="size-4" />
                     </span>
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="MCP connectors"
            description="Agent connectors are not available in Flowie yet."
         >
            <SettingsCard>
               <SettingsRow
                  title="Agent MCP access disabled in this workspace"
                  description="This feature will be enabled with Flowie automation in a later release."
                  disabled
                  trailing={<span className="text-xs text-muted-foreground">Unavailable</span>}
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
