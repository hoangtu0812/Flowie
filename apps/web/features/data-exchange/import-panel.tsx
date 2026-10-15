'use client';
import { useDateFormatter } from '@/features/shared/account-time';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/data-exchange/messages.vi';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { List, ListItem } from '@astryxdesign/core/List';
import {
   exchange,
   importFields,
   importRunning,
   type ImportResult,
   type RecentImport,
} from './client';

export function ImportPanel({
   workspace,
   teams,
}: {
   workspace: string;
   teams: { id: string; name: string }[];
}) {
   const tx = useMessages(messages);
   const dateLabel = useDateFormatter();

   const [team, setTeam] = useState(teams[0]?.id ?? '');
   const [csv, setCsv] = useState(
      'externalId,title,priority,issueType\nexample-1,Example task,HIGH,TASK'
   );
   const [source, setSource] = useState('manual-csv');
   const [duplicates, setDuplicates] = useState('skip');
   const [columns, setColumns] = useState<string[]>([]);
   const [mapping, setMapping] = useState<Record<string, string>>({});
   const [operation, setOperation] = useState<ImportResult>();
   const [recent, setRecent] = useState<RecentImport[]>([]);
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState('');
   const alive = useRef(true),
      key = useRef('');
   const scope = new URLSearchParams({ workspaceId: workspace }).toString();
   useEffect(() => {
      alive.current = true;
      return () => {
         alive.current = false;
      };
   }, []);
   useEffect(() => {
      let current = true;
      void exchange<RecentImport[]>(`/imports?${scope}`)
         .then((data) => {
            if (current) setRecent(data);
         })
         .catch((reason) => {
            if (current) setError(String(reason));
         });
      return () => {
         current = false;
      };
   }, [scope, operation?.state]);
   useEffect(() => {
      if (!operation || !importRunning(operation.state)) return;
      let current = true;
      const timer = window.setTimeout(() => {
         void exchange<ImportResult>(`/imports/${operation.id}?${scope}`)
            .then((data) => {
               if (alive.current && current) setOperation(data);
            })
            .catch((reason) => {
               if (alive.current && current) setError(String(reason));
            });
      }, 1500);
      return () => {
         current = false;
         window.clearTimeout(timer);
      };
   }, [operation, scope]);
   const reset = () => {
      key.current = '';
      setOperation(undefined);
      setError('');
   };
   const run = async (action: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
         await action();
      } catch (reason) {
         if (alive.current)
            setError(reason instanceof Error ? reason.message : tx('Import failed.'));
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   const inspect = () =>
      run(async () => {
         const result = await exchange<{ columns: string[]; rowCount: number }>('/csv/inspect', {
            workspaceId: workspace,
            teamId: team,
            csv,
         });
         if (!alive.current) return;
         setColumns(result.columns);
         setMapping(
            Object.fromEntries(
               importFields
                  .filter((field) => result.columns.includes(field))
                  .map((field) => [field, field])
            )
         );
         reset();
      });
   const preview = () =>
      run(async () => {
         if (!key.current) key.current = crypto.randomUUID();
         const result = await exchange<ImportResult>('/imports/preview', {
            workspaceId: workspace,
            teamId: team,
            csv,
            sourceKey: source,
            requestKey: key.current,
            duplicateMode: duplicates,
            mapping,
         });
         if (alive.current) setOperation(result);
      });
   const command = (name: string) =>
      run(async () => {
         const result = await exchange<ImportResult>(
            `/imports/${operation!.id}/${name}?${scope}`,
            {}
         );
         if (alive.current) setOperation(result);
      });
   const open = (id: string) =>
      run(async () => {
         const result = await exchange<ImportResult>(`/imports/${id}?${scope}`);
         if (alive.current) setOperation(result);
      });
   return (
      <VStack gap={4}>
         <Heading level={2}>{tx('Import tasks and bugs')}</Heading>
         <Text>
            {tx(
               'Paste UTF-8 CSV with a header and up to 1,000 data rows / 2 MB. The source namespace and required externalId prevent duplicate creation across retries and later imports. Existing tasks are never overwritten.'
            )}
         </Text>
         <HStack gap={3} wrap="wrap">
            <Selector
               label={tx('Import team')}
               isDisabled={busy}
               value={team}
               options={teams.map((row) => ({ value: row.id, label: row.name }))}
               onChange={(value) => {
                  setTeam(value);
                  reset();
               }}
            />
            <TextInput
               label={tx('Import source namespace')}
               isDisabled={busy}
               value={source}
               onChange={(value) => {
                  setSource(value);
                  reset();
               }}
               description={tx(
                  'Stable name, for example jira-support. Letters, digits, dot, underscore or hyphen.'
               )}
            />
            <Selector
               label={tx('Duplicate handling')}
               isDisabled={busy}
               value={duplicates}
               onChange={(value) => {
                  setDuplicates(value);
                  reset();
               }}
               options={[
                  { value: 'skip', label: tx('Skip duplicates') },
                  { value: 'error', label: tx('Report duplicate errors') },
               ]}
            />
         </HStack>
         <TextArea
            label={tx('CSV content')}
            isDisabled={busy}
            value={csv}
            onChange={(value) => {
               setCsv(value);
               setColumns([]);
               setMapping({});
               reset();
            }}
            rows={6}
            maxLength={2 * 1024 * 1024}
         />
         <Button
            label={tx('Inspect CSV columns')}
            onClick={() => void inspect()}
            isLoading={busy}
            isDisabled={!team}
         />
         {!!columns.length && (
            <>
               <Text>
                  {tx(
                     'Map required externalId and title, then optional fields. Reference columns use Flowie IDs. Dates use ISO 8601; enum values use TASK/BUG, NONE/LOW/MEDIUM/HIGH/URGENT and LOW/MEDIUM/HIGH/CRITICAL severity.'
                  )}
               </Text>
               <HStack gap={3} wrap="wrap">
                  {importFields.map((field) => (
                     <Selector
                        key={field}
                        label={tx('CSV mapping {value0}', { value0: field })}
                        isDisabled={busy}
                        value={mapping[field] ?? ''}
                        options={[
                           { value: '', label: tx('Do not import') },
                           ...columns.map((value) => ({ value, label: value })),
                        ]}
                        onChange={(value) => {
                           setMapping((previous) => {
                              const next = { ...previous };
                              if (value === '') delete next[field];
                              else next[field] = value;
                              return next;
                           });
                           reset();
                        }}
                     />
                  ))}
               </HStack>
               <Button
                  label={tx('Preview CSV import')}
                  onClick={() => void preview()}
                  isLoading={busy}
                  isDisabled={!mapping.externalId || !mapping.title}
               />
            </>
         )}
         {error && <Text role="alert">{error}</Text>}
         {operation && (
            <>
               <Heading level={3}>{tx('Import preview and results')}</Heading>
               <Text role="status">
                  {tx('Import {value0} · {value1}', {
                     value0: operation.state,
                     value1: Object.entries(operation.counts)
                        .map(([name, count]) => `${name}: ${count}`)
                        .join(' · '),
                  })}
               </Text>
               <Text>
                  {tx('Preview is frozen and expires at')} {dateLabel(operation.expiresAt)}
                  {tx(
                     '. Confirming imports only PENDING rows. Invalid and duplicate rows remain visible. A stopped import preserves tasks already created.'
                  )}
               </Text>
               <HStack gap={3} wrap="wrap">
                  {operation.state === 'PREVIEW' && (
                     <Button
                        label={tx('Confirm import valid rows')}
                        onClick={() => void command('apply')}
                        isLoading={busy}
                        isDisabled={!operation.counts.PENDING}
                     />
                  )}
                  {['PREVIEW', 'QUEUED', 'RUNNING'].includes(operation.state) && (
                     <Button
                        label={tx('Cancel import')}
                        onClick={() => void command('cancel')}
                        isLoading={busy}
                     />
                  )}
                  <Button
                     label={tx('Refresh import results')}
                     onClick={() => void open(operation.id)}
                     isLoading={busy}
                  />
               </HStack>
               <List hasDividers>
                  {operation.rows.map((row) => (
                     <ListItem
                        key={row.rowNumber}
                        label={tx('Row {value0}: {value1}', {
                           value0: row.rowNumber,
                           value1: row.title || '(missing title)',
                        })}
                        description={`${row.externalId ?? '(missing externalId)'} · ${row.issueType ?? ''} · ${row.priority ?? ''} · ${row.state}${row.identifier ? ' · ' + row.identifier : ''}${row.errorCode ? ' · ' + row.errorCode : ''}`}
                     />
                  ))}
               </List>
               {operation.nextAfter !== null && (
                  <Button
                     label={tx('Load more import rows')}
                     isLoading={busy}
                     isDisabled={importRunning(operation.state)}
                     onClick={() =>
                        void run(async () => {
                           const data = await exchange<ImportResult>(
                              `/imports/${operation.id}?${scope}&after=${operation.nextAfter}`
                           );
                           if (alive.current)
                              setOperation({ ...data, rows: [...operation.rows, ...data.rows] });
                        })
                     }
                  />
               )}
            </>
         )}
         <Heading level={3}>{tx('Your latest 20 imports')}</Heading>
         <Text>
            {tx(
               'Preview and result details are retained for 30 days. External IDs remain registered while their tasks exist.'
            )}
         </Text>
         <List hasDividers>
            {recent.map((row) => (
               <ListItem
                  key={row.id}
                  label={`${row.sourceKey} · ${row.state}`}
                  description={dateLabel(row.createdAt)}
                  endContent={
                     <Button
                        label={tx('Open import {value0}', { value0: row.id })}
                        onClick={() => void open(row.id)}
                        isDisabled={busy}
                     />
                  }
               />
            ))}
         </List>
      </VStack>
   );
}
