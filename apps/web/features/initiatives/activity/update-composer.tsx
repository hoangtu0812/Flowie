'use client';

import { useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { useMessages } from '@/features/shared/use-messages';
import { useDateFormatter } from '@/features/shared/account-time';
import type { Initiative } from '@/components/common/initiatives/initiative-ui-adapter';
import type { LiveInitiative } from '@/components/common/initiatives/use-live-initiatives';
import { HealthBadge, healthOptions } from './health-badge';
import { messages } from './messages.vi';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export function UpdateComposer({
   workspace,
   initiative,
   onPosted,
}: {
   workspace: string;
   initiative: Initiative;
   onPosted: (update: LiveInitiative['updates'][number]) => void;
}) {
   const tx = useMessages(messages);
   const date = useDateFormatter();
   const [text, setText] = useState('');
   const [health, setHealth] = useState<string>(
      initiative.health.id === 'no-update' ? 'on-track' : initiative.health.id
   );
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState('');
   const [notice, setNotice] = useState('');
   const pending = useRef(false);
   const alive = useRef(true);
   useEffect(() => {
      alive.current = true;
      return () => {
         alive.current = false;
      };
   }, []);
   const post = async () => {
      if (pending.current || !text.trim()) return;
      pending.current = true;
      setBusy(true);
      setError('');
      setNotice('');
      try {
         const update = await responseData<LiveInitiative['updates'][number]>(
            await authenticatedFetch(`${api}/initiatives/${initiative.id}/updates`, {
               method: 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ workspaceId: workspace, body: text.trim(), health }),
            }),
            tx('Could not post initiative update.')
         );
         if (!alive.current) return;
         setText('');
         setNotice(tx('Update posted'));
         onPosted(update);
      } catch (reason) {
         if (alive.current)
            setError(
               reason instanceof Error ? reason.message : tx('Could not post initiative update.')
            );
      } finally {
         pending.current = false;
         if (alive.current) setBusy(false);
      }
   };
   return (
      <VStack
         as="form"
         gap={3}
         className="rounded-lg border p-4"
         aria-label={tx('Initiative update')}
         onSubmit={(event) => {
            event.preventDefault();
            void post();
         }}
      >
         <HStack gap={3} align="center" wrap="wrap">
            <h2 className="text-sm font-medium">{tx('Initiative update')}</h2>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button
                     size="xs"
                     variant="ghost"
                     className="p-0 h-auto"
                     disabled={busy}
                     aria-label={tx('Update health')}
                  >
                     <HealthBadge health={health} />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="start">
                  {healthOptions.map((option) => (
                     <DropdownMenuItem key={option.value} onSelect={() => setHealth(option.value)}>
                        {tx(option.label)}
                     </DropdownMenuItem>
                  ))}
               </DropdownMenuContent>
            </DropdownMenu>
         </HStack>
         <textarea
            aria-label={tx('Initiative update text')}
            value={text}
            readOnly={busy}
            maxLength={5000}
            onChange={(event) => {
               setText(event.target.value);
               setNotice('');
            }}
            onKeyDown={(event) => {
               if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void post();
               }
            }}
            placeholder={tx('Write an initiative update…')}
            className="w-full min-h-24 resize-y bg-transparent text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring rounded placeholder:text-muted-foreground"
         />
         <HStack
            as="dl"
            gap={4}
            wrap="wrap"
            className="border-l-2 pl-4 text-xs text-muted-foreground"
         >
            <VStack gap={1}>
               <dt>{tx('Owner')}</dt>
               <dd className="text-foreground">{initiative.owner?.name ?? tx('Unassigned')}</dd>
            </VStack>
            <VStack gap={1}>
               <dt>{tx('Target date')}</dt>
               <dd className="text-foreground">
                  {date(initiative.targetDate?.slice(0, 10) ?? null)}
               </dd>
            </VStack>
            <VStack gap={1}>
               <dt>{tx('Projects')}</dt>
               <dd className="text-foreground">
                  {tx('{completed} of {total} completed', {
                     completed: initiative.projects.filter(
                        (project) => project.status.category === 'completed'
                     ).length,
                     total: initiative.projects.length,
                  })}
               </dd>
            </VStack>
         </HStack>
         {error && (
            <p role="alert" className="text-sm text-destructive">
               {error}
            </p>
         )}
         <HStack justify="between" align="center" gap={3}>
            <p role="status" className="text-xs text-muted-foreground">
               {notice}
            </p>
            <Button type="submit" size="xs" disabled={busy || !text.trim()}>
               {busy ? tx('Posting…') : tx('Post update')}
            </Button>
         </HStack>
      </VStack>
   );
}
