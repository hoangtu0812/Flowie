'use client';

import { useState } from 'react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { useMessages } from '@/features/shared/use-messages';
import type { Initiative } from '@/components/common/initiatives/initiative-ui-adapter';
import type { LiveInitiative } from '@/components/common/initiatives/use-live-initiatives';
import { UpdateComposer } from './update-composer';
import { ActivityTimeline } from './activity-timeline';
import { messages } from './messages.vi';
import type { InitiativeUpdate, InitiativeAuditEvent } from './types';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const kinds = ['updates', 'activity'] as const;
type Kind = (typeof kinds)[number];

export function InitiativeActivity({
   workspace,
   initiative,
   canPost,
   onPosted,
}: {
   workspace: string;
   initiative: Initiative;
   canPost: boolean;
   onPosted: (update: LiveInitiative['updates'][number]) => void;
}) {
   const tx = useMessages(messages);
   const [kind, setKind] = useQueryState(
      'history',
      parseAsStringLiteral(kinds).withDefault('updates')
   );
   const [revision, setRevision] = useState('');
   return (
      <VStack className="h-full w-full overflow-y-auto">
         <VStack gap={6} className="w-full max-w-3xl mx-auto px-6 lg:px-10 py-8">
            {canPost && (
               <UpdateComposer
                  workspace={workspace}
                  initiative={initiative}
                  onPosted={(update) => {
                     onPosted(update);
                     setRevision(update.id);
                     void setKind('updates');
                  }}
               />
            )}
            <HStack as="nav" gap={1} align="center" aria-label={tx('Activity view')}>
               {kinds.map((value) => (
                  <Button
                     key={value}
                     size="xs"
                     variant={kind === value ? 'secondary' : 'ghost'}
                     aria-pressed={kind === value}
                     onClick={() => void setKind(value)}
                  >
                     {value === 'updates' ? tx('Updates') : tx('Change history')}
                  </Button>
               ))}
            </HStack>
            <HistoryFeed
               key={kind}
               workspace={workspace}
               id={initiative.id}
               kind={kind}
               revision={revision}
               canPost={canPost}
            />
         </VStack>
      </VStack>
   );
}

function HistoryFeed({
   workspace,
   id,
   kind,
   revision,
   canPost,
}: {
   workspace: string;
   id: string;
   kind: Kind;
   revision: string;
   canPost: boolean;
}) {
   const tx = useMessages(messages);
   const history = usePagedResource<InitiativeUpdate | InitiativeAuditEvent>(
      `${api}/initiatives/${id}/${kind}?workspaceId=${workspace}`,
      revision
   );
   return (
      <VStack gap={5} aria-busy={history.loading}>
         <HStack align="center" justify="between" gap={3}>
            <p className="text-xs text-muted-foreground">
               {history.page
                  ? tx('{loaded} of {total} loaded', {
                       loaded: history.items.length,
                       total: history.page.total,
                    })
                  : history.loading
                    ? tx('Loading history…')
                    : ''}
            </p>
            <Button
               size="xs"
               variant="ghost"
               onClick={history.reload}
               disabled={history.loading}
               aria-label={tx('Refresh history')}
               title={tx('Refresh history')}
            >
               <RefreshCw className={cn('size-3.5', history.loading && 'animate-spin')} />
            </Button>
         </HStack>
         <ActivityTimeline items={history.items} />
         {!history.loading && !history.error && !history.items.length && (
            <VStack gap={2} align="center" paddingBlock={8}>
               <h3 className="text-sm font-medium">
                  {kind === 'updates' ? tx('No updates yet') : tx('No changes yet')}
               </h3>
               <p className="text-sm text-muted-foreground text-center">
                  {kind === 'updates'
                     ? canPost
                        ? tx('Post the first update to share progress, risks and next steps.')
                        : tx(
                             'Only workspace owners and administrators can post initiative updates.'
                          )
                     : tx('Changes to this initiative will appear here.')}
               </p>
            </VStack>
         )}
         {history.error && (
            <VStack gap={2} align="start">
               <p role="alert" className="text-sm text-destructive">
                  {history.error}
               </p>
               <Button
                  size="xs"
                  variant="outline"
                  disabled={history.loading}
                  onClick={history.page?.nextCursor ? history.loadMore : history.reload}
               >
                  {tx('Try again')}
               </Button>
            </VStack>
         )}
         {history.page?.nextCursor && !history.error && (
            <HStack justify="center">
               <Button
                  size="xs"
                  variant="outline"
                  disabled={history.loading}
                  onClick={history.loadMore}
               >
                  {history.loading ? tx('Loading history…') : tx('Load more')}
               </Button>
            </HStack>
         )}
      </VStack>
   );
}
