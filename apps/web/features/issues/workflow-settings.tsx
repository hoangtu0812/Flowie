'use client';
import { useEnumLabel } from '@/features/shared/enum-labels';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import { responseData } from '@/lib/http';

type WorkflowStatus = {
   id: string;
   name: string;
   category: string;
   color: string;
   position: number;
   issueCount: number;
   updatedAt: string;
   teamId: string | null;
   requiredBeforeStart: boolean;
};
const categories = ['TRIAGE', 'BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED'];
const blank = {
   name: '',
   category: 'UNSTARTED',
   color: '#99a2b2',
   position: 0,
   requiredBeforeStart: false,
};
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function WorkflowSettings() {
   const tx = useMessages(messages);
   const enumLabel = useEnumLabel();

   const { orgId } = useParams<{ orgId: string }>();
   const currentOrg = useRef(orgId);
   currentOrg.current = orgId;
   const generation = useRef(0);
   const [workspace, setWorkspace] = useState('');
   const [canEdit, setCanEdit] = useState(false);
   const [rows, setRows] = useState<WorkflowStatus[]>([]);
   const [draft, setDraft] = useState(blank);
   const [selected, setSelected] = useState<WorkflowStatus>();
   const [editing, setEditing] = useState(false);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState('');
   const load = useCallback(async () => {
      const request = ++generation.current;
      setLoading(true);
      setError('');
      try {
         const membership = await loadCurrentWorkspaceMembership(orgId);
         const data = await responseData<WorkflowStatus[]>(
            await authenticatedFetch(`${api}/issue-statuses?workspaceId=${membership.workspace.id}`)
         );
         if (request !== generation.current || currentOrg.current !== orgId) return;
         setWorkspace(membership.workspace.id);
         setCanEdit(membership.role !== 'MEMBER');
         setRows(data);
      } catch (reason) {
         if (request === generation.current && currentOrg.current === orgId)
            setError(reason instanceof Error ? reason.message : tx('Could not load workflow.'));
      } finally {
         if (request === generation.current && currentOrg.current === orgId) setLoading(false);
      }
   }, [orgId, tx]);
   useEffect(() => {
      setWorkspace('');
      setRows([]);
      setCanEdit(false);
      setEditing(false);
      setSaving(false);
      void load();
      return () => {
         generation.current++;
      };
   }, [load]);
   const save = async (remove = false) => {
      if (saving || !canEdit || !workspace) return;
      if (remove && !window.confirm(tx('Delete this unused status?'))) return;
      setSaving(true);
      setError('');
      const scope = orgId;
      try {
         const query = new URLSearchParams({ workspaceId: workspace });
         if (remove && selected) query.set('expectedUpdatedAt', selected.updatedAt);
         await responseData(
            await authenticatedFetch(
               selected ? `${api}/issue-statuses/${selected.id}?${query}` : `${api}/issue-statuses`,
               {
                  method: remove ? 'DELETE' : selected ? 'PATCH' : 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: remove
                     ? undefined
                     : JSON.stringify(
                          selected
                             ? { ...draft, expectedUpdatedAt: selected.updatedAt }
                             : { ...draft, workspaceId: workspace }
                       ),
               }
            )
         );
         if (currentOrg.current !== scope) return;
         setEditing(false);
         setSelected(undefined);
         await load();
      } catch (reason) {
         if (currentOrg.current === scope)
            setError(reason instanceof Error ? reason.message : tx('Could not save workflow.'));
      } finally {
         if (currentOrg.current === scope) setSaving(false);
      }
   };
   return (
      <DesignSurface>
         <VStack padding={6} gap={5} className="h-full overflow-auto" width="100%">
            <Heading level={1}>{tx('Issue statuses')}</Heading>
            <Text>{tx('Workspace workflow. Team statuses are labeled separately.')}</Text>
            {error && <Text role="alert">{error}</Text>}
            <HStack gap={3}>
               <Button
                  label={tx('Reload workflow')}
                  onClick={() => void load()}
                  isDisabled={saving}
               />
               {canEdit && (
                  <Button
                     label={tx('New status')}
                     onClick={() => {
                        setDraft(blank);
                        setSelected(undefined);
                        setEditing(true);
                     }}
                  />
               )}
            </HStack>
            {loading ? (
               <Text role="status">{tx('Loading workflow…')}</Text>
            ) : (
               <List hasDividers>
                  {rows.map((row) => (
                     <ListItem
                        key={row.id}
                        label={row.name}
                        description={
                           tx('{value0} · {value1} · {value2} issues', {
                              value0: enumLabel(row.category),
                              value1: row.teamId ? 'Team' : 'Workspace',
                              value2: row.issueCount,
                           }) + (row.requiredBeforeStart ? ` · ${tx('Required before start')}` : '')
                        }
                        endContent={
                           canEdit ? (
                              <Button
                                 label={tx('Edit {value0}', { value0: row.name })}
                                 onClick={() => {
                                    setSelected(row);
                                    setDraft(row);
                                    setEditing(true);
                                 }}
                              />
                           ) : undefined
                        }
                     />
                  ))}
               </List>
            )}
            {editing && (
               <VStack
                  as="form"
                  gap={4}
                  onSubmit={(event) => {
                     event.preventDefault();
                     void save();
                  }}
               >
                  <Heading level={2}>{selected ? tx('Edit status') : tx('New status')}</Heading>
                  <TextInput
                     label={tx('Status name')}
                     value={draft.name}
                     onChange={(name) => setDraft({ ...draft, name })}
                     isRequired
                  />
                  <Selector
                     label={tx('Workflow category')}
                     value={draft.category}
                     options={categories.map((value) => ({ value, label: enumLabel(value) }))}
                     onChange={(category) =>
                        setDraft({
                           ...draft,
                           category,
                           requiredBeforeStart:
                              draft.requiredBeforeStart &&
                              ['TRIAGE', 'BACKLOG', 'UNSTARTED'].includes(category),
                        })
                     }
                  />
                  <TextInput
                     label={tx('Status color')}
                     value={draft.color}
                     onChange={(color) => setDraft({ ...draft, color })}
                     description={tx('Hex color, for example #99a2b2')}
                  />
                  {['TRIAGE', 'BACKLOG', 'UNSTARTED'].includes(draft.category) && (
                     <CheckboxInput
                        label={tx('Required before start')}
                        description={tx(
                           'Issues must be in this status with a target end date before moving to a Started status.'
                        )}
                        value={draft.requiredBeforeStart}
                        onChange={(requiredBeforeStart) =>
                           setDraft({ ...draft, requiredBeforeStart })
                        }
                     />
                  )}
                  <HStack gap={3} wrap="wrap">
                     <Button
                        label={tx('Save status')}
                        type="submit"
                        variant="primary"
                        isLoading={saving}
                        isDisabled={!draft.name.trim() || !/^#[0-9a-fA-F]{6}$/.test(draft.color)}
                     />
                     <Button
                        label={tx('Cancel editing')}
                        onClick={() => setEditing(false)}
                        isDisabled={saving}
                     />
                     {selected && (
                        <Button
                           label={tx('Delete status')}
                           variant="destructive"
                           onClick={() => void save(true)}
                           isDisabled={saving || selected.issueCount > 0}
                        />
                     )}
                  </HStack>
               </VStack>
            )}
         </VStack>
      </DesignSurface>
   );
}
