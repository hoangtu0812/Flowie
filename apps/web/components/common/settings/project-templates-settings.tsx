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
import { Textarea } from '@/components/ui/textarea';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { FileStack } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { DashedSmiley } from './settings-placeholder';
import { loadCurrentWorkspace } from '@/lib/workspaces';

type Template = {
   id: string;
   name: string;
   description: string | null;
   type: string;
   updatedAt: string;
};

type TemplateDraft = { name: string; description: string; type: string };
const EMPTY_DRAFT: TemplateDraft = { name: '', description: '', type: 'GENERAL' };
const PROJECT_TYPES = ['GENERAL', 'PRODUCT', 'MARKETING', 'OPERATIONS', 'EVENT', 'CLIENT'];
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const formatDate = (value: string) =>
   new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

/** Original settings page layout, backed by persisted workspace project templates. */
export default function ProjectTemplatesSettings() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [templates, setTemplates] = useState<Template[]>([]);
   const [query, setQuery] = useState('');
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [open, setOpen] = useState(false);
   const [selected, setSelected] = useState<Template>();
   const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
   const [saving, setSaving] = useState(false);
   const [message, setMessage] = useState<string>();
   const [deleteOpen, setDeleteOpen] = useState(false);

   const load = useCallback(async () => {
      const id = (await loadCurrentWorkspace()).id;
      setWorkspaceId(id);

      const response = await fetch(`${api}/projects/templates?workspaceId=${id}`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load project templates.');
      setTemplates(((await response.json()) as { data: Template[] }).data);
   }, []);

   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);

   const filtered = useMemo(() => {
      const term = query.trim().toLowerCase();
      return templates.filter(
         (template) =>
            !term ||
            template.name.toLowerCase().includes(term) ||
            template.description?.toLowerCase().includes(term)
      );
   }, [query, templates]);

   const showCreate = () => {
      setSelected(undefined);
      setDraft(EMPTY_DRAFT);
      setMessage(undefined);
      setOpen(true);
   };

   const showEdit = (template: Template) => {
      setSelected(template);
      setDraft({
         name: template.name,
         description: template.description ?? '',
         type: template.type,
      });
      setMessage(undefined);
      setOpen(true);
   };

   const save = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || draft.name.trim().length < 2) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await fetch(
            selected
               ? `${api}/projects/templates/${selected.id}?workspaceId=${workspaceId}`
               : `${api}/projects/templates`,
            {
               method: selected ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(selected ? {} : { workspaceId }),
                  name: draft.name.trim(),
                  description: draft.description.trim() || undefined,
                  type: draft.type,
                  config: {},
               }),
            }
         );
         if (!response.ok) {
            throw new Error(
               'Could not save project template. Workspace administrator access may be required.'
            );
         }
         await load();
         setOpen(false);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not save project template.');
      } finally {
         setSaving(false);
      }
   };
   const remove = async () => {
      if (!workspaceId || !selected) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await fetch(
            `${api}/projects/templates/${selected.id}?workspaceId=${workspaceId}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not delete project template.');
         await load();
         setOpen(false);
         setDeleteOpen(false);
      } catch (caught) {
         setMessage(
            caught instanceof Error ? caught.message : 'Could not delete project template.'
         );
      } finally {
         setSaving(false);
      }
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-2xl font-medium">Project templates</h1>

            <div className="flex items-center justify-between gap-3 mt-6">
               <Input
                  placeholder="Filter by name..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-72 h-8"
               />
               <Button size="xs" onClick={showCreate} disabled={state !== 'ready'}>
                  New template
               </Button>
            </div>

            {state === 'loading' && (
               <p className="py-12 text-sm text-muted-foreground">Loading project templates…</p>
            )}
            {state === 'error' && (
               <p className="py-12 text-sm text-destructive">Could not load project templates.</p>
            )}
            {state === 'ready' && filtered.length === 0 && (
               <div className="flex flex-col items-center justify-center gap-5 py-32">
                  <DashedSmiley />
                  <p className="text-sm text-muted-foreground">
                     {templates.length
                        ? 'No project templates match your filter.'
                        : 'No project templates'}
                  </p>
               </div>
            )}
            {state === 'ready' && filtered.length > 0 && (
               <div className="mt-5 overflow-hidden rounded-lg border bg-container">
                  {filtered.map((template) => (
                     <button
                        key={template.id}
                        type="button"
                        onClick={() => showEdit(template)}
                        className="w-full flex items-center gap-3 px-4 py-3 border-b last:border-b-0 text-left hover:bg-sidebar/50"
                     >
                        <span className="inline-flex size-8 items-center justify-center rounded-md bg-muted/50 shrink-0">
                           <FileStack className="size-4 text-muted-foreground" />
                        </span>
                        <div className="min-w-0 flex-1">
                           <div className="text-sm font-medium truncate">{template.name}</div>
                           <div className="text-xs text-muted-foreground truncate">
                              {template.description || 'No description'} ·{' '}
                              {template.type.toLowerCase()}
                           </div>
                        </div>
                        <div className="hidden sm:block text-xs text-muted-foreground">
                           Updated {formatDate(template.updatedAt)}
                        </div>
                     </button>
                  ))}
               </div>
            )}
         </div>

         <Dialog open={open} onOpenChange={(visible) => !visible && setOpen(false)}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>
                     {selected ? 'Edit project template' : 'New project template'}
                  </DialogTitle>
               </DialogHeader>
               <form className="space-y-4" onSubmit={save}>
                  <div className="space-y-2">
                     <Label htmlFor="project-template-name">Name</Label>
                     <Input
                        id="project-template-name"
                        value={draft.name}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        minLength={2}
                        maxLength={120}
                        autoFocus
                        required
                     />
                  </div>
                  <div className="space-y-2">
                     <Label>Default project type</Label>
                     <Select
                        value={draft.type}
                        onValueChange={(type) => setDraft((current) => ({ ...current, type }))}
                     >
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {PROJECT_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                 {type.toLowerCase()}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="project-template-description">Description</Label>
                     <Textarea
                        id="project-template-description"
                        value={draft.description}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, description: event.target.value }))
                        }
                        maxLength={2000}
                        rows={3}
                     />
                  </div>
                  {message && <p className="text-sm text-destructive">{message}</p>}
                  <div className="flex items-center justify-between gap-2">
                     {selected ? (
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
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                           Cancel
                        </Button>
                        <Button type="submit" disabled={saving || draft.name.trim().length < 2}>
                           {saving ? 'Saving…' : selected ? 'Save changes' : 'Create template'}
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
                     This project template will be permanently removed.
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
      </div>
   );
}
