'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { useIssuesStore } from '@/store/issues-store';
import { bulkQuery } from './bulk-query';

type Operation = {
   id: string;
   state: string;
   changes: Record<string, unknown>;
   counts: Record<string, number>;
   unavailableSelected?: number;
   items: {
      issue_id: string;
      identifier: string;
      state: string;
      stale: boolean;
      error_code?: string;
   }[];
};
type Recent = { id: string; state: string; createdAt: string };
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const running = (state?: string) => state === 'QUEUED' || state === 'RUNNING';
const fields = ['priority', 'statusId', 'assigneeId', 'projectId', 'cycleId', 'labelIds'];
const fieldLabels = ['Priority', 'Status', 'Assignee', 'Project', 'Cycle', 'Replace labels'];

export function BulkIssueActions() {
   const { workspaceId, pageQuery, accountId, loadScope } = useIssuesStore();
   if (!workspaceId || !pageQuery) return null;
   return (
      <BulkEditor
         key={`${accountId}:${workspaceId}:${loadScope}:${pageQuery}`}
         workspace={workspaceId}
         query={pageQuery}
      />
   );
}

function BulkEditor({ workspace, query }: { workspace: string; query: string }) {
   const { issues, statuses, members, projects, labels, cycles, retryIssues } = useIssuesStore();
   const alive = useRef(true);
   const requestKey = useRef('');
   const [open, setOpen] = useState(false);
   const [selection, setSelection] = useState('selected');
   const [selected, setSelected] = useState<string[]>([]);
   const [confirm, setConfirm] = useState(false);
   const [field, setField] = useState('priority');
   const [value, setValue] = useState('');
   const [labelIds, setLabelIds] = useState<string[]>([]);
   const [operation, setOperation] = useState<Operation>();
   const [recent, setRecent] = useState<Recent[]>([]);
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState('');
   const [visibleResults, setVisibleResults] = useState(20);
   const endpoint = `${api}/bulk-issues`;
   const scope = new URLSearchParams({ workspaceId: workspace });
   useEffect(() => {
      alive.current = true;
      return () => {
         alive.current = false;
      };
   }, []);
   useEffect(() => {
      if (!open) return;
      void authenticatedFetch(`${endpoint}?${scope}`)
         .then((response) => responseData<Recent[]>(response))
         .then((data) => {
            if (alive.current) setRecent(data);
         })
         .catch((reason) => {
            if (alive.current) setError(String(reason));
         });
      // The editor remounts when its account or list scope changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [open, operation?.state]);
   useEffect(() => {
      if (!operation || !running(operation.state)) return;
      const timer = window.setTimeout(() => {
         void authenticatedFetch(`${endpoint}/${operation.id}?${scope}`)
            .then((response) => responseData<Operation>(response))
            .then((data) => {
               if (!alive.current) return;
               setOperation(data);
               if (!running(data.state)) void retryIssues();
            })
            .catch((reason) => {
               if (alive.current) setError(String(reason));
            });
      }, 1500);
      return () => window.clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [operation]);
   const options =
      field === 'priority'
         ? ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((value) => ({ value, label: value }))
         : (field === 'statusId'
              ? statuses
              : field === 'assigneeId'
                ? members
                : field === 'projectId'
                  ? projects
                  : cycles
           ).map((row) => ({ value: row.id, label: row.name }));
   if (['assigneeId', 'projectId', 'cycleId'].includes(field))
      options.unshift({ value: '__clear__', label: 'Clear value' });
   const resetPreview = () => {
      setOperation(undefined);
      requestKey.current = '';
      setError('');
   };
   const act = async (command: 'preview' | 'execute' | 'cancel' | 'reload', id = operation?.id) => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
         let body: unknown;
         if (command === 'preview') {
            requestKey.current ||= crypto.randomUUID();
            body = {
               workspaceId: workspace,
               requestKey: requestKey.current,
               selection,
               confirmAll: confirm,
               query: bulkQuery(query),
               items: issues
                  .filter((row) => selected.includes(row.id))
                  .map((row) => {
                     if (!row.version) throw new Error('Reload issues before making bulk changes.');
                     return { id: row.id, version: row.version };
                  }),
               changes: {
                  [field]: field === 'labelIds' ? labelIds : value === '__clear__' ? null : value,
               },
            };
         }
         const url =
            command === 'preview'
               ? `${endpoint}/preview`
               : `${endpoint}/${id}${command === 'reload' ? '' : `/${command}`}?${scope}`;
         const data = await responseData<Operation>(
            await authenticatedFetch(url, {
               method: command === 'reload' ? 'GET' : 'POST',
               headers: { 'content-type': 'application/json' },
               body: body ? JSON.stringify(body) : undefined,
            })
         );
         if (!alive.current) return;
         setOperation(data);
         if (command === 'cancel') void retryIssues();
      } catch (reason) {
         if (alive.current)
            setError(reason instanceof Error ? reason.message : 'Bulk operation failed.');
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   return (
      <>
         <Button label="Bulk changes" size="sm" onClick={() => setOpen(true)} />
         <Dialog isOpen={open} onOpenChange={setOpen} purpose="form" padding={5}>
            <VStack gap={4}>
               <DialogHeader title="Bulk issue changes" onOpenChange={setOpen} />
               <Text>
                  Preview up to 1000 issues. Each issue is checked again for access and conflicting
                  edits before applying.
               </Text>
               {error && <Text role="alert">{error}</Text>}
               {!operation && (
                  <>
                     <Selector
                        label="Selection scope"
                        value={selection}
                        options={[
                           { value: 'selected', label: 'Selected loaded issues' },
                           { value: 'all_matching', label: 'All matching filtered issues' },
                        ]}
                        onChange={(next) => {
                           resetPreview();
                           setSelection(next);
                           setConfirm(false);
                        }}
                     />
                     {selection === 'selected' ? (
                        <MultiSelector
                           label="Selected issues"
                           options={issues.map((row) => ({
                              value: row.id,
                              label: `${row.identifier} ${row.title}`,
                           }))}
                           value={selected}
                           onChange={(next) => {
                              resetPreview();
                              setSelected(next);
                           }}
                           hasSearch
                           hasSelectAll
                           selectAllLabel="Select all loaded issues"
                        />
                     ) : (
                        <CheckboxInput
                           label="Include all matching issues, including unloaded pages"
                           value={confirm}
                           onChange={(next) => {
                              resetPreview();
                              setConfirm(next);
                           }}
                        />
                     )}
                     <Selector
                        label="Change field"
                        value={field}
                        options={fields.map((value, index) => ({
                           value,
                           label: fieldLabels[index],
                        }))}
                        onChange={(next) => {
                           resetPreview();
                           setField(next);
                           setValue('');
                        }}
                     />
                     {field === 'labelIds' ? (
                        <MultiSelector
                           label="Replacement labels"
                           value={labelIds}
                           options={labels.map((row) => ({ value: row.id, label: row.name }))}
                           onChange={(next) => {
                              resetPreview();
                              setLabelIds(next);
                           }}
                           hasSearch
                           description="An empty selection removes all labels."
                        />
                     ) : (
                        <Selector
                           label="New value"
                           value={value}
                           options={options}
                           onChange={(next) => {
                              resetPreview();
                              setValue(next);
                           }}
                        />
                     )}
                     <Button
                        label="Preview changes"
                        isLoading={busy}
                        isDisabled={
                           (field !== 'labelIds' && !value) ||
                           (selection === 'selected' ? !selected.length : !confirm)
                        }
                        onClick={() => void act('preview')}
                     />
                  </>
               )}
               {operation && (
                  <>
                     <Text role="status">
                        {operation.state} ·{' '}
                        {Object.entries(operation.counts)
                           .map(([state, count]) => `${state}: ${count}`)
                           .join(' · ')}
                     </Text>
                     <Text>
                        {Object.entries(operation.changes)
                           .map(([key, next]) => {
                              const choices =
                                 key === 'statusId'
                                    ? statuses
                                    : key === 'assigneeId'
                                      ? members
                                      : key === 'projectId'
                                        ? projects
                                        : key === 'cycleId'
                                          ? cycles
                                          : labels;
                              const display = Array.isArray(next)
                                 ? next
                                      .map(
                                         (id) =>
                                            labels.find((row) => row.id === id)?.name ??
                                            'Unavailable label'
                                      )
                                      .join(', ') || 'No labels'
                                 : next === null
                                   ? 'Clear value'
                                   : key === 'priority'
                                     ? String(next)
                                     : (choices.find((row) => row.id === next)?.name ??
                                       'Unavailable value');
                              return `${fieldLabels[fields.indexOf(key)] ?? key}: ${display}`;
                           })
                           .join(' · ')}
                     </Text>
                     {!!operation.unavailableSelected && (
                        <Text>
                           {operation.unavailableSelected} selected issues are unavailable and
                           excluded.
                        </Text>
                     )}
                     <List hasDividers>
                        {operation.items.slice(0, visibleResults).map((row) => (
                           <ListItem
                              key={row.issue_id}
                              label={row.identifier}
                              description={
                                 row.stale
                                    ? 'Changed since selection; will be skipped'
                                    : (row.error_code ?? row.state)
                              }
                           />
                        ))}
                     </List>
                     {operation.items.length > visibleResults && (
                        <Button
                           label={`Show more results (${visibleResults} of ${operation.items.length})`}
                           onClick={() => setVisibleResults((count) => count + 100)}
                        />
                     )}
                     <HStack gap={3} wrap="wrap">
                        {operation.state === 'PREVIEW' && (
                           <Button
                              label="Apply previewed changes"
                              isLoading={busy}
                              onClick={() => void act('execute')}
                           />
                        )}
                        {['PREVIEW', 'QUEUED', 'RUNNING'].includes(operation.state) && (
                           <Button
                              label="Cancel operation"
                              isDisabled={busy}
                              onClick={() => void act('cancel')}
                           />
                        )}
                        <Button
                           label="Refresh result"
                           isDisabled={busy}
                           onClick={() => void act('reload')}
                        />
                        {!running(operation.state) && (
                           <Button label="New bulk change" onClick={resetPreview} />
                        )}
                     </HStack>
                  </>
               )}
               {!!recent.length && (
                  <Selector
                     label="Recent operations"
                     value={operation?.id ?? ''}
                     options={recent.map((row) => ({
                        value: row.id,
                        label: `${row.state} · ${new Date(row.createdAt).toLocaleString()}`,
                     }))}
                     onChange={(id) => void act('reload', id)}
                     isDisabled={busy}
                  />
               )}
            </VStack>
         </Dialog>
      </>
   );
}
