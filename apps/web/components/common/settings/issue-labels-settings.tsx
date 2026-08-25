'use client';

import { Button } from '@/components/ui/button';
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadCurrentWorkspace } from '@/lib/workspaces';

type ApiLabel = {
   id: string;
   name: string;
   color: string;
   description: string | null;
   createdAt: string;
   updatedAt: string;
   groupId: string | null;
   group: ApiLabelGroup | null;
   _count: { issueLinks?: number; projectLinks?: number };
};

type ApiLabelGroup = {
   id: string;
   name: string;
   description: string | null;
   createdAt: string;
   updatedAt: string;
   _count: { labels: number };
};

type LabelDraft = { name: string; color: string; description: string; groupId: string };
type GroupDraft = { name: string; description: string };
const NO_GROUP = '__none__';
const EMPTY_DRAFT: LabelDraft = {
   name: '',
   color: '#6366f1',
   description: '',
   groupId: NO_GROUP,
};
const EMPTY_GROUP_DRAFT: GroupDraft = { name: '', description: '' };
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const formatDate = (value: string) =>
   new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

const formatCount = (count: number) =>
   count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);

type LabelScope = 'issue' | 'project';

/** Shared original settings layout backed by the matching persisted label resource. */
export function LabelsSettings({ scope }: { scope: LabelScope }) {
   const isProject = scope === 'project';
   const title = isProject ? 'Project labels' : 'Issue labels';
   const resource = isProject ? 'project labels' : 'labels';
   const endpoint = isProject ? '/projects/labels' : '/labels';
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [labels, setLabels] = useState<ApiLabel[]>([]);
   const [groups, setGroups] = useState<ApiLabelGroup[]>([]);
   const [query, setQuery] = useState('');
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [dialog, setDialog] = useState<'create' | 'edit'>();
   const [selected, setSelected] = useState<ApiLabel>();
   const [draft, setDraft] = useState<LabelDraft>(EMPTY_DRAFT);
   const [saving, setSaving] = useState(false);
   const [message, setMessage] = useState<string>();
   const [deleteOpen, setDeleteOpen] = useState(false);
   const [groupDialogOpen, setGroupDialogOpen] = useState(false);
   const [selectedGroup, setSelectedGroup] = useState<ApiLabelGroup>();
   const [groupDraft, setGroupDraft] = useState<GroupDraft>(EMPTY_GROUP_DRAFT);
   const [groupSaving, setGroupSaving] = useState(false);
   const [groupMessage, setGroupMessage] = useState<string>();
   const [groupDeleteOpen, setGroupDeleteOpen] = useState(false);

   const load = useCallback(async () => {
      const id = (await loadCurrentWorkspace()).id;
      setWorkspaceId(id);
      const [labelsResponse, groupsResponse] = await Promise.all([
         fetch(`${api}${endpoint}?workspaceId=${id}`, { credentials: 'include' }),
         isProject
            ? Promise.resolve(undefined)
            : fetch(`${api}/labels/groups?workspaceId=${id}`, { credentials: 'include' }),
      ]);
      if (!labelsResponse.ok || (groupsResponse && !groupsResponse.ok))
         throw new Error(`Could not load ${resource}.`);
      setLabels(((await labelsResponse.json()) as { data: ApiLabel[] }).data);
      setGroups(
         groupsResponse ? ((await groupsResponse.json()) as { data: ApiLabelGroup[] }).data : []
      );
   }, [endpoint, isProject, resource]);

   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);

   const rows = useMemo(
      () =>
         labels
            .filter((label) => label.name.toLowerCase().includes(query.trim().toLowerCase()))
            .sort((left, right) => left.name.localeCompare(right.name)),
      [labels, query]
   );

   const openCreate = () => {
      setSelected(undefined);
      setDraft(EMPTY_DRAFT);
      setMessage(undefined);
      setDialog('create');
   };
   const openEdit = (label: ApiLabel) => {
      setSelected(label);
      setDraft({
         name: label.name,
         color: label.color,
         description: label.description ?? '',
         groupId: label.groupId ?? NO_GROUP,
      });
      setMessage(undefined);
      setDialog('edit');
   };

   const openGroupDialog = (group?: ApiLabelGroup) => {
      setSelectedGroup(group);
      setGroupDraft(
         group ? { name: group.name, description: group.description ?? '' } : EMPTY_GROUP_DRAFT
      );
      setGroupMessage(undefined);
      setGroupDialogOpen(true);
   };

   const save = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !draft.name.trim()) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const editing = dialog === 'edit' && selected;
         const response = await fetch(
            editing
               ? `${api}${endpoint}/${selected.id}?workspaceId=${workspaceId}`
               : `${api}${endpoint}`,
            {
               method: editing ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(editing ? {} : { workspaceId }),
                  name: draft.name.trim(),
                  color: draft.color,
                  description: draft.description.trim() || (editing ? null : undefined),
                  ...(!isProject
                     ? { groupId: draft.groupId === NO_GROUP ? null : draft.groupId }
                     : {}),
               }),
            }
         );
         if (!response.ok)
            throw new Error(
               'Could not save label. Workspace administrator access may be required.'
            );
         await load();
         setDialog(undefined);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not save label.');
      } finally {
         setSaving(false);
      }
   };

   const saveGroup = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !groupDraft.name.trim()) return;
      setGroupSaving(true);
      setGroupMessage(undefined);
      try {
         const response = await fetch(
            selectedGroup
               ? `${api}/labels/groups/${selectedGroup.id}?workspaceId=${workspaceId}`
               : `${api}/labels/groups`,
            {
               method: selectedGroup ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(selectedGroup ? {} : { workspaceId }),
                  name: groupDraft.name.trim(),
                  description: groupDraft.description.trim() || (selectedGroup ? null : undefined),
               }),
            }
         );
         if (!response.ok)
            throw new Error(
               'Could not save label group. Workspace administrator access may be required.'
            );
         await load();
         setSelectedGroup(undefined);
         setGroupDraft(EMPTY_GROUP_DRAFT);
      } catch (caught) {
         setGroupMessage(caught instanceof Error ? caught.message : 'Could not save label group.');
      } finally {
         setGroupSaving(false);
      }
   };

   const removeGroup = async () => {
      if (!workspaceId || !selectedGroup) return;
      setGroupSaving(true);
      setGroupMessage(undefined);
      try {
         const response = await fetch(
            `${api}/labels/groups/${selectedGroup.id}?workspaceId=${workspaceId}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok)
            throw new Error(
               'Could not delete label group. Workspace administrator access may be required.'
            );
         await load();
         setSelectedGroup(undefined);
         setGroupDraft(EMPTY_GROUP_DRAFT);
         setGroupDeleteOpen(false);
      } catch (caught) {
         setGroupMessage(
            caught instanceof Error ? caught.message : 'Could not delete label group.'
         );
      } finally {
         setGroupSaving(false);
      }
   };

   const remove = async () => {
      if (!workspaceId || !selected) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await fetch(
            `${api}${endpoint}/${selected.id}?workspaceId=${workspaceId}`,
            {
               method: 'DELETE',
               credentials: 'include',
            }
         );
         if (!response.ok)
            throw new Error(
               'Could not delete label. Workspace administrator access may be required.'
            );
         await load();
         setDialog(undefined);
         setDeleteOpen(false);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not delete label.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-5xl mx-auto px-6 py-10 pb-20">
            <h1 className="text-2xl font-medium mb-6">{title}</h1>
            <div className="flex items-center justify-between gap-3 mb-6">
               <Input
                  placeholder="Filter by name..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-64 h-8"
               />
               <div className="flex items-center gap-2">
                  <Button
                     size="xs"
                     variant="secondary"
                     disabled={isProject}
                     title={isProject ? 'Project label groups are not enabled yet' : undefined}
                     onClick={() => !isProject && openGroupDialog()}
                  >
                     New group
                  </Button>
                  <Button size="xs" onClick={openCreate}>
                     New label
                  </Button>
               </div>
            </div>

            <div className="flex items-center px-2 py-1.5 text-xs text-muted-foreground border-b">
               <div className="flex-1 min-w-0">Name ↓</div>
               <div className="hidden md:block w-[260px]">Description</div>
               <div className="w-[70px]">{isProject ? 'Projects' : 'Issues'}</div>
               <div className="hidden sm:block w-[110px]">Last updated</div>
               <div className="w-[100px]">Created</div>
            </div>

            {state === 'loading' && (
               <p className="text-sm text-muted-foreground py-6">Loading labels…</p>
            )}
            {state === 'error' && (
               <p className="text-sm text-destructive py-6">Could not load labels.</p>
            )}
            {state === 'ready' &&
               rows.map((label) => (
                  <button
                     key={label.id}
                     type="button"
                     onClick={() => openEdit(label)}
                     className="w-full flex items-center px-2 py-2.5 text-sm border-b border-muted-foreground/5 hover:bg-sidebar/50 text-left"
                  >
                     <div className="flex-1 min-w-0 flex items-center gap-2.5">
                        <span
                           className="size-2.5 rounded-full shrink-0"
                           style={{ backgroundColor: label.color }}
                        />
                        <span className="truncate">{label.name}</span>
                     </div>
                     <div className="hidden md:block w-[260px] text-xs text-muted-foreground truncate pr-4">
                        {label.description || '—'}
                     </div>
                     <div className="w-[70px] text-xs text-muted-foreground">
                        {(() => {
                           const count = isProject
                              ? (label._count.projectLinks ?? 0)
                              : (label._count.issueLinks ?? 0);
                           return count ? formatCount(count) : '';
                        })()}
                     </div>
                     <div className="hidden sm:block w-[110px] text-xs text-muted-foreground">
                        {formatDate(label.updatedAt)}
                     </div>
                     <div className="w-[100px] text-xs text-muted-foreground">
                        {formatDate(label.createdAt)}
                     </div>
                  </button>
               ))}
            {state === 'ready' && rows.length === 0 && (
               <p className="text-sm text-muted-foreground py-6">
                  No {resource} match your filter.
               </p>
            )}
         </div>

         <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(undefined)}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>{dialog === 'edit' ? 'Edit label' : 'New label'}</DialogTitle>
               </DialogHeader>
               <form className="space-y-4" onSubmit={save}>
                  <div className="space-y-2">
                     <Label htmlFor="label-name">Name</Label>
                     <Input
                        id="label-name"
                        value={draft.name}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        maxLength={80}
                        autoFocus
                        required
                     />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="label-description">Description</Label>
                     <Textarea
                        id="label-description"
                        value={draft.description}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, description: event.target.value }))
                        }
                        maxLength={500}
                        rows={3}
                     />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="label-color">Color</Label>
                     <Input
                        id="label-color"
                        type="color"
                        value={draft.color}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, color: event.target.value }))
                        }
                        className="h-9 w-14 p-1"
                     />
                  </div>
                  {!isProject && (
                     <div className="space-y-2">
                        <Label htmlFor="label-group">Group</Label>
                        <Select
                           value={draft.groupId}
                           onValueChange={(value) =>
                              setDraft((current) => ({ ...current, groupId: value }))
                           }
                        >
                           <SelectTrigger id="label-group">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value={NO_GROUP}>No group</SelectItem>
                              {groups.map((group) => (
                                 <SelectItem key={group.id} value={group.id}>
                                    {group.name}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                  )}
                  {message && <p className="text-sm text-destructive">{message}</p>}
                  <div className="flex items-center justify-between gap-2">
                     {dialog === 'edit' ? (
                        <Button
                           type="button"
                           variant="ghost"
                           className="text-destructive"
                           disabled={saving}
                           onClick={() => setDeleteOpen(true)}
                        >
                           Delete
                        </Button>
                     ) : (
                        <span />
                     )}
                     <div className="flex gap-2">
                        <Button
                           type="button"
                           variant="outline"
                           onClick={() => setDialog(undefined)}
                        >
                           Cancel
                        </Button>
                        <Button type="submit" disabled={saving || !draft.name.trim()}>
                           {saving
                              ? 'Saving…'
                              : dialog === 'edit'
                                ? 'Save changes'
                                : 'Create label'}
                        </Button>
                     </div>
                  </div>
               </form>
            </DialogContent>
         </Dialog>
         <AlertDialog
            open={deleteOpen}
            onOpenChange={(visible) => !saving && setDeleteOpen(visible)}
         >
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{selected?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     It will be removed from every linked {isProject ? 'project' : 'issue'}.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               {message && <p className="text-sm text-destructive">{message}</p>}
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     disabled={saving}
                     className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                     onClick={(event) => {
                        event.preventDefault();
                        void remove();
                     }}
                  >
                     {saving ? 'Deleting…' : 'Delete'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
         <Dialog
            open={groupDialogOpen}
            onOpenChange={(open) => !groupSaving && setGroupDialogOpen(open)}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>
                     {selectedGroup ? 'Edit label group' : 'New label group'}
                  </DialogTitle>
               </DialogHeader>
               <form className="space-y-4" onSubmit={saveGroup}>
                  <div className="space-y-2">
                     <Label htmlFor="label-group-name">Name</Label>
                     <Input
                        id="label-group-name"
                        value={groupDraft.name}
                        onChange={(event) =>
                           setGroupDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        maxLength={80}
                        autoFocus
                        required
                     />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="label-group-description">Description</Label>
                     <Textarea
                        id="label-group-description"
                        value={groupDraft.description}
                        onChange={(event) =>
                           setGroupDraft((current) => ({
                              ...current,
                              description: event.target.value,
                           }))
                        }
                        maxLength={500}
                        rows={3}
                     />
                  </div>
                  {groupMessage && <p className="text-sm text-destructive">{groupMessage}</p>}
                  <div className="flex items-center justify-between gap-2">
                     {selectedGroup ? (
                        <Button
                           type="button"
                           variant="ghost"
                           className="text-destructive"
                           disabled={groupSaving}
                           onClick={() => setGroupDeleteOpen(true)}
                        >
                           Delete
                        </Button>
                     ) : (
                        <span />
                     )}
                     <div className="flex gap-2">
                        {selectedGroup && (
                           <Button
                              type="button"
                              variant="outline"
                              onClick={() => openGroupDialog()}
                           >
                              New group
                           </Button>
                        )}
                        <Button type="submit" disabled={groupSaving || !groupDraft.name.trim()}>
                           {groupSaving
                              ? 'Saving…'
                              : selectedGroup
                                ? 'Save changes'
                                : 'Create group'}
                        </Button>
                     </div>
                  </div>
               </form>
               {groups.length > 0 && (
                  <div className="border-t pt-4 space-y-1">
                     <p className="text-xs font-medium text-muted-foreground mb-2">
                        Existing groups
                     </p>
                     {groups.map((group) => (
                        <button
                           key={group.id}
                           type="button"
                           className="w-full flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted text-left"
                           onClick={() => openGroupDialog(group)}
                        >
                           <span className="truncate">{group.name}</span>
                           <span className="text-xs text-muted-foreground">
                              {group._count.labels} labels
                           </span>
                        </button>
                     ))}
                  </div>
               )}
            </DialogContent>
         </Dialog>
         <AlertDialog
            open={groupDeleteOpen}
            onOpenChange={(visible) => !groupSaving && setGroupDeleteOpen(visible)}
         >
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{selectedGroup?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     Labels in this group will remain in the workspace without a group.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               {groupMessage && <p className="text-sm text-destructive">{groupMessage}</p>}
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={groupSaving}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     disabled={groupSaving}
                     className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                     onClick={(event) => {
                        event.preventDefault();
                        void removeGroup();
                     }}
                  >
                     {groupSaving ? 'Deleting…' : 'Delete'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   );
}

/** Workspace Issue labels, retaining the original table UI with live CRUD data. */
export default function IssueLabelsSettings() {
   return <LabelsSettings scope="issue" />;
}
