'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { downloadFile } from '@/features/shared/download-file';

type AuditEvent = {
   id: string;
   action: string;
   entityType: string;
   entityId: string | null;
   source: string;
   createdAt: string;
   actor: { id: string; name: string } | null;
   metadata: { fields?: string[]; tool?: string; outcome?: string };
};
type Member = { user: { id: string; name: string } };
type Filters = { actor: string; entity: string; source: string; from: string; through: string };
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const today = () => new Date().toISOString().slice(0, 10);
function initialFilters(): Filters {
   const from = new Date();
   from.setUTCDate(from.getUTCDate() - 30);
   return {
      actor: 'all',
      entity: 'all',
      source: 'all',
      from: from.toISOString().slice(0, 10),
      through: today(),
   };
}
function filterQuery(workspace: string, filters: Filters) {
   const query = new URLSearchParams({ workspaceId: workspace });
   for (const [key, value] of [
      ['actorId', filters.actor],
      ['entityType', filters.entity],
      ['source', filters.source],
   ])
      if (value !== 'all') query.set(key, value);
   for (const value of [filters.from, filters.through]) {
      if (
         !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
         Number.isNaN(Date.parse(value + 'T00:00:00Z')) ||
         new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value
      )
         throw new Error('Use valid dates in YYYY-MM-DD format.');
   }
   if (filters.from > filters.through)
      throw new Error('The end date must be on or after the start date.');
   const end = new Date(filters.through + 'T00:00:00Z');
   end.setUTCDate(end.getUTCDate() + 1);
   query.set('since', filters.from + 'T00:00:00Z');
   query.set('until', end.toISOString());
   return query.toString();
}

export default function AuditPage() {
   const { orgId } = useParams<{ orgId: string }>();
   const [retry, setRetry] = useState(0);
   const [scope, setScope] = useState<{ org: string; workspace?: string; error?: string }>();
   useEffect(() => {
      let active = true;
      void loadCurrentWorkspaceMembership(orgId)
         .then((membership) => {
            if (active)
               setScope({
                  org: orgId,
                  ...(membership.role === 'MEMBER'
                     ? { error: 'Workspace administrator access is required.' }
                     : { workspace: membership.workspace.id }),
               });
         })
         .catch((reason) => {
            if (active)
               setScope({
                  org: orgId,
                  error: reason instanceof Error ? reason.message : 'Could not load audit log.',
               });
         });
      return () => {
         active = false;
      };
   }, [orgId, retry]);
   if (scope?.org === orgId && scope.error)
      return (
         <RecoveryScreen
            title="Audit log unavailable"
            message={scope.error}
            retry={() => setRetry((value) => value + 1)}
         />
      );
   if (scope?.org !== orgId || !scope.workspace)
      return (
         <DesignSurface>
            <Text role="status">Loading audit log…</Text>
         </DesignSurface>
      );
   return <AuditCenter key={`${orgId}:${scope.workspace}`} workspace={scope.workspace} />;
}

function AuditCenter({ workspace }: { workspace: string }) {
   const active = useRef(true);
   useEffect(() => {
      active.current = true;
      return () => {
         active.current = false;
      };
   }, []);
   const [draft, setDraft] = useState(initialFilters);
   const [applied, setApplied] = useState(() => filterQuery(workspace, initialFilters()));
   const [members, setMembers] = useState<Member[]>([]);
   const [error, setError] = useState('');
   const [exporting, setExporting] = useState(false);
   const history = usePagedResource<AuditEvent>(`${api}/audit?${applied}`);
   useEffect(() => {
      let active = true;
      void authenticatedFetch(`${api}/workspaces/${workspace}/members`)
         .then((response) => responseData<Member[]>(response))
         .then((data) => {
            if (active) setMembers(data);
         })
         .catch(() => {
            if (active) setMembers([]);
         });
      return () => {
         active = false;
      };
   }, [workspace]);
   const actors = new Map(members.map((row) => [row.user.id, row.user.name]));
   for (const row of history.items) if (row.actor) actors.set(row.actor.id, row.actor.name);
   const exportCsv = async () => {
      if (exporting) return;
      setExporting(true);
      setError('');
      try {
         const response = await authenticatedFetch(`${api}/audit/export?${applied}`);
         if (!response.ok) await responseData(response, 'Could not export audit events.');
         const content = await response.blob();
         if (active.current) downloadFile(content, 'flowie-audit.csv');
      } catch (reason) {
         if (active.current)
            setError(reason instanceof Error ? reason.message : 'Could not export audit events.');
      } finally {
         if (active.current) setExporting(false);
      }
   };
   return (
      <DesignSurface>
         <VStack padding={6} gap={4} width="100%" className="h-full overflow-auto">
            <Heading level={1}>Workspace audit log</Heading>
            <Text>
               Events follow your current access. Historical events with an unproven entity scope
               are excluded; UNKNOWN means the original event did not record its transport source.
            </Text>
            <VStack
               as="form"
               gap={3}
               onSubmit={(event) => {
                  event.preventDefault();
                  try {
                     setApplied(filterQuery(workspace, draft));
                     setError('');
                     history.reload();
                  } catch (reason) {
                     setError(reason instanceof Error ? reason.message : 'Invalid filters.');
                  }
               }}
            >
               <HStack gap={3} wrap="wrap">
                  <Selector
                     label="Audit actor"
                     value={draft.actor}
                     onChange={(actor) => setDraft({ ...draft, actor })}
                     options={[
                        { value: 'all', label: 'All actors' },
                        ...[...actors].map(([value, label]) => ({ value, label })),
                     ]}
                  />
                  <Selector
                     label="Audit entity"
                     value={draft.entity}
                     onChange={(entity) => setDraft({ ...draft, entity })}
                     options={[
                        'all',
                        'issue',
                        'project',
                        'document',
                        'initiative',
                        'comment',
                        'issue-status',
                        'mcp-tool',
                        'mcp-connection',
                        'agent-run-management',
                     ].map((value) => ({ value, label: value === 'all' ? 'All entities' : value }))}
                  />
                  <Selector
                     label="Audit source"
                     value={draft.source}
                     onChange={(source) => setDraft({ ...draft, source })}
                     options={['all', 'WEB', 'AI', 'SYSTEM', 'UNKNOWN'].map((value) => ({
                        value,
                        label: value === 'all' ? 'All sources' : value,
                     }))}
                  />
               </HStack>
               <HStack gap={3} wrap="wrap">
                  <TextInput
                     label="From date (UTC)"
                     description="YYYY-MM-DD"
                     value={draft.from}
                     onChange={(from) => setDraft({ ...draft, from })}
                  />
                  <TextInput
                     label="Through date (UTC)"
                     description="YYYY-MM-DD"
                     value={draft.through}
                     onChange={(through) => setDraft({ ...draft, through })}
                  />
                  <Button label="Apply audit filters" type="submit" />
                  <Button
                     label="Export filtered audit CSV"
                     isLoading={exporting}
                     onClick={() => void exportCsv()}
                  />
               </HStack>
            </VStack>
            <Text type="supporting">
               Export uses the applied filters, up to 10,000 events and 10 MB. Formula-like text
               cells have a leading tab for spreadsheet viewing.
            </Text>
            {error && <Text role="alert">{error}</Text>}
            <List hasDividers>
               {history.items.map((row) => (
                  <ListItem
                     key={row.id}
                     label={row.action}
                     description={`${new Date(row.createdAt).toLocaleString()} · ${row.source} · ${row.actor?.name ?? 'System'} · ${row.entityType} ${row.entityId ?? ''}${row.metadata.fields?.length ? ' · ' + row.metadata.fields.join(', ') : ''}`}
                  />
               ))}
            </List>
            {!history.loading && !history.error && !history.items.length && (
               <Text>No accessible events match the applied filters.</Text>
            )}
            <ResourcePagination count={history.items.length} {...history} label="audit events" />
         </VStack>
      </DesignSurface>
   );
}
