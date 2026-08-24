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
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuLabel,
   DropdownMenuRadioGroup,
   DropdownMenuRadioItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ChevronRight, Pin, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveTeam, type LiveDocumentFolder } from './use-live-team';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const timeAgo = (date: string) =>
   formatDistanceToNowStrict(parseISO(date), { addSuffix: true })
      .replace(' minutes', 'min')
      .replace(' hours', 'h')
      .replace(' days', 'd')
      .replace(' weeks', 'w')
      .replace(' months', 'mo')
      .replace(' years', 'y');

type SortField = 'name' | 'createdAt' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

/** Team Home — "Documents" tab backed by persisted folders and documents. */
export default function TeamDocuments() {
   const { teamId } = useParams<{ orgId: string; teamId: string }>();
   const { workspaceId, team, documents, documentFolders, loading, error, reload } =
      useLiveTeam(teamId);
   const [open, setOpen] = useState(false);
   const [editingDocumentId, setEditingDocumentId] = useState<string>();
   const [title, setTitle] = useState('');
   const [content, setContent] = useState('');
   const [folderId, setFolderId] = useState('');
   const [icon, setIcon] = useState('📄');
   const [pinned, setPinned] = useState(false);
   const [newFolderName, setNewFolderName] = useState('');
   const [submitting, setSubmitting] = useState(false);
   const [creatingFolder, setCreatingFolder] = useState(false);
   const [formError, setFormError] = useState<string>();
   const [sortField, setSortField] = useState<SortField>('name');
   const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
   const openedFromQuery = useRef(false);

   const sortedFolders = useMemo(
      () =>
         documentFolders.map((folder) => ({
            ...folder,
            documents: [...folder.documents].sort((left, right) => {
               const leftValue = sortField === 'name' ? left.title : left[sortField];
               const rightValue = sortField === 'name' ? right.title : right[sortField];
               const comparison = leftValue.localeCompare(rightValue, undefined, {
                  numeric: true,
                  sensitivity: 'base',
               });
               return sortDirection === 'asc' ? comparison : -comparison;
            }),
         })),
      [documentFolders, sortDirection, sortField]
   );

   const openCreateDialog = useCallback(() => {
      setEditingDocumentId(undefined);
      setTitle('');
      setContent('');
      setFolderId(documentFolders[0]?.id ?? '');
      setIcon('📄');
      setPinned(false);
      setNewFolderName('');
      setFormError(undefined);
      setOpen(true);
   }, [documentFolders]);

   useEffect(() => {
      if (loading || openedFromQuery.current || typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      if (url.searchParams.get('new') !== '1') return;
      openedFromQuery.current = true;
      url.searchParams.delete('new');
      window.history.replaceState(
         window.history.state,
         '',
         `${url.pathname}${url.search}${url.hash}`
      );
      openCreateDialog();
   }, [loading, openCreateDialog]);

   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading documents…</div>;
   if (error || !team || !workspaceId)
      return (
         <div className="px-8 py-10 text-sm text-destructive">{error ?? 'Team not found.'}</div>
      );

   const openEditDialog = (documentId: string) => {
      const document = documents.find((candidate) => candidate.id === documentId);
      if (!document) return;
      setEditingDocumentId(document.id);
      setTitle(document.title);
      setContent(document.content);
      setFolderId(document.folderId ?? documentFolders[0]?.id ?? '');
      setIcon(document.icon);
      setPinned(document.pinned);
      setNewFolderName('');
      setFormError(undefined);
      setOpen(true);
   };

   const createFolder = async () => {
      if (newFolderName.trim().length < 2) {
         setFormError('Folder name must contain at least 2 characters.');
         return;
      }
      setCreatingFolder(true);
      setFormError(undefined);
      try {
         const response = await fetch(`${api}/documents/folders`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               teamId: team.id,
               name: newFolderName.trim(),
               icon: '📁',
            }),
         });
         const payload = (await response.json().catch(() => null)) as {
            data?: LiveDocumentFolder;
            message?: string;
         } | null;
         if (!response.ok || !payload?.data) {
            throw new Error(payload?.message ?? 'Could not create folder.');
         }
         setFolderId(payload.data.id);
         setNewFolderName('');
         reload();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not create folder.');
      } finally {
         setCreatingFolder(false);
      }
   };

   const saveDocument = async () => {
      if (title.trim().length < 2) {
         setFormError('Document title must contain at least 2 characters.');
         return;
      }
      if (!folderId) {
         setFormError('Select a folder for this document.');
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
                     ? { title: title.trim(), content, folderId, icon, pinned }
                     : {
                          workspaceId,
                          teamId: team.id,
                          title: title.trim(),
                          content,
                          folderId,
                          icon,
                          pinned,
                       }
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
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button size="xs" variant="ghost">
                        <SlidersHorizontal className="size-4" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                     <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                     <DropdownMenuRadioGroup
                        value={sortField}
                        onValueChange={(value) => setSortField(value as SortField)}
                     >
                        <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="createdAt">Created</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="updatedAt">Last edited</DropdownMenuRadioItem>
                     </DropdownMenuRadioGroup>
                     <DropdownMenuSeparator />
                     <DropdownMenuLabel>Direction</DropdownMenuLabel>
                     <DropdownMenuRadioGroup
                        value={sortDirection}
                        onValueChange={(value) => setSortDirection(value as SortDirection)}
                     >
                        <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
                     </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </div>

         {sortedFolders.map((folder) => (
            <Collapsible key={folder.id} defaultOpen={folder.documents.some((doc) => doc.pinned)}>
               <CollapsibleTrigger asChild>
                  <button className="group w-full flex items-center gap-2 px-6 h-10 bg-sidebar/30 hover:bg-sidebar/60 border-b border-border/50 text-sm">
                     <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                     <span className="text-base leading-none">{folder.icon}</span>
                     <span className="font-medium">{folder.name}</span>
                     <span className="text-muted-foreground">{folder.documents.length}</span>
                  </button>
               </CollapsibleTrigger>
               <CollapsibleContent>
                  {folder.documents.map((document) => (
                     <div
                        key={document.id}
                        onClick={() => openEditDialog(document.id)}
                        className="grid grid-cols-[1fr_40px] md:grid-cols-[1fr_90px_90px_40px] items-center px-6 h-11 hover:bg-sidebar/50 border-b border-border/30 text-sm"
                     >
                        <div className="flex items-center gap-2 min-w-0 pl-6">
                           <span className="text-base leading-none">{document.icon}</span>
                           <span className="font-medium truncate">{document.title}</span>
                           {document.pinned && (
                              <Pin className="size-3 text-muted-foreground shrink-0" />
                           )}
                        </div>
                        <span className="hidden md:block text-xs text-muted-foreground">
                           {timeAgo(document.createdAt)}
                        </span>
                        <span className="hidden md:block text-xs text-muted-foreground">
                           {timeAgo(document.updatedAt)}
                        </span>
                        <Avatar className="size-5">
                           <AvatarImage
                              src={document.createdBy.avatarUrl ?? undefined}
                              alt={document.createdBy.name}
                           />
                           <AvatarFallback>{document.createdBy.name[0]}</AvatarFallback>
                        </Avatar>
                     </div>
                  ))}
               </CollapsibleContent>
            </Collapsible>
         ))}

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
                  <div className="grid grid-cols-[72px_1fr] gap-2">
                     <Input
                        value={icon}
                        onChange={(event) => setIcon(event.target.value)}
                        placeholder="Icon"
                        aria-label="Document icon"
                     />
                     <Select value={folderId} onValueChange={setFolderId}>
                        <SelectTrigger>
                           <SelectValue placeholder="Select a folder" />
                        </SelectTrigger>
                        <SelectContent>
                           {documentFolders.map((folder) => (
                              <SelectItem key={folder.id} value={folder.id}>
                                 {folder.icon} {folder.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                     <span className="text-sm">Pin to team resources</span>
                     <Switch checked={pinned} onCheckedChange={setPinned} />
                  </div>
                  <div className="flex items-center gap-2">
                     <Input
                        value={newFolderName}
                        onChange={(event) => setNewFolderName(event.target.value)}
                        placeholder="New folder name"
                     />
                     <Button
                        type="button"
                        variant="outline"
                        onClick={() => void createFolder()}
                        disabled={creatingFolder}
                     >
                        {creatingFolder ? 'Creating…' : 'Create folder'}
                     </Button>
                  </div>
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
