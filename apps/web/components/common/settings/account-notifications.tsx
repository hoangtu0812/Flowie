'use client';

import { Switch } from '@/components/ui/switch';
import { Mail, MessageCircle, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
   DiscordIntegrationDialog,
   type DiscordStatus,
   loadDiscordStatus,
} from '@/components/settings/discord-integration';
import { EnabledDot, SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Original notification settings composition, with only deployed channels shown as active. */
export default function AccountNotifications() {
   const [discordOpen, setDiscordOpen] = useState(false);
   const [discord, setDiscord] = useState<DiscordStatus>();

   useEffect(() => {
      void loadDiscordStatus()
         .then(setDiscord)
         .catch(() => setDiscord(undefined));
   }, []);

   const discordDescription = discord?.enabled ? (
      <EnabledDot>Enabled for supported workspace events</EnabledDot>
   ) : discord ? (
      'Configured, but delivery is disabled'
   ) : (
      'Configure a Discord webhook'
   );

   return (
      <SettingsShell title="Notifications">
         <SettingsSection
            title="Push notifications"
            description="All notifications appear in your Flowie inbox. External delivery is only available for configured channels."
         >
            <SettingsCard>
               <SettingsRow
                  icon={<Smartphone className="size-4" />}
                  title="Mobile"
                  description="Mobile delivery is being considered and is not enabled"
                  muted
               />
               <SettingsRow
                  icon={<Mail className="size-4" />}
                  title="Email"
                  description="Email delivery is temporarily disabled"
                  muted
               />
               <SettingsRow
                  icon={<MessageCircle className="size-4" />}
                  title="Discord"
                  description={discordDescription}
                  chevron
                  onClick={() => setDiscordOpen(true)}
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Updates from Flowie"
            description="Product announcement delivery preferences are not configured yet."
         >
            <h3 className="text-sm font-medium mt-2">Changelog</h3>
            <SettingsCard>
               <SettingsRow
                  title="Show updates in sidebar"
                  description="Product update delivery is not available"
                  trailing={<Switch disabled />}
                  muted
               />
               <SettingsRow
                  title="Changelog newsletter"
                  description="Email delivery is temporarily disabled"
                  trailing={<Switch disabled />}
                  muted
               />
            </SettingsCard>

            <h3 className="text-sm font-medium mt-2">Marketing</h3>
            <SettingsCard>
               <SettingsRow
                  title="Marketing and onboarding"
                  description="Marketing delivery is not enabled"
                  trailing={<Switch disabled />}
                  muted
               />
            </SettingsCard>

            <h3 className="text-sm font-medium mt-2">Other updates</h3>
            <SettingsCard>
               <SettingsRow
                  title="Invite accepted"
                  description="This event remains available in the Flowie inbox"
                  trailing={<Switch disabled />}
                  muted
               />
               <SettingsRow
                  title="Privacy and legal updates"
                  description="No external delivery channel is enabled"
                  trailing={<Switch disabled />}
                  muted
               />
            </SettingsCard>
         </SettingsSection>

         <DiscordIntegrationDialog
            open={discordOpen}
            onOpenChange={setDiscordOpen}
            onSaved={(status) => setDiscord(status)}
         />
      </SettingsShell>
   );
}
