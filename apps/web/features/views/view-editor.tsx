'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, VStack, Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Text } from '@astryxdesign/core/Text';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData, ApiRequestError } from '@/lib/http';
import type { LiveView } from '@/components/common/views/use-live-views';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';
import { isIssueViewConfig, type IssueViewConfig } from './config';
import { useIssuesStore } from '@/store/issues-store';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function ScopeSummary({
   config,
   entityType = 'issue',
}: {
   config: Record<string, unknown>;
   entityType?: 'issue' | 'project';
}) {
   const tx = useMessages(messages);
   const { teams, projects, members, cycles } = useIssuesStore();
   const team = config.teamId;
   const query: IssueViewConfig['query'] = isIssueViewConfig(config)
      ? config.query
      : { filters: [] };
   const { filters, ...constraints } = query;
   const details: string[] = [];
   if (constraints.noTeam) details.push(tx('No team'));
   if (constraints.noProject) details.push(tx('No project'));
   if (constraints.issueType) details.push(tx(constraints.issueType === 'BUG' ? 'Bug' : 'Task'));
   if (constraints.query) details.push(tx('Search: {query}', { query: constraints.query }));
   for (const category of constraints.categories ?? []) details.push(tx(category as 'started'));
   for (const [key, label, options] of [
      ['projectId', 'Project', projects],
      ['assigneeId', 'Assignee', members],
      ['creatorId', 'Creator', members],
      ['cycleId', 'Cycle', cycles],
   ] as const) {
      const id = constraints[key];
      if (id)
         details.push(
            `${tx(label)}: ${options.find((option) => option.id === id)?.name ?? tx(label)}`
         );
   }
   details.push(
      tx(constraints.includeSubIssues === false ? 'Excluding sub-issues' : 'Including sub-issues')
   );
   const teamName = teams.find((candidate) => candidate.id === team)?.name;
   return (
      <VStack gap={1}>
         <Text type="supporting">
            {typeof team === 'string'
               ? teamName
                  ? tx('Team: {team}', { team: teamName })
                  : tx('Team scope')
               : tx('Workspace')}
         </Text>
         <Text type="supporting">
            {filters.length
               ? tx('{count} filters', { count: filters.length })
               : tx(
                    entityType === 'issue'
                       ? 'All issues in this scope'
                       : 'All projects in this scope'
                 )}
         </Text>
         {details.length > 0 && (
            <Text type="supporting">
               {tx('Source constraints')}: {details.join(' · ')}
            </Text>
         )}
      </VStack>
   );
}

export function ViewEditor({
   workspaceId,
   config,
   view,
   entityType = 'issue',
   onClose,
   onSaved,
}: {
   workspaceId: string;
   config: Record<string, unknown>;
   view?: LiveView;
   entityType?: 'issue' | 'project';
   onClose: () => void;
   onSaved?: () => void;
}) {
   const tx = useMessages(messages);
   const router = useRouter();
   const { orgId } = useParams<{ orgId: string }>();
   const [name, setName] = useState(view?.name ?? '');
   const [description, setDescription] = useState(view?.description ?? '');
   const [shared, setShared] = useState(view?.isShared ?? false);
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string>();
   const [conflict, setConflict] = useState(false);
   const save = async () => {
      if (busy || conflict) return;
      if (name.trim().length < 2 || name.trim().length > 120) {
         setError(tx('Name must contain 2–120 characters.'));
         return;
      }
      setBusy(true);
      setError(undefined);
      try {
         const saved = await responseData<LiveView>(
            await authenticatedFetch(
               view ? `${api}/views/${view.id}?workspaceId=${workspaceId}` : `${api}/views`,
               {
                  method: view ? 'PATCH' : 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                     name: name.trim(),
                     description,
                     filters: config,
                     isShared: shared,
                     ...(view
                        ? { expectedUpdatedAt: view.updatedAt }
                        : { workspaceId, entityType }),
                  }),
               }
            ),
            tx('Could not save view.')
         );
         window.dispatchEvent(new Event('flowie:views-changed'));
         toast.success(tx('View saved.'));
         onClose();
         onSaved?.();
         if (!view) router.push(`/${orgId}/view/${saved.id}`);
      } catch (caught) {
         const stale = caught instanceof ApiRequestError && caught.status === 409;
         setConflict(stale);
         setError(
            stale
               ? tx('This view changed in another session. Reload before saving.')
               : caught instanceof Error
                 ? caught.message
                 : tx('Could not save view.')
         );
      } finally {
         setBusy(false);
      }
   };
   return (
      <Dialog
         isOpen
         aria-label={tx(view ? 'Edit view' : 'Save as view')}
         onOpenChange={(open) => {
            if (!open && !busy) onClose();
         }}
         purpose="form"
         width={480}
      >
         <Layout
            height="auto"
            padding={4}
            header={
               <DialogHeader
                  title={tx(view ? 'Edit view' : 'Save as view')}
                  onOpenChange={() => {
                     if (!busy) onClose();
                  }}
               />
            }
            footer={
               <LayoutFooter>
                  <HStack gap={2} justify="end" wrap="wrap">
                     <Button label={tx('Cancel')} isDisabled={busy} onClick={onClose} />
                     {conflict && (
                        <Button
                           label={tx('Reload view')}
                           onClick={() => window.location.assign(window.location.pathname)}
                        />
                     )}
                     <Button
                        label={tx(view ? 'Save changes' : 'Save as view')}
                        variant="primary"
                        isLoading={busy}
                        isDisabled={conflict}
                        onClick={() => void save()}
                     />
                  </HStack>
               </LayoutFooter>
            }
         >
            <LayoutContent>
               <VStack gap={4}>
                  <TextInput
                     label={tx('Name')}
                     value={name}
                     onChange={setName}
                     isRequired
                     isDisabled={busy}
                     hasAutoFocus
                     onEnter={() => void save()}
                  />
                  <TextInput
                     label={tx('Description')}
                     value={description}
                     onChange={setDescription}
                     isOptional
                     isDisabled={busy}
                  />
                  <CheckboxInput
                     label={tx('Share with workspace')}
                     value={shared}
                     onChange={setShared}
                     isDisabled={busy}
                  />
                  <ScopeSummary config={config} entityType={entityType} />
                  {error && (
                     <Text as="p" role="alert">
                        {error}
                     </Text>
                  )}
               </VStack>
            </LayoutContent>
         </Layout>
      </Dialog>
   );
}
