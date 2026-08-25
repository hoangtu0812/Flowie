'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { Plus } from 'lucide-react';
import { useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function Header() {
   const [open, setOpen] = useState(false);
   const [name, setName] = useState('');
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   const create = async () => {
      if (name.trim().length < 2) return;
      setSaving(true);
      setError(undefined);
      try {
         const workspace = await loadCurrentWorkspace();
         const response = await authenticatedFetch(`${api}/initiatives`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId: workspace.id, name: name.trim() }),
         });
         if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { message?: string } | null;
            throw new Error(body?.message ?? 'Could not create initiative.');
         }
         setName('');
         setOpen(false);
         window.dispatchEvent(new Event('flowie:initiatives-changed'));
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not create initiative.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-2">
               <SidebarTrigger />
               <span className="text-sm font-medium">Initiatives</span>
            </div>
            <Button size="xs" variant="ghost" onClick={() => { setError(undefined); setOpen(true); }}>
               <Plus className="size-4" />
            </Button>
         </div>
         <Dialog open={open} onOpenChange={(visible) => !saving && setOpen(visible)}>
            <DialogContent>
               <DialogHeader><DialogTitle>New initiative</DialogTitle></DialogHeader>
               <div className="space-y-2">
                  <label htmlFor="initiative-name" className="text-sm font-medium">Name</label>
                  <Input id="initiative-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} autoFocus />
                  {error && <p className="text-sm text-destructive">{error}</p>}
               </div>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                  <Button onClick={() => void create()} disabled={saving || name.trim().length < 2}>{saving ? 'Creating…' : 'Create initiative'}</Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </>
   );
}
