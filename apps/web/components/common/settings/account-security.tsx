'use client';

import { KeyRound, Laptop } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Security settings only expose capabilities with a backing service. */
export default function AccountSecurity() {
   return (
      <SettingsShell title="Security & access">
         <SettingsSection
            title="Sessions"
            description="Session management is not exposed in the current deployment."
         >
            <SettingsCard>
               <SettingsRow
                  icon={<Laptop className="size-4" />}
                  title="Session details unavailable"
                  description="The application can sign in and out, but it does not yet provide a session list or remote revoke API."
                  muted
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Passkeys"
            description="Passkey registration is not enabled in the current deployment."
         >
            <SettingsCard>
               <SettingsRow
                  title="Passkeys unavailable"
                  description="No passkey credential service is configured."
                  muted
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Personal API keys"
            description="Personal API keys are not available in this deployment."
         >
            <SettingsCard>
               <SettingsRow
                  icon={<KeyRound className="size-4" />}
                  title="No personal API key service"
                  description="Flowie exposes its internal REST API only to authenticated application sessions."
                  muted
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Signing keys"
            description="Code-signing integration is not part of this project-management deployment."
         >
            <SettingsCard>
               <SettingsRow
                  title="Signing keys unavailable"
                  description="No signing-key storage or code-review feature is enabled."
                  muted
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
