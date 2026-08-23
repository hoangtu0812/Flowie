'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ApiLabel = {
   id: string;
   name: string;
   color: string;
   description: string | null;
   createdAt: string;
   updatedAt: string;
   _count: { issueLinks: number };
};

type LabelDraft = { name: string; color: string; description: string };
const EMPTY_DRAFT: LabelDraft = { name: '', color: '#6366f1', description: '' };
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const formatDate = (value: string) =>
   new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

const formatCount = (count: number) =>
   count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);

/** Workspace Issue labels, retaining the original table UI with live CRUD data. */
export default function IssueLabelsSettings() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [labels, setLabels] = useState<ApiLabel[]>([]);
   const [query, setQuery] = useState('');
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [dialog, setDialog] = useState<'create' | 'edit'>();
   const [selected, setSelected] = useState<ApiLabel>();
   const [draft, setDraft] = useState<LabelDraft>(EMPTY_DRAFT);
   const [saving, setSaving] = useState(false);
   const [message, setMessage] = useState<string>();

   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspacePayload = (await workspaceResponse.json()) as {
         data: Array<{ workspace: { id: string } }>;
      };
      const id = workspacePayload.data[0]?.workspace.id;
      if (!id) throw new Error('No workspace is available.');
      setWorkspaceId(id);
      const response = await fetch(`${api}/labels?workspaceId=${id}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Could not load labels.');
      setLabels(((await response.json()) as { data: ApiLabel[] }).data);
   }, []);

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
      setDraft({ name: label.name, color: label.color, description: label.description ?? '' });
      setMessage(undefined);
      setDialog('edit');
   };

   const save = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !draft.name.trim()) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const editing = dialog === 'edit' && selected;
         const response = await fetch(
            editing ? `${api}/labels/${selected.id}?workspaceId=${workspaceId}` : `${api}/labels`,
            {
               method: editing ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(editing ? {} : { workspaceId }),
                  name: draft.name.trim(),
                  color: draft.color,
                  description: draft.description.trim() || undefined,
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

   const remove = async () => {
      if (!workspaceId || !selected) return;
      if (!window.confirm(`Delete “${selected.name}”? It will be removed from linked issues.`))
         return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await fetch(`${api}/labels/${selected.id}?workspaceId=${workspaceId}`, {
            method: 'DELETE',
            credentials: 'include',
         });
         if (!response.ok)
            throw new Error(
               'Could not delete label. Workspace administrator access may be required.'
            );
         await load();
         setDialog(undefined);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not delete label.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-5xl mx-auto px-6 py-10 pb-20">
            <h1 className="text-2xl font-medium mb-6">Issue labels</h1>
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
                     disabled
                     title="Label groups are not enabled yet"
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
               <div className="w-[70px]">Issues</div>
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
                        {label._count.issueLinks ? formatCount(label._count.issueLinks) : ''}
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
               <p className="text-sm text-muted-foreground py-6">No labels match your filter.</p>
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
                  {message && <p className="text-sm text-destructive">{message}</p>}
                  <div className="flex items-center justify-between gap-2">
                     {dialog === 'edit' ? (
                        <Button
                           type="button"
                           variant="ghost"
                           className="text-destructive"
                           disabled={saving}
                           onClick={() => void remove()}
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
      </div>
   );
}
