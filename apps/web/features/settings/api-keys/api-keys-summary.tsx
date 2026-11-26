'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowUpRight, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMessages } from '@/features/shared/use-messages';
import { isInactive, useApiKeys } from './use-api-keys';
import { messages } from './messages.vi';

/**
 * API keys card on Settings → Integrations, next to the MCP card: key counts and a link to
 * Settings → API keys (Manage). API keys are for other systems; MCP connections are for AI clients.
 * VI: Thẻ API key trên Settings → Integrations, cạnh thẻ MCP: số key và liên kết tới Settings →
 * VI: API keys (Manage). API key dành cho hệ thống khác; kết nối MCP dành cho AI client.
 */
export function ApiKeysSummary() {
   const tx = useMessages(messages);
   const state = useApiKeys();
   const { orgId } = useParams<{ orgId: string }>();
   const inactive = state.keys.filter(isInactive).length;

   return (
      <section className="flex flex-col gap-3">
         <h2 className="text-base font-medium">{tx('API keys')}</h2>
         <div className="flex items-center gap-3 rounded-lg border bg-container p-4">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
               <KeyRound className="size-5 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
               <p className="text-sm font-medium">{tx('API keys')}</p>
               <p className="mt-0.5 text-xs text-muted-foreground">
                  {tx('Let other systems read Flowie data, such as the news feed, over REST.')}{' '}
                  <span role={state.error ? 'alert' : undefined}>
                     {state.error ??
                        (state.loading
                           ? tx('Loading API keys…')
                           : state.canManage
                             ? tx('{active} active · {inactive} inactive keys', {
                                  active: state.keys.length - inactive,
                                  inactive,
                               })
                             : tx('Only workspace owners and admins can manage API keys.'))}
                  </span>
               </p>
            </div>
            {state.canManage && (
               <Button asChild size="xs" variant="ghost">
                  <Link href={`/${orgId}/settings/api-keys`}>
                     {tx('Manage')}
                     <ArrowUpRight className="size-3.5" />
                  </Link>
               </Button>
            )}
         </div>
      </section>
   );
}
