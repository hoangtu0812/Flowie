'use client';

import {
   DiscordIntegrationDialog,
   loadDiscordStatus,
   type DiscordStatus,
} from '@/components/settings/discord-integration';
import {
   TeamsIntegrationDialog,
   loadTeamsStatus,
   microsoftSignInEnabled,
   type TeamsStatus,
} from '@/components/settings/teams-integration';
import {
   SharepointIntegrationDialog,
   loadSharepointConnection,
   type SharepointConnection,
} from '@/components/settings/sharepoint-integration';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, FolderUp, MessagesSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import { INTEGRATION_LOGOS } from './integration-logos';
import { McpSettings } from '@/components/settings/mcp/mcp-settings';
import { SettingsShell } from './shared';

const DiscordLogo = INTEGRATION_LOGOS.discord;

export default function Integrations() {
   const [dialogOpen, setDialogOpen] = useState(false);
   const [status, setStatus] = useState<DiscordStatus>();
   const [teamsAvailable, setTeamsAvailable] = useState(false);
   const [teamsOpen, setTeamsOpen] = useState(false);
   const [teamsStatus, setTeamsStatus] = useState<TeamsStatus>();
   const [sharepointOpen, setSharepointOpen] = useState(false);
   const [sharepoint, setSharepoint] = useState<SharepointConnection>();

   useEffect(() => {
      void loadSharepointConnection()
         .then(setSharepoint)
         .catch(() => setSharepoint(undefined));
      void loadDiscordStatus()
         .then(setStatus)
         .catch(() => setStatus(null));
      void microsoftSignInEnabled().then((available) => {
         setTeamsAvailable(available);
         if (available)
            void loadTeamsStatus()
               .then(setTeamsStatus)
               .catch(() => setTeamsStatus(null));
      });
   }, []);

   return (
      <>
         <SettingsShell
            title="Integrations"
            description="Connect Discord or Microsoft Teams notifications, SharePoint publishing, and authorize AI access to project work."
         >
            <section className="flex flex-col gap-3">
               <h2 className="text-base font-medium">Discord</h2>
               <div className="flex items-center gap-3 rounded-lg border bg-container p-4">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
                     <DiscordLogo className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                     <p className="text-sm font-medium">Discord</p>
                     <p className="mt-0.5 text-xs text-muted-foreground">
                        Send supported Flowie workspace events to a Discord webhook.
                     </p>
                  </div>
                  <Button size="xs" variant="ghost" onClick={() => setDialogOpen(true)}>
                     {status?.enabled ? 'Configured' : 'Connect'}
                     <ArrowUpRight className="size-3.5" />
                  </Button>
               </div>
            </section>
            {teamsAvailable && (
               <section className="flex flex-col gap-3">
                  <h2 className="text-base font-medium">Microsoft Teams</h2>
                  <div className="flex items-center gap-3 rounded-lg border bg-container p-4">
                     <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
                        <MessagesSquare className="size-5 text-[#5b5fc7]" />
                     </span>
                     <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">Microsoft Teams</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                           Send supported Flowie workspace events to a Teams channel. Projects can
                           also connect their own channel.
                        </p>
                     </div>
                     <Button size="xs" variant="ghost" onClick={() => setTeamsOpen(true)}>
                        {teamsStatus?.enabled ? 'Configured' : 'Connect'}
                        <ArrowUpRight className="size-3.5" />
                     </Button>
                  </div>
               </section>
            )}
            <section className="flex flex-col gap-3">
               <h2 className="text-base font-medium">SharePoint</h2>
               <div className="flex items-center gap-3 rounded-lg border bg-container p-4">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
                     <FolderUp className="size-5 text-[#038387]" />
                  </span>
                  <div className="min-w-0 flex-1">
                     <p className="text-sm font-medium">SharePoint</p>
                     <p className="mt-0.5 text-xs text-muted-foreground">
                        Publish approved project documents to each project&apos;s SharePoint folder
                        as Markdown.
                     </p>
                  </div>
                  <Button size="xs" variant="ghost" onClick={() => setSharepointOpen(true)}>
                     {sharepoint?.configured ? 'Configured' : 'Connect'}
                     <ArrowUpRight className="size-3.5" />
                  </Button>
               </div>
            </section>
            <McpSettings />
         </SettingsShell>
         <SharepointIntegrationDialog
            open={sharepointOpen}
            onOpenChange={setSharepointOpen}
            onSaved={setSharepoint}
         />
         <DiscordIntegrationDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSaved={(nextStatus) => setStatus(nextStatus)}
         />
         {teamsAvailable && (
            <TeamsIntegrationDialog
               open={teamsOpen}
               onOpenChange={setTeamsOpen}
               onSaved={(nextStatus) => setTeamsStatus(nextStatus)}
            />
         )}
      </>
   );
}
