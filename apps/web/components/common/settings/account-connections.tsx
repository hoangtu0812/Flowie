'use client';

import {
   DiscordIntegrationDialog,
   loadDiscordStatus,
   type DiscordStatus,
} from '@/components/settings/discord-integration';
import { Button } from '@/components/ui/button';
import { ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { INTEGRATION_LOGOS } from './integration-logos';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const SlackLogo = INTEGRATION_LOGOS.slack;
const DiscordLogo = INTEGRATION_LOGOS.discord;
const GoogleCalendarLogo = INTEGRATION_LOGOS['google-calendar'];
const NotionLogo = INTEGRATION_LOGOS.notion;
const GithubLogo = INTEGRATION_LOGOS.github;

const Unavailable = () => <span className="text-sm text-muted-foreground">Unavailable</span>;

/** Only the workspace Discord webhook is active; remaining inherited account integrations are locked. */
export default function AccountConnections() {
   const [discordOpen, setDiscordOpen] = useState(false);
   const [discordStatus, setDiscordStatus] = useState<DiscordStatus>();

   useEffect(() => {
      void loadDiscordStatus()
         .then(setDiscordStatus)
         .catch(() => setDiscordStatus(null));
   }, []);

   return (
      <>
         <SettingsShell
            title="Connected accounts"
            description="Connect supported Flowie integrations. Unavailable integrations are shown for future use."
         >
            <SettingsSection>
               <SettingsCard>
                  <SettingsRow
                     icon={<DiscordLogo className="size-4" />}
                     title="Discord"
                     description="Deliver Flowie workspace notifications through a Discord webhook"
                     trailing={
                        <Button size="xs" variant="ghost" onClick={() => setDiscordOpen(true)}>
                           {discordStatus?.enabled ? 'Configured' : 'Connect'}
                           <ArrowUpRight className="size-3.5" />
                        </Button>
                     }
                  />
               </SettingsCard>
               <SettingsCard>
                  <SettingsRow
                     icon={<SlackLogo className="size-4" />}
                     title="Slack"
                     description="Slack message attribution and notifications are not available in Flowie yet"
                     trailing={<Unavailable />}
                     disabled
                  />
               </SettingsCard>
               <SettingsCard>
                  <SettingsRow
                     icon={<GoogleCalendarLogo className="size-4" />}
                     title="Google Calendar"
                     description="Calendar synchronization is not available in Flowie yet"
                     trailing={<Unavailable />}
                     disabled
                  />
               </SettingsCard>
               <SettingsCard>
                  <SettingsRow
                     icon={<NotionLogo className="size-4" />}
                     title="Notion"
                     description="Notion previews are not available in Flowie yet"
                     trailing={
                        <Button size="xs" variant="ghost" disabled>
                           Connect
                           <ArrowUpRight className="size-3.5" />
                        </Button>
                     }
                     disabled
                  />
               </SettingsCard>
               <SettingsCard>
                  <SettingsRow
                     icon={<GithubLogo className="size-4" />}
                     title="GitHub"
                     description="GitHub account linking is not available in Flowie yet"
                     trailing={<Unavailable />}
                     disabled
                  />
                  <SettingsRow
                     title="Code review relay"
                     description="GitHub review attribution will be available with the Code & reviews feature"
                     trailing={<Unavailable />}
                     disabled
                  />
               </SettingsCard>
            </SettingsSection>
         </SettingsShell>
         <DiscordIntegrationDialog
            open={discordOpen}
            onOpenChange={setDiscordOpen}
            onSaved={(status) => setDiscordStatus(status)}
         />
      </>
   );
}
