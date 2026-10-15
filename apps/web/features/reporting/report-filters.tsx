'use client';
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
                  label={`Last ${days} days`}
                  onClick={() => {
                     try {
                        const next = {
                           ...recentQuery(days, draft.timezone),
                           weekStart: draft.weekStart,
                           selection: draft.selection,
                        };
                        setDraft(next);
                     } catch {
                        setError('Enter a valid IANA timezone before choosing a date preset.');
                     }
                  }}
               />
            ))}
         </HStack>
         <HStack gap={3} wrap="wrap" width="100%">
            <TextInput
               label="Report from date"
               description="YYYY-MM-DD, inclusive"
               value={draft.fromDate}
               onChange={(fromDate) => setDraft({ ...draft, fromDate })}
            />
            <TextInput
               label="Report to date"
               description="YYYY-MM-DD, inclusive; at most 366 days"
               value={draft.toDate}
               onChange={(toDate) => setDraft({ ...draft, toDate })}
            />
            <TextInput
               label="Report timezone"
               value={draft.timezone}
               onChange={(timezone) => setDraft({ ...draft, timezone })}
            />
            <Selector
               label="Report week starts"
               value={String(draft.weekStart)}
               options={[
                  { value: '0', label: 'Monday' },
                  { value: '6', label: 'Sunday' },
               ]}
               onChange={(value) => setDraft({ ...draft, weekStart: Number(value) })}
            />
         </HStack>
         <HStack gap={3} wrap="wrap" width="100%">
            <Selector
               label="Report team"
               value={draft.selection.teamId ?? ''}
               options={[
                  { value: '', label: 'All accessible teams' },
                  ...teams.map((row) => ({ value: row.id, label: row.name })),
               ]}
               onChange={(value) => {
                  choose({ teamId: value || undefined, projectId: undefined });
                  setStatus('');
               }}
            />
            <Selector
               label="Report project"
               value={draft.selection.projectId ?? ''}
               options={[
                  { value: '', label: 'All accessible projects' },
                  ...projects.items.map((row) => ({ value: row.id, label: row.name })),
               ]}
               onChange={(value) => choose({ projectId: value || undefined })}
            />
            <Selector
               label="Report status"
               value={status}
               options={[
                  { value: '', label: 'All current statuses' },
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
               label="Report task search"
               value={draft.selection.query ?? ''}
               onChange={(query) => choose({ query: query || undefined })}
            />
         </HStack>
         <CheckboxInput
            label="Include sub-issues in reports"
            value={draft.selection.includeSubIssues ?? true}
            onChange={(includeSubIssues) => choose({ includeSubIssues })}
         />
         {projects.error || projects.page?.nextCursor ? (
            <ResourcePagination
               count={projects.items.length}
               {...projects}
               label="project options"
            />
         ) : null}
         {error && <Text role="alert">{error}</Text>}
         <Button label="Apply report filters" type="submit" variant="primary" />
      </VStack>
   );
}
