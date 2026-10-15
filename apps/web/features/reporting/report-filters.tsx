'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/reporting/messages.vi';

import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { recentQuery, type ReportQuery } from './types';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export function ReportFilters({
   workspace,
   teams,
   value,
   onApply,
}: {
   workspace: string;
   teams: { id: string; name: string }[];
   value: ReportQuery;
   onApply: (query: ReportQuery) => void;
}) {
   const tx = useMessages(messages);

   const [draft, setDraft] = useState(value),
      [status, setStatus] = useState(''),
      [statuses, setStatuses] = useState<{ id: string; name: string; teamId: string | null }[]>([]),
      [error, setError] = useState('');
   const projects = usePagedResource<{ id: string; name: string }>(
      `${api}/projects?${new URLSearchParams({ workspaceId: workspace, ...(draft.selection.teamId ? { teamId: draft.selection.teamId } : {}) })}`
   );
   useEffect(() => {
      let active = true;
      void authenticatedFetch(`${api}/issue-statuses?workspaceId=${encodeURIComponent(workspace)}`)
         .then((response) =>
            responseData<{ id: string; name: string; teamId: string | null }[]>(response)
         )
         .then((rows) => {
            if (active) setStatuses(rows);
         })
         .catch((reason) => {
            if (active) setError(String(reason));
         });
      return () => {
         active = false;
      };
   }, [workspace]);
   const choose = (selection: Partial<ReportQuery['selection']>) =>
      setDraft({ ...draft, selection: { ...draft.selection, ...selection } });
   return (
      <VStack
         as="form"
         gap={3}
         width="100%"
         onSubmit={(event) => {
            event.preventDefault();
            setError('');
            onApply({
               ...draft,
               selection: {
                  ...draft.selection,
                  filters: status
                     ? [{ columnId: 'status', type: 'option', operator: 'is', values: [status] }]
                     : [],
               },
            });
         }}
      >
         <HStack gap={2} wrap="wrap">
            {[7, 30, 90, 365].map((days) => (
               <Button
                  key={days}
                  label={tx('Last {value0} days', { value0: days })}
                  onClick={() => {
                     try {
                        const next = {
                           ...recentQuery(days, draft.timezone),
                           weekStart: draft.weekStart,
                           selection: draft.selection,
                        };
                        setDraft(next);
                     } catch {
                        setError(tx('Enter a valid IANA timezone before choosing a date preset.'));
                     }
                  }}
               />
            ))}
         </HStack>
         <HStack gap={3} wrap="wrap" width="100%">
            <TextInput
               label={tx('Report from date')}
               description={tx('YYYY-MM-DD, inclusive')}
               value={draft.fromDate}
               onChange={(fromDate) => setDraft({ ...draft, fromDate })}
            />
            <TextInput
               label={tx('Report to date')}
               description={tx('YYYY-MM-DD, inclusive; at most 366 days')}
               value={draft.toDate}
               onChange={(toDate) => setDraft({ ...draft, toDate })}
            />
            <TextInput
               label={tx('Report timezone')}
               value={draft.timezone}
               onChange={(timezone) => setDraft({ ...draft, timezone })}
            />
            <Selector
               label={tx('Report week starts')}
               value={String(draft.weekStart)}
               options={[
                  { value: '0', label: tx('Monday') },
                  { value: '6', label: tx('Sunday') },
                  { value: '5', label: tx('Saturday') },
               ]}
               onChange={(value) => setDraft({ ...draft, weekStart: Number(value) })}
            />
         </HStack>
         <HStack gap={3} wrap="wrap" width="100%">
            <Selector
               label={tx('Report team')}
               value={draft.selection.teamId ?? ''}
               options={[
                  { value: '', label: tx('All accessible teams') },
                  ...teams.map((row) => ({ value: row.id, label: row.name })),
               ]}
               onChange={(value) => {
                  choose({ teamId: value || undefined, projectId: undefined });
                  setStatus('');
               }}
            />
            <Selector
               label={tx('Report project')}
               value={draft.selection.projectId ?? ''}
               options={[
                  { value: '', label: tx('All accessible projects') },
                  ...projects.items.map((row) => ({ value: row.id, label: row.name })),
               ]}
               onChange={(value) => choose({ projectId: value || undefined })}
            />
            <Selector
               label={tx('Report status')}
               value={status}
               options={[
                  { value: '', label: tx('All current statuses') },
                  ...statuses
                     .filter(
                        (row) =>
                           !draft.selection.teamId ||
                           !row.teamId ||
                           row.teamId === draft.selection.teamId
                     )
                     .map((row) => ({ value: row.id, label: row.name })),
               ]}
               onChange={setStatus}
            />
            <TextInput
               label={tx('Report task search')}
               value={draft.selection.query ?? ''}
               onChange={(query) => choose({ query: query || undefined })}
            />
         </HStack>
         <CheckboxInput
            label={tx('Include sub-issues in reports')}
            value={draft.selection.includeSubIssues ?? true}
            onChange={(includeSubIssues) => choose({ includeSubIssues })}
         />
         {projects.error || projects.page?.nextCursor ? (
            <ResourcePagination
               count={projects.items.length}
               {...projects}
               label={tx('project options')}
            />
         ) : null}
         {error && <Text role="alert">{error}</Text>}
         <Button label={tx('Apply report filters')} type="submit" variant="primary" />
      </VStack>
   );
}
