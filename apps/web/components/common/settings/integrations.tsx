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

const DiscordLogo = INTEGRATION_LOGOS.discord;

/** The public integration catalog is intentionally limited to the one supported Flowie integration. */
export default function Integrations() {
   const [dialogOpen, setDialogOpen] = useState(false);
   const [status, setStatus] = useState<DiscordStatus>();

   useEffect(() => {
      void loadDiscordStatus()
         .then(setStatus)
         .catch(() => setStatus(null));
   }, []);

   return (
      <>
         <div className="h-full w-full overflow-y-auto">
            <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
               <div className="flex flex-col gap-1">
                  <h1 className="text-2xl font-medium">Integrations</h1>
                  <p className="text-sm text-muted-foreground">
                     Connect Discord to deliver Flowie workspace notifications.
                  </p>
               </div>

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
            </div>
         </div>
         <DiscordIntegrationDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSaved={(nextStatus) => setStatus(nextStatus)}
         />
      </>
   );
}
