'use client';

import { Mail, Monitor, Slack, Smartphone } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const CHANNELS = [
   {
      icon: <Monitor className="size-4" />,
      title: 'Desktop',
      status: 'Desktop delivery is not available in this deployment',
   },
   {
      icon: <Smartphone className="size-4" />,
      title: 'Mobile',
      status: 'Mobile delivery is not available in this deployment',
   },
   { icon: <Mail className="size-4" />, title: 'Email', status: 'Email delivery is disabled' },
   { icon: <Slack className="size-4" />, title: 'Slack', status: 'Slack is not connected' },
];

/** Personal notification settings (push channels + product updates). */
export default function AccountNotifications() {
   return (
      <SettingsShell title="Notifications">
         <SettingsSection
            title="Push notifications"
            description="Inbox notifications are active. Desktop, mobile, email, and Slack delivery are not enabled for this deployment."
         >
            <SettingsCard>
               {CHANNELS.map((channel) => (
                  <SettingsRow
                     key={channel.title}
                     icon={channel.icon}
                     title={channel.title}
                     description={channel.status}
                     muted
                  />
               ))}
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Product updates"
            description="Preferences for product-update delivery are not configured yet."
         >
            <SettingsCard>
               <SettingsRow
                  title="Show updates in sidebar"
                  description="No product-update preference service is configured."
                  muted
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
