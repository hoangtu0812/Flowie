'use client';

import { Button } from '@/components/ui/button';
import { FileText, Plus } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Workspace issue templates have no persistence model yet. */
export default function IssueTemplatesSettings() {
   return (
      <SettingsShell
         title="Issue templates"
         description="These templates are available when creating issues for any team in the workspace. To create templates that only apply to specific teams, add them as team templates."
      >
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="No issue templates configured"
                  description="Issue-template storage and creation are not enabled yet."
                  trailing={
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        disabled
                        title="Issue templates are not available"
                     >
                        <Plus className="size-4" />
                     </Button>
                  }
                  muted
               />
               <SettingsRow
                  icon={<FileText className="size-4" />}
                  title="Create from scratch"
                  description="Use the issue composer to create an issue without a template."
                  muted
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
