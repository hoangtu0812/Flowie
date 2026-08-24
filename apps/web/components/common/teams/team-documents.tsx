'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNowStrict } from 'date-fns';
import { ChevronRight, FileText, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useLiveTeam } from './use-live-team';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const timeAgo = (date: string) => formatDistanceToNowStrict(new Date(date), { addSuffix: true });

/** Team documents preserve the original table layout and create records through the API. */
export default function TeamDocuments() {
   const { teamId } = useParams<{ orgId: string; teamId: string }>();
   const { workspaceId, team, documents, loading, error, reload } = useLiveTeam(teamId);
   const [open, setOpen] = useState(false);
   const [editingDocumentId, setEditingDocumentId] = useState<string>();
   const [title, setTitle] = useState('');
   const [content, setContent] = useState('');
   const [submitting, setSubmitting] = useState(false);
   const [formError, setFormError] = useState<string>();

   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading documents…</div>;
   if (error || !team || !workspaceId)
      return (
         <div className="px-8 py-10 text-sm text-destructive">{error ?? 'Team not found.'}</div>
      );

   const openCreateDialog = () => {
      setEditingDocumentId(undefined);
      setTitle('');
      setContent('');
      setFormError(undefined);
      setOpen(true);
   };

   const openEditDialog = (documentId: string) => {
      const document = documents.find((candidate) => candidate.id === documentId);
      if (!document) return;
      setEditingDocumentId(document.id);
      setTitle(document.title);
      setContent(document.content);
      setFormError(undefined);
      setOpen(true);
   };

   const saveDocument = async () => {
      if (title.trim().length < 2) {
         setFormError('Document title must contain at least 2 characters.');
         return;
      }
      setSubmitting(true);
      setFormError(undefined);
      try {
         const response = await fetch(
            editingDocumentId
               ? `${api}/documents/${editingDocumentId}?${new URLSearchParams({ workspaceId }).toString()}`
               : `${api}/documents`,
            {
               method: editingDocumentId ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify(
                  editingDocumentId
                     ? { title: title.trim(), content }
                     : { workspaceId, teamId: team.id, title: title.trim(), content }
               ),
            }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not save document.');
         }
         setOpen(false);
         setTitle('');
         setContent('');
         reload();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not save document.');
      } finally {
         setSubmitting(false);
      }
   };

   const archiveDocument = async () => {
      if (!editingDocumentId) return;
      setSubmitting(true);
      setFormError(undefined);
      try {
         const response = await fetch(
            `${api}/documents/${editingDocumentId}?${new URLSearchParams({ workspaceId }).toString()}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not archive document.');
         setOpen(false);
         setEditingDocumentId(undefined);
         reload();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not archive document.');
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <div className="w-full">
         <div className="flex items-center justify-between px-6 py-3 gap-2">
            <div className="grid grid-cols-[1fr_40px] md:grid-cols-[1fr_90px_90px_40px] w-full items-center text-sm text-muted-foreground">
               <span className="flex items-center gap-1 font-medium">Name ↓</span>
               <span className="hidden md:block">Created</span>
               <span className="hidden md:block">Last edited</span>
               <span />
            </div>
            <div className="flex items-center gap-2 shrink-0">
               <Button size="xs" variant="secondary" onClick={openCreateDialog}>
                  <Plus className="size-4 md:mr-1" />
                  <span className="hidden md:inline">New document</span>
               </Button>
               <Button size="xs" variant="ghost">
                  <SlidersHorizontal className="size-4" />
               </Button>
            </div>
         </div>

         <Collapsible defaultOpen>
            <CollapsibleTrigger asChild>
               <button className="group w-full flex items-center gap-2 px-6 h-10 bg-sidebar/30 hover:bg-sidebar/60 border-b border-border/50 text-sm">
                  <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="font-medium">Documents</span>
                  <span className="text-muted-foreground">{documents.length}</span>
               </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
               {documents.length === 0 ? (
                  <p className="px-12 py-5 text-sm text-muted-foreground">No documents yet.</p>
               ) : (
                  documents.map((document) => (
                     <button
                        key={document.id}
                        type="button"
                        onClick={() => openEditDialog(document.id)}
                        className="grid w-full grid-cols-[1fr_40px] md:grid-cols-[1fr_90px_90px_40px] items-center px-6 h-11 hover:bg-sidebar/50 border-b border-border/30 text-sm text-left"
                     >
                        <div className="flex items-center gap-2 min-w-0 pl-6">
                           <FileText className="size-4 text-muted-foreground shrink-0" />
                           <span className="font-medium truncate">{document.title}</span>
                        </div>
                        <span className="hidden md:block text-xs text-muted-foreground">
                           {timeAgo(document.createdAt)}
                        </span>
                        <span className="hidden md:block text-xs text-muted-foreground">
                           {timeAgo(document.updatedAt)}
                        </span>
                        <Avatar className="size-5">
                           <AvatarImage
                              src={document.updatedBy.avatarUrl ?? undefined}
                              alt={document.updatedBy.name}
                           />
                           <AvatarFallback>{document.updatedBy.name[0]}</AvatarFallback>
                        </Avatar>
                     </button>
                  ))
               )}
            </CollapsibleContent>
         </Collapsible>

         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>{editingDocumentId ? 'Edit document' : 'New document'}</DialogTitle>
                  <DialogDescription>
                     {editingDocumentId
                        ? `Update this document in ${team.name}.`
                        : `Create a document in ${team.name}.`}
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={title}
                     onChange={(event) => setTitle(event.target.value)}
                     placeholder="Document title"
                     autoFocus
                  />
                  <Textarea
                     value={content}
                     onChange={(event) => setContent(event.target.value)}
                     placeholder="Start writing…"
                  />
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
               </div>
               <DialogFooter>
                  {editingDocumentId && (
                     <Button
                        variant="destructive"
                        onClick={() => void archiveDocument()}
                        disabled={submitting}
                        className="mr-auto"
                     >
                        <Trash2 className="size-4" />
                        Archive
                     </Button>
                  )}
                  <Button variant="outline" onClick={() => setOpen(false)}>
                     Cancel
                  </Button>
                  <Button onClick={() => void saveDocument()} disabled={submitting}>
                     {submitting
                        ? 'Saving…'
                        : editingDocumentId
                          ? 'Save changes'
                          : 'Create document'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
