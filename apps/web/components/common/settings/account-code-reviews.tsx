'use client';

import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Flowie manages work across project types; source-code review is intentionally out of scope. */
export default function AccountCodeReviews() {
   return (
      <SettingsShell
         title="Code & reviews"
         description="Flowie is not connected to source-code repositories or pull-request reviews."
      >
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Not enabled"
                  description="Use Flowie to plan and track work across product, operations, marketing, research, events, and client projects."
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
