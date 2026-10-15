'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
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
};
const categories = ['TRIAGE', 'BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED'];
const blank = { name: '', category: 'UNSTARTED', color: '#99a2b2', position: 0 };
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function WorkflowSettings() {
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
      setLoading(true);
      setError('');
      try {
         const membership = await loadCurrentWorkspaceMembership();
         const data = await responseData<WorkflowStatus[]>(
            await authenticatedFetch(`${api}/issue-statuses?workspaceId=${membership.workspace.id}`)
         );
         setWorkspace(membership.workspace.id);
         setCanEdit(membership.role !== 'MEMBER');
         setRows(data);
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : 'Could not load workflow.');
      } finally {
         setLoading(false);
      }
   }, []);
   useEffect(() => {
      void load();
   }, [load]);
   const save = async (remove = false) => {
      if (saving || !canEdit || !workspace) return;
      if (remove && !window.confirm('Delete this unused status?')) return;
      setSaving(true);
      setError('');
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
         setEditing(false);
         setSelected(undefined);
         await load();
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : 'Could not save workflow.');
      } finally {
         setSaving(false);
      }
   };
   return (
      <DesignSurface>
         <VStack padding={6} gap={5} className="h-full overflow-auto" width="100%">
            <Heading level={1}>Issue statuses</Heading>
            <Text>Workspace workflow. Team statuses are labeled separately.</Text>
            {error && <Text role="alert">{error}</Text>}
            <HStack gap={3}>
               <Button label="Reload workflow" onClick={() => void load()} isDisabled={saving} />
               {canEdit && (
                  <Button
                     label="New status"
                     onClick={() => {
                        setDraft(blank);
                        setSelected(undefined);
                        setEditing(true);
                     }}
                  />
               )}
            </HStack>
            {loading ? (
               <Text role="status">Loading workflow…</Text>
            ) : (
               <List hasDividers>
                  {rows.map((row) => (
                     <ListItem
                        key={row.id}
                        label={row.name}
                        description={`${row.category} · ${row.teamId ? 'Team' : 'Workspace'} · ${row.issueCount} issues`}
                        endContent={
                           canEdit ? (
                              <Button
                                 label={`Edit ${row.name}`}
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
                  <Heading level={2}>{selected ? 'Edit status' : 'New status'}</Heading>
                  <TextInput
                     label="Status name"
                     value={draft.name}
                     onChange={(name) => setDraft({ ...draft, name })}
                     isRequired
                  />
                  <Selector
                     label="Workflow category"
                     value={draft.category}
                     options={categories.map((value) => ({ value, label: value }))}
                     onChange={(category) => setDraft({ ...draft, category })}
                  />
                  <TextInput
                     label="Status color"
                     value={draft.color}
                     onChange={(color) => setDraft({ ...draft, color })}
                     description="Hex color, for example #99a2b2"
                  />
                  <HStack gap={3} wrap="wrap">
                     <Button
                        label="Save status"
                        type="submit"
                        variant="primary"
                        isLoading={saving}
                        isDisabled={!draft.name.trim() || !/^#[0-9a-fA-F]{6}$/.test(draft.color)}
                     />
                     <Button
                        label="Cancel editing"
                        onClick={() => setEditing(false)}
                        isDisabled={saving}
                     />
                     {selected && (
                        <Button
                           label="Delete status"
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
