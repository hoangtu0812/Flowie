'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Template = { id: string; name: string; description: string | null };
type WorkspaceResponse = { data: Array<{ workspace: { id: string } }> };

export function RealProjectTemplatesSettings() {
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [templates, setTemplates] = useState<Template[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [open, setOpen] = useState(false);
   const [name, setName] = useState('');
   const [description, setDescription] = useState('');
   const [saving, setSaving] = useState(false);
   const [message, setMessage] = useState<string>();
   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspace = (await workspaceResponse.json()) as WorkspaceResponse;
      const id = workspace.data[0]?.workspace.id;
      if (!id) throw new Error('No workspace is available.');
      setWorkspaceId(id);
      const response = await fetch(`${api}/projects/templates?workspaceId=${id}`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load templates.');
      setTemplates(((await response.json()) as { data: Template[] }).data);
   }, [api]);
   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);
   async function create(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!workspaceId || name.trim().length < 2) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await fetch(`${api}/projects/templates`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               name: name.trim(),
               description: description.trim() || undefined,
               config: {},
            }),
         });
         if (!response.ok) throw new Error('Could not create template.');
         setName('');
         setDescription('');
         setOpen(false);
         await load();
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not create template.');
      } finally {
         setSaving(false);
      }
   }
   return (
      <section className="mx-auto w-full max-w-3xl p-6">
         <div className="flex items-start justify-between gap-4">
            <div>
               <h1 className="text-xl font-semibold">Project templates</h1>
               <p className="mt-1 text-sm text-muted-foreground">
                  Reusable starting points for projects in this workspace.
               </p>
            </div>
            <Button size="sm" onClick={() => setOpen(true)}>
               <Plus className="size-4" />
               New template
            </Button>
         </div>
         {state === 'loading' && (
            <p className="mt-6 text-sm text-muted-foreground">Loading templates…</p>
         )}
         {state === 'error' && (
            <p className="mt-6 text-sm text-destructive">Could not load project templates.</p>
         )}
         {state === 'ready' &&
            (templates.length ? (
               <div className="mt-6 overflow-hidden rounded-md border">
                  {templates.map((template) => (
                     <article key={template.id} className="border-b px-4 py-3 last:border-0">
                        <h2 className="text-sm font-medium">{template.name}</h2>
                        {template.description && (
                           <p className="mt-1 text-xs text-muted-foreground">
                              {template.description}
                           </p>
                        )}
                     </article>
                  ))}
               </div>
            ) : (
               <div className="mt-6 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No project templates yet.
               </div>
            ))}
         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>New project template</DialogTitle>
               </DialogHeader>
               <form className="space-y-4" onSubmit={create}>
                  <div className="space-y-2">
                     <Label htmlFor="template-name">Name</Label>
                     <Input
                        id="template-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        minLength={2}
                        maxLength={120}
                        autoFocus
                        required
                     />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="template-description">Description</Label>
                     <Input
                        id="template-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        maxLength={1000}
                     />
                  </div>
                  {message && <p className="text-sm text-destructive">{message}</p>}
                  <div className="flex justify-end gap-2">
                     <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                     </Button>
                     <Button type="submit" disabled={saving || name.trim().length < 2}>
                        {saving ? 'Creating…' : 'Create template'}
                     </Button>
                  </div>
               </form>
            </DialogContent>
         </Dialog>
      </section>
   );
}
