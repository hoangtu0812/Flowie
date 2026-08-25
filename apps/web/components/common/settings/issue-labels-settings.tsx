'use client';

import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { SelectMenu } from './shared';

type LabelGroup = {
   id: string;
   name: string;
   description: string | null;
   _count: { labels: number };
};

type IssueLabel = {
   id: string;
   name: string;
   color: string;
   description: string | null;
   createdAt: string;
   lastApplied: string | null;
   groupId: string | null;
   group: { id: string; name: string } | null;
   _count: { issueLinks: number };
};

type LabelDraft = { name: string; color: string; description: string; groupId: string };
type GroupDraft = { name: string; description: string };

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const EMPTY_LABEL: LabelDraft = { name: '', color: '#5e6ad2', description: '', groupId: '' };
const EMPTY_GROUP: GroupDraft = { name: '', description: '' };

const formatCount = (count: number) =>
   count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);

const formatDate = (value: string | null) =>
   value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '';

async function errorMessage(response: Response, fallback: string) {
   const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
   } | null;
   return Array.isArray(payload?.message) ? payload.message[0] : (payload?.message ?? fallback);
}

/** Workspace "Issue labels" settings, backed by the persisted Python Labels API. */
export default function IssueLabelsSettings() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [labels, setLabels] = useState<IssueLabel[]>([]);
   const [groups, setGroups] = useState<LabelGroup[]>([]);
   const [query, setQuery] = useState('');
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [labelOpen, setLabelOpen] = useState(false);
   const [groupOpen, setGroupOpen] = useState(false);
   const [editingLabel, setEditingLabel] = useState<IssueLabel>();
   const [editingGroup, setEditingGroup] = useState<LabelGroup>();
   const [labelDraft, setLabelDraft] = useState<LabelDraft>(EMPTY_LABEL);
   const [groupDraft, setGroupDraft] = useState<GroupDraft>(EMPTY_GROUP);
   const [saving, setSaving] = useState(false);
   const [message, setMessage] = useState<string>();

   const load = useCallback(async () => {
      const id = (await loadCurrentWorkspace()).id;
      const [labelsResponse, groupsResponse] = await Promise.all([
         authenticatedFetch(`${api}/labels?workspaceId=${id}`),
         authenticatedFetch(`${api}/labels/groups?workspaceId=${id}`),
      ]);
      if (!labelsResponse.ok || !groupsResponse.ok) {
         throw new Error('Could not load issue labels.');
      }
      setWorkspaceId(id);
      setLabels(((await labelsResponse.json()) as { data: IssueLabel[] }).data);
      setGroups(((await groupsResponse.json()) as { data: LabelGroup[] }).data);
   }, []);

   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);

   const rows = useMemo(() => {
      const term = query.trim().toLowerCase();
      return labels
         .filter((label) => !term || label.name.toLowerCase().includes(term))
         .sort((a, b) => a.name.localeCompare(b.name));
   }, [labels, query]);

   const showCreateLabel = () => {
      setEditingLabel(undefined);
      setLabelDraft(EMPTY_LABEL);
      setMessage(undefined);
      setLabelOpen(true);
   };

   const showEditLabel = (label: IssueLabel) => {
      setEditingLabel(label);
      setLabelDraft({
         name: label.name,
         color: label.color,
         description: label.description ?? '',
         groupId: label.groupId ?? '',
      });
      setMessage(undefined);
      setLabelOpen(true);
   };

   const showCreateGroup = () => {
      setEditingGroup(undefined);
      setGroupDraft(EMPTY_GROUP);
      setMessage(undefined);
      setGroupOpen(true);
   };

   const showEditGroup = (group: LabelGroup) => {
      setEditingGroup(group);
      setGroupDraft({ name: group.name, description: group.description ?? '' });
      setMessage(undefined);
      setGroupOpen(true);
   };

   const saveLabel = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !labelDraft.name.trim()) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await authenticatedFetch(
            editingLabel
               ? `${api}/labels/${editingLabel.id}?workspaceId=${workspaceId}`
               : `${api}/labels`,
            {
               method: editingLabel ? 'PATCH' : 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(editingLabel ? {} : { workspaceId }),
                  name: labelDraft.name.trim(),
                  color: labelDraft.color,
                  description: labelDraft.description.trim() || null,
                  groupId: labelDraft.groupId || null,
               }),
            }
         );
         if (!response.ok) throw new Error(await errorMessage(response, 'Could not save label.'));
         await load();
         setLabelOpen(false);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not save label.');
      } finally {
         setSaving(false);
      }
   };

   const saveGroup = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !groupDraft.name.trim()) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await authenticatedFetch(
            editingGroup
               ? `${api}/labels/groups/${editingGroup.id}?workspaceId=${workspaceId}`
               : `${api}/labels/groups`,
            {
               method: editingGroup ? 'PATCH' : 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(editingGroup ? {} : { workspaceId }),
                  name: groupDraft.name.trim(),
                  description: groupDraft.description.trim() || null,
               }),
            }
         );
         if (!response.ok)
            throw new Error(await errorMessage(response, 'Could not save label group.'));
         await load();
         setGroupOpen(false);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not save label group.');
      } finally {
         setSaving(false);
      }
   };

   const deleteLabel = async () => {
      if (!workspaceId || !editingLabel) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await authenticatedFetch(
            `${api}/labels/${editingLabel.id}?workspaceId=${workspaceId}`,
            { method: 'DELETE' }
         );
         if (!response.ok) throw new Error(await errorMessage(response, 'Could not delete label.'));
         await load();
         setLabelOpen(false);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not delete label.');
      } finally {
         setSaving(false);
      }
   };

   const deleteGroup = async () => {
      if (!workspaceId || !editingGroup) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await authenticatedFetch(
            `${api}/labels/groups/${editingGroup.id}?workspaceId=${workspaceId}`,
            { method: 'DELETE' }
         );
         if (!response.ok)
            throw new Error(await errorMessage(response, 'Could not delete label group.'));
         await load();
         setGroupOpen(false);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not delete label group.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-5xl mx-auto px-6 py-10 pb-20">
            <h1 className="text-2xl font-medium mb-6">Issue labels</h1>

            <div className="flex items-center justify-between gap-3 mb-6">
               <div className="flex items-center gap-2">
                  <Input
                     placeholder="Filter by name..."
                     value={query}
                     onChange={(event) => setQuery(event.target.value)}
                     className="w-64 h-8"
                  />
                  <SelectMenu options={['Workspace', 'All teams']} />
               </div>
               <div className="flex items-center gap-2">
                  <Button size="xs" variant="secondary" onClick={showCreateGroup}>
                     New group
                  </Button>
                  <Button size="xs" onClick={showCreateLabel} disabled={state !== 'ready'}>
                     New label
                  </Button>
               </div>
            </div>

            <div className="flex items-center px-2 py-1.5 text-xs text-muted-foreground border-b">
               <div className="flex-1 min-w-0">Name ↓</div>
               <div className="hidden md:block w-[260px]">Description</div>
               <div className="w-[70px]">Issues</div>
               <div className="hidden sm:block w-[110px]">Last applied</div>
               <div className="w-[80px]">Created</div>
            </div>

            {state === 'loading' && (
               <p className="text-sm text-muted-foreground py-6">Loading labels...</p>
            )}
            {state === 'error' && (
               <p className="text-sm text-destructive py-6">Could not load issue labels.</p>
            )}
            {state === 'ready' &&
               rows.map((label) => (
                  <button
                     type="button"
                     key={label.id}
                     onClick={() => showEditLabel(label)}
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
                        {label.description}
                     </div>
                     <div className="w-[70px] text-xs text-muted-foreground">
                        {label._count.issueLinks > 0 && formatCount(label._count.issueLinks)}
                     </div>
                     <div className="hidden sm:block w-[110px] text-xs text-muted-foreground">
                        {formatDate(label.lastApplied)}
                     </div>
                     <div className="w-[80px] text-xs text-muted-foreground">
                        {formatDate(label.createdAt)}
                     </div>
                  </button>
               ))}
            {state === 'ready' && rows.length === 0 && (
               <p className="text-sm text-muted-foreground py-6">
                  {labels.length === 0
                     ? 'No labels yet. Create your first label.'
                     : 'No labels match your filter.'}
               </p>
            )}

            {groups.length > 0 && (
               <div className="mt-10">
                  <h2 className="text-sm font-medium mb-2">Label groups</h2>
                  {groups.map((group) => (
                     <button
                        type="button"
                        key={group.id}
                        onClick={() => showEditGroup(group)}
                        className="w-full flex items-center justify-between px-2 py-2.5 text-sm border-b border-muted-foreground/5 hover:bg-sidebar/50 text-left"
                     >
                        <span>{group.name}</span>
                        <span className="text-xs text-muted-foreground">
                           {group._count.labels} labels
                        </span>
                     </button>
                  ))}
               </div>
            )}
         </div>

         <Dialog open={labelOpen} onOpenChange={setLabelOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>{editingLabel ? 'Edit label' : 'New label'}</DialogTitle>
                  <DialogDescription>
                     Create a reusable label for issues in this workspace.
                  </DialogDescription>
               </DialogHeader>
               <form onSubmit={saveLabel} className="grid gap-4">
                  <div className="grid gap-2">
                     <Label htmlFor="label-name">Name</Label>
                     <Input
                        id="label-name"
                        value={labelDraft.name}
                        autoFocus
                        onChange={(event) =>
                           setLabelDraft((draft) => ({ ...draft, name: event.target.value }))
                        }
                     />
                  </div>
                  <div className="grid gap-2">
                     <Label htmlFor="label-color">Color</Label>
                     <div className="flex gap-2">
                        <Input
                           id="label-color-picker"
                           aria-label="Label color picker"
                           type="color"
                           value={labelDraft.color}
                           onChange={(event) =>
                              setLabelDraft((draft) => ({ ...draft, color: event.target.value }))
                           }
                           className="w-10 p-1"
                        />
                        <Input
                           id="label-color"
                           value={labelDraft.color}
                           onChange={(event) =>
                              setLabelDraft((draft) => ({ ...draft, color: event.target.value }))
                           }
                           pattern="^#[0-9a-fA-F]{6}$"
                        />
                     </div>
                  </div>
                  <div className="grid gap-2">
                     <Label htmlFor="label-group">Group</Label>
                     <Select
                        value={labelDraft.groupId || 'none'}
                        onValueChange={(value) =>
                           setLabelDraft((draft) => ({
                              ...draft,
                              groupId: value === 'none' ? '' : value,
                           }))
                        }
                     >
                        <SelectTrigger id="label-group">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="none">No group</SelectItem>
                           {groups.map((group) => (
                              <SelectItem key={group.id} value={group.id}>
                                 {group.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="grid gap-2">
                     <Label htmlFor="label-description">Description</Label>
                     <Textarea
                        id="label-description"
                        value={labelDraft.description}
                        onChange={(event) =>
                           setLabelDraft((draft) => ({ ...draft, description: event.target.value }))
                        }
                     />
                  </div>
                  {message && <p className="text-sm text-destructive">{message}</p>}
                  <DialogFooter>
                     {editingLabel && (
                        <Button
                           type="button"
                           variant="ghost"
                           className="mr-auto text-destructive"
                           disabled={saving}
                           onClick={() => void deleteLabel()}
                        >
                           Delete
                        </Button>
                     )}
                     <Button type="button" variant="secondary" onClick={() => setLabelOpen(false)}>
                        Cancel
                     </Button>
                     <Button type="submit" disabled={saving || !labelDraft.name.trim()}>
                        {saving ? 'Saving...' : editingLabel ? 'Save changes' : 'Create label'}
                     </Button>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>

         <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>{editingGroup ? 'Edit label group' : 'New label group'}</DialogTitle>
                  <DialogDescription>
                     Organize labels without changing their use on issues.
                  </DialogDescription>
               </DialogHeader>
               <form onSubmit={saveGroup} className="grid gap-4">
                  <div className="grid gap-2">
                     <Label htmlFor="group-name">Name</Label>
                     <Input
                        id="group-name"
                        value={groupDraft.name}
                        autoFocus
                        onChange={(event) =>
                           setGroupDraft((draft) => ({ ...draft, name: event.target.value }))
                        }
                     />
                  </div>
                  <div className="grid gap-2">
                     <Label htmlFor="group-description">Description</Label>
                     <Textarea
                        id="group-description"
                        value={groupDraft.description}
                        onChange={(event) =>
                           setGroupDraft((draft) => ({ ...draft, description: event.target.value }))
                        }
                     />
                  </div>
                  {message && <p className="text-sm text-destructive">{message}</p>}
                  <DialogFooter>
                     {editingGroup && (
                        <Button
                           type="button"
                           variant="ghost"
                           className="mr-auto text-destructive"
                           disabled={saving}
                           onClick={() => void deleteGroup()}
                        >
                           Delete
                        </Button>
                     )}
                     <Button type="button" variant="secondary" onClick={() => setGroupOpen(false)}>
                        Cancel
                     </Button>
                     <Button type="submit" disabled={saving || !groupDraft.name.trim()}>
                        {saving ? 'Saving...' : editingGroup ? 'Save changes' : 'Create group'}
                     </Button>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>
      </div>
   );
}
