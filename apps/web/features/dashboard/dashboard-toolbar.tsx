'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Input } from '@/components/ui/input';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { useMessages } from '@/features/shared/use-messages';
import { localToday, recentQuery, type ReportQuery } from '@/features/reporting/types';
import { messages } from './messages.vi';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export function DashboardToolbar({
   workspace,
   value,
   onApply,
   heading,
   actions,
}: {
   workspace: string;
   value: ReportQuery;
   onApply: (value: ReportQuery) => void;
   heading: ReactNode;
   actions: ReactNode;
}) {
   const tx = useMessages(messages);
   const [draft, setDraft] = useState(value),
      [error, setError] = useState('');
   const projects = usePagedResource<{ id: string; name: string }>(
      `${api}/projects?workspaceId=${encodeURIComponent(workspace)}`
   );
   useEffect(() => {
      setDraft(value);
      setError('');
   }, [value]);
   const apply = () => {
      const span = (Date.parse(draft.toDate) - Date.parse(draft.fromDate)) / 86400000;
      if (!Number.isFinite(span) || span < 0 || span >= 366) {
         setError(tx('Choose an ordered date range of at most 366 days.'));
         return;
      }
      setError('');
      onApply(draft);
   };
   return (
      <VStack gap={3} width="100%">
         <HStack gap={4} wrap="wrap" justify="between" align="end">
            {heading}
            <HStack
               as="form"
               gap={2}
               wrap="wrap"
               align="end"
               className="w-full sm:w-auto"
               onSubmit={(event) => {
                  event.preventDefault();
                  apply();
               }}
            >
               <VStack gap={1} className="w-full sm:w-40">
                  <Text type="supporting">{tx('Project')}</Text>
                  <Selector
                     size="md"
                     label={tx('Project')}
                     isLabelHidden
                     width="100%"
                     value={draft.selection.projectId ?? ''}
                     options={[
                        { value: '', label: tx('All projects') },
                        ...projects.items.map((row) => ({ value: row.id, label: row.name })),
                     ]}
                     onChange={(projectId) =>
                        setDraft({
                           ...draft,
                           selection: { ...draft.selection, projectId: projectId || undefined },
                        })
                     }
                  />
               </VStack>
               <VStack as="label" gap={1} className="min-w-0 flex-1 sm:flex-none sm:w-36">
                  <Text type="supporting">{tx('From')}</Text>
                  <Input
                     type="date"
                     value={draft.fromDate}
                     max={draft.toDate}
                     className="h-8 w-full min-w-0"
                     onChange={(event) => setDraft({ ...draft, fromDate: event.target.value })}
                  />
               </VStack>
               <VStack as="label" gap={1} className="min-w-0 flex-1 sm:flex-none sm:w-36">
                  <Text type="supporting">{tx('To')}</Text>
                  <Input
                     type="date"
                     value={draft.toDate}
                     min={draft.fromDate}
                     max={localToday(value.timezone)}
                     className="h-8 w-full min-w-0"
                     onChange={(event) => setDraft({ ...draft, toDate: event.target.value })}
                  />
               </VStack>
               <HStack gap={2} align="center" className="w-full sm:w-auto">
                  <Button label={tx('Apply')} size="md" type="submit" variant="secondary" />
                  <Button
                     label={tx('Reset')}
                     size="md"
                     variant="ghost"
                     onClick={() =>
                        onApply({ ...recentQuery(30, value.timezone), weekStart: value.weekStart })
                     }
                  />
               </HStack>
            </HStack>
         </HStack>
         <HStack gap={2} wrap="wrap" justify="between" align="center">
            <HStack
               gap={1}
               wrap="wrap"
               align="center"
               className="max-w-full rounded-lg border bg-surface-muted p-1"
            >
               {(
                  [
                     ['1 week', 7],
                     ['1 month', 30],
                     ['1 quarter', 90],
                     ['1 year', 365],
                  ] as const
               ).map(([label, days]) => (
                  <Button
                     key={days}
                     size="sm"
                     label={tx(label)}
                     variant={
                        (Date.parse(value.toDate) - Date.parse(value.fromDate)) / 86400000 + 1 ===
                        days
                           ? 'secondary'
                           : 'ghost'
                     }
                     onClick={() =>
                        onApply({
                           ...recentQuery(days, value.timezone),
                           weekStart: value.weekStart,
                           selection: value.selection,
                        })
                     }
                  />
               ))}
               <Text color="secondary" className="px-2 text-xs">
                  {value.fromDate} – {value.toDate} · {value.timezone}
               </Text>
            </HStack>
            {actions}
         </HStack>
         {error && <Text role="alert">{error}</Text>}
         {(projects.error || projects.page?.nextCursor) && (
            <ResourcePagination count={projects.items.length} {...projects} label={tx('Project')} />
         )}
      </VStack>
   );
}
