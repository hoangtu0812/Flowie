'use client';

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
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { FileText, Plus } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
type Template = {
   id: string;
   name: string;
   description?: string | null;
   title: string;
   issueDescription?: string | null;
   createdBy: { name: string };
   updatedAt: string;
};
type Draft = { name: string; title: string; description: string; issueDescription: string };
const emptyDraft: Draft = { name: '', title: '', description: '', issueDescription: '' };

/** Original Circle templates presentation, hydrated from persisted FastAPI records. */
export default function IssueTemplatesSettings() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [templates, setTemplates] = useState<Template[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [selected, setSelected] = useState<Template>();
   const [draft, setDraft] = useState<Draft>(emptyDraft);
   const [open, setOpen] = useState(false);
   const [deleteOpen, setDeleteOpen] = useState(false);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   const load = useCallback(async () => {
      const workspace = await loadCurrentWorkspace();
      setWorkspaceId(workspace.id);
      const response = await authenticatedFetch(
         `${api}/issues/templates?workspaceId=${workspace.id}`
      );
      if (!response.ok) throw new Error('Could not load issue templates.');
      setTemplates(((await response.json()) as { data: Template[] }).data);
   }, []);

   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);

   const showCreate = () => {
      setSelected(undefined);
      setDraft(emptyDraft);
      setError(undefined);
      setOpen(true);
   };
   const showEdit = (template: Template) => {
      setSelected(template);
      setDraft({
         name: template.name,
         title: template.title,
         description: template.description ?? '',
         issueDescription: template.issueDescription ?? '',
      });
      setError(undefined);
      setOpen(true);
   };

   const save = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || draft.name.trim().length < 2 || draft.title.trim().length < 2) return;
      setSaving(true);
      setError(undefined);
      try {
         const response = await authenticatedFetch(
            selected
               ? `${api}/issues/templates/${selected.id}?workspaceId=${workspaceId}`
               : `${api}/issues/templates`,
            {
               method: selected ? 'PATCH' : 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(selected ? {} : { workspaceId }),
                  name: draft.name.trim(),
                  title: draft.title.trim(),
                  description: draft.description.trim() || undefined,
                  issueDescription: draft.issueDescription.trim() || undefined,
               }),
            }
         );
         if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { message?: string } | null;
            throw new Error(body?.message ?? 'Could not save issue template.');
         }
         await load();
         setOpen(false);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not save issue template.');
      } finally {
         setSaving(false);
      }
   };

   const remove = async () => {
      if (!workspaceId || !selected) return;
      setSaving(true);
      setError(undefined);
      try {
         const response = await authenticatedFetch(
            `${api}/issues/templates/${selected.id}?workspaceId=${workspaceId}`,
            { method: 'DELETE' }
         );
         if (!response.ok) throw new Error('Could not delete issue template.');
         await load();
         setDeleteOpen(false);
         setOpen(false);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not delete issue template.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <SettingsShell
         title="Issue templates"
         description="These templates are available when creating issues for any team in the workspace. To create templates that only apply to specific teams, add them as team templates."
      >
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title={`${templates.length} issue templates`}
                  trailing={
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={showCreate}
                        disabled={state !== 'ready'}
                        aria-label="New issue template"
                     >
                        <Plus className="size-4" />
                     </Button>
                  }
               />
               {state === 'loading' && <SettingsRow title="Loading issue templates…" />}
               {state === 'error' && <SettingsRow title="Could not load issue templates." />}
               {state === 'ready' && templates.length === 0 && (
                  <SettingsRow title="No issue templates" />
               )}
               {templates.map((template) => (
                  <SettingsRow
                     key={template.id}
                     icon={<FileText className="size-4" />}
                     title={template.name}
                     description={`Updated by ${template.createdBy.name} ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(template.updatedAt))}`}
                     onClick={() => showEdit(template)}
                  />
               ))}
            </SettingsCard>
         </SettingsSection>

         <Dialog open={open} onOpenChange={(visible) => !saving && setOpen(visible)}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>
                     {selected ? 'Edit issue template' : 'New issue template'}
                  </DialogTitle>
               </DialogHeader>
               <form className="space-y-4" onSubmit={save}>
                  <div className="space-y-2">
                     <Label htmlFor="template-name">Name</Label>
                     <Input
                        id="template-name"
                        value={draft.name}
                        onChange={(event) =>
                           setDraft((value) => ({ ...value, name: event.target.value }))
                        }
                        minLength={2}
                        maxLength={120}
                        autoFocus
                        required
                     />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="template-title">Default issue title</Label>
                     <Input
                        id="template-title"
                        value={draft.title}
                        onChange={(event) =>
                           setDraft((value) => ({ ...value, title: event.target.value }))
                        }
                        minLength={2}
                        maxLength={500}
                        required
                     />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="template-description">Description</Label>
                     <Textarea
                        id="template-description"
                        value={draft.description}
                        onChange={(event) =>
                           setDraft((value) => ({ ...value, description: event.target.value }))
                        }
                        rows={2}
                     />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="template-content">Default issue content</Label>
                     <Textarea
                        id="template-content"
                        value={draft.issueDescription}
                        onChange={(event) =>
                           setDraft((value) => ({ ...value, issueDescription: event.target.value }))
                        }
                        rows={4}
                     />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <DialogFooter>
                     {selected && (
                        <Button
                           type="button"
                           variant="ghost"
                           className="mr-auto text-destructive"
                           onClick={() => setDeleteOpen(true)}
                           disabled={saving}
                        >
                           Delete
                        </Button>
                     )}
                     <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={saving}
                     >
                        Cancel
                     </Button>
                     <Button
                        type="submit"
                        disabled={
                           saving || draft.name.trim().length < 2 || draft.title.trim().length < 2
                        }
                     >
                        {saving ? 'Saving…' : selected ? 'Save changes' : 'Create template'}
                     </Button>
                  </DialogFooter>
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
                     This issue template will be permanently removed.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               {error && <p className="text-sm text-destructive">{error}</p>}
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
      </SettingsShell>
   );
}
