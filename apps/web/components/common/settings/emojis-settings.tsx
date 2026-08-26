'use client';

import { loadCurrentWorkspaceTeams } from '@/components/common/teams/team-types';
import { authenticatedFetch } from '@/lib/workspaces';
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
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashedSmiley } from './settings-placeholder';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const maxEmojiSize = 512 * 1024;

type WorkspaceEmoji = {
   id: string;
   workspaceId: string;
   name: string;
   filename: string;
   mimeType: string;
   size: number;
   createdAt: string;
   createdBy: { id: string; name: string; avatarUrl: string | null };
};

function apiError(payload: unknown, fallback: string) {
   const message = (payload as { message?: string | string[] } | null)?.message;
   return Array.isArray(message) ? message[0] : (message ?? fallback);
}

/** Original Emojis settings shell backed by workspace-scoped image storage. */
export default function EmojisSettings() {
   const fileRef = useRef<HTMLInputElement>(null);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [emojis, setEmojis] = useState<WorkspaceEmoji[]>([]);
   const [filter, setFilter] = useState('');
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string>();
   const [open, setOpen] = useState(false);
   const [name, setName] = useState('');
   const [file, setFile] = useState<File>();
   const [saving, setSaving] = useState(false);
   const [formError, setFormError] = useState<string>();
   const [removing, setRemoving] = useState(false);
   const [removeTarget, setRemoveTarget] = useState<WorkspaceEmoji>();

   const load = useCallback(async () => {
      setLoading(true);
      setLoadError(undefined);
      try {
         const { workspaceId: id } = await loadCurrentWorkspaceTeams();
         const response = await authenticatedFetch(
            `${api}/emojis?${new URLSearchParams({ workspaceId: id })}`
         );
         if (!response.ok) throw new Error('Could not load workspace emojis.');
         setWorkspaceId(id);
         setEmojis(((await response.json()) as { data: WorkspaceEmoji[] }).data);
      } catch (caught) {
         setLoadError(
            caught instanceof Error ? caught.message : 'Could not load workspace emojis.'
         );
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void load();
   }, [load]);

   const visibleEmojis = useMemo(() => {
      const value = filter.trim().toLowerCase();
      return value ? emojis.filter((emoji) => emoji.name.includes(value)) : emojis;
   }, [emojis, filter]);

   const reset = () => {
      setName('');
      setFile(undefined);
      setFormError(undefined);
      if (fileRef.current) fileRef.current.value = '';
   };

   const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0];
      setFile(selected);
      setFormError(undefined);
      if (selected && !name) {
         setName(
            selected.name
               .replace(/\.[^.]+$/, '')
               .toLowerCase()
               .replace(/[^a-z0-9_-]+/g, '_')
               .replace(/^_+|_+$/g, '')
               .slice(0, 32)
         );
      }
   };

   const upload = async () => {
      if (!workspaceId || !file || !/^[a-z0-9][a-z0-9_-]{1,31}$/.test(name)) {
         setFormError('Choose an image and enter a 2–32 character lowercase emoji name.');
         return;
      }
      if (file.size > maxEmojiSize) {
         setFormError('Emoji images must be 512 KB or smaller.');
         return;
      }
      setSaving(true);
      setFormError(undefined);
      try {
         const form = new FormData();
         form.set('workspaceId', workspaceId);
         form.set('name', name);
         form.set('file', file);
         const response = await authenticatedFetch(`${api}/emojis`, {
            method: 'POST',
            credentials: 'include',
            body: form,
         });
         const payload = await response.json().catch(() => undefined);
         if (!response.ok) throw new Error(apiError(payload, 'Could not upload emoji.'));
         setOpen(false);
         reset();
         await load();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not upload emoji.');
      } finally {
         setSaving(false);
      }
   };

   const archive = async (emoji: WorkspaceEmoji) => {
      if (!workspaceId || removing) return;
      setRemoving(true);
      const response = await authenticatedFetch(
         `${api}/emojis/${emoji.id}?${new URLSearchParams({ workspaceId })}`,
         { method: 'DELETE', credentials: 'include' }
      );
      if (!response.ok) {
         const payload = await response.json().catch(() => undefined);
         setLoadError(apiError(payload, 'Could not remove emoji.'));
         setRemoving(false);
         return;
      }
      setEmojis((current) => current.filter((item) => item.id !== emoji.id));
      setRemoveTarget(undefined);
      setRemoving(false);
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-2xl font-medium">Emojis</h1>

            <div className="flex items-center justify-between gap-3 mt-6">
               <Input
                  placeholder="Filter by name..."
                  className="w-72 h-8"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value.toLowerCase())}
               />
               <Button
                  size="xs"
                  onClick={() => {
                     reset();
                     setOpen(true);
                  }}
               >
                  Upload
               </Button>
            </div>

            {loading && <p className="py-12 text-sm text-muted-foreground">Loading emojis…</p>}
            {loadError && <p className="py-12 text-sm text-destructive">{loadError}</p>}
            {!loading && !loadError && visibleEmojis.length === 0 && (
               <div className="flex flex-col items-center justify-center gap-5 py-32">
                  <DashedSmiley />
                  <p className="text-sm text-muted-foreground">
                     {emojis.length === 0 ? 'No emojis' : 'No matching emojis'}
                  </p>
               </div>
            )}
            {!loading && !loadError && visibleEmojis.length > 0 && (
               <div className="mt-5 overflow-hidden rounded-lg border bg-container divide-y">
                  {visibleEmojis.map((emoji) => (
                     <div className="flex items-center gap-3 px-4 py-3" key={emoji.id}>
                        {/* The authenticated image route keeps MinIO objects private. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                           src={`${api}/emojis/${emoji.id}/image?${new URLSearchParams({ workspaceId: emoji.workspaceId })}`}
                           alt={`:${emoji.name}:`}
                           className="size-8 shrink-0 object-contain"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                           :{emoji.name}:
                        </span>
                        <span className="text-xs text-muted-foreground">
                           {emoji.createdBy.name}
                        </span>
                        <Button
                           variant="ghost"
                           size="xxs"
                           className="px-1.5"
                           title={`Remove :${emoji.name}:`}
                           aria-label={`Remove :${emoji.name}:`}
                           onClick={() => setRemoveTarget(emoji)}
                        >
                           <Trash2 className="size-3.5" />
                        </Button>
                     </div>
                  ))}
               </div>
            )}
         </div>

         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Upload emoji</DialogTitle>
                  <DialogDescription>
                     PNG, JPEG, GIF or WebP. Maximum file size is 512 KB.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                     <label htmlFor="emoji-name" className="text-sm font-medium">
                        Name
                     </label>
                     <Input
                        id="emoji-name"
                        value={name}
                        maxLength={32}
                        placeholder="ship_it"
                        onChange={(event) =>
                           setName(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
                        }
                     />
                  </div>
                  <div className="space-y-1.5">
                     <label htmlFor="emoji-file" className="text-sm font-medium">
                        Image
                     </label>
                     <Input
                        ref={fileRef}
                        id="emoji-file"
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        onChange={selectFile}
                     />
                  </div>
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
               </div>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                     Cancel
                  </Button>
                  <Button onClick={() => void upload()} disabled={saving}>
                     {saving ? 'Uploading…' : 'Upload'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
         <AlertDialog
            open={Boolean(removeTarget)}
            onOpenChange={(visible) => !visible && !removing && setRemoveTarget(undefined)}
         >
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Remove :{removeTarget?.name}:?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This emoji will no longer be available in the workspace.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     disabled={removing}
                     className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                     onClick={(event) => {
                        event.preventDefault();
                        if (removeTarget) void archive(removeTarget);
                     }}
                  >
                     {removing ? 'Removing…' : 'Remove'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   );
}
