'use client';

import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { INTEGRATION_LOGOS } from './integration-logos';
import {
   DiscordIntegrationDialog,
   type DiscordStatus,
   loadDiscordStatus,
} from '@/components/settings/discord-integration';

const DISCORD = {
   id: 'discord',
   name: 'Discord',
   description: 'Deliver supported workspace events through a Discord webhook',
};

function DiscordIcon({ size = 36 }: { size?: number }) {
   const Logo = INTEGRATION_LOGOS.discord;
   return (
      <span
         className="rounded-md border bg-background inline-flex items-center justify-center shrink-0"
         style={{ width: size, height: size }}
         aria-hidden
      >
         <Logo className="size-[60%]" />
      </span>
   );
}

function DiscordCard({ status, onClick }: { status?: DiscordStatus; onClick: () => void }) {
   return (
      <button
         onClick={onClick}
         className="flex items-start gap-3 rounded-lg border bg-container p-3 text-left hover:bg-accent/50 transition-colors"
      >
         <DiscordIcon />
         <span className="flex flex-col gap-0.5 min-w-0">
            <span className="flex items-center gap-2">
               <span className="text-sm font-medium truncate">{DISCORD.name}</span>
               {status?.enabled && (
                  <span className="text-[11px] text-muted-foreground border rounded px-1 py-px leading-none shrink-0">
                     Enabled
                  </span>
               )}
            </span>
            <span className="text-xs text-muted-foreground line-clamp-2">
               {DISCORD.description}
            </span>
         </span>
      </button>
   );
}

/** Original integrations directory composition, populated only by deployed integrations. */
export default function Integrations() {
   const [query, setQuery] = useState('');
   const [discordOpen, setDiscordOpen] = useState(false);
   const [discord, setDiscord] = useState<DiscordStatus>();

   useEffect(() => {
      void loadDiscordStatus()
         .then(setDiscord)
         .catch(() => setDiscord(undefined));
   }, []);

   const visible = useMemo(() => {
      const needle = query.trim().toLowerCase();
      return (
         !needle ||
         DISCORD.name.toLowerCase().includes(needle) ||
         DISCORD.description.toLowerCase().includes(needle)
      );
   }, [query]);

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">
            <div className="flex flex-col gap-1">
               <h1 className="text-2xl font-medium">Integrations</h1>
               <p className="text-sm text-muted-foreground">
                  Enhance your workspace with deployed add-ons and integrations
               </p>
            </div>

            <div className="relative">
               <Search className="size-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
               <Input
                  placeholder="Search integrations"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-8 h-9"
               />
            </div>

            {query.trim() ? (
               <section className="flex flex-col gap-3">
                  <h2 className="text-base font-medium">{visible ? '1 result' : '0 results'}</h2>
                  {visible && (
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <DiscordCard status={discord} onClick={() => setDiscordOpen(true)} />
                     </div>
                  )}
               </section>
            ) : (
               <>
                  {discord?.enabled && (
                     <section className="flex flex-col gap-3">
                        <h2 className="text-base font-medium">Enabled</h2>
                        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                           <button
                              onClick={() => setDiscordOpen(true)}
                              className="flex flex-col items-start gap-2 rounded-lg border bg-container p-3 w-32 shrink-0 hover:bg-accent/50 transition-colors"
                           >
                              <DiscordIcon size={28} />
                              <span className="flex flex-col items-start">
                                 <span className="text-xs font-medium">Discord</span>
                                 <span className="text-[11px] text-muted-foreground">Enabled</span>
                              </span>
                           </button>
                        </div>
                     </section>
                  )}

                  <section className="flex flex-col gap-3">
                     <h2 className="text-base font-medium">Notifications</h2>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <DiscordCard status={discord} onClick={() => setDiscordOpen(true)} />
                     </div>
                  </section>
               </>
            )}
         </div>
         <DiscordIntegrationDialog
            open={discordOpen}
            onOpenChange={setDiscordOpen}
            onSaved={(status) => setDiscord(status)}
         />
      </div>
   );
}
