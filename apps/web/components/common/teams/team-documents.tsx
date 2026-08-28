'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingState } from '@/components/common/loading-state';
import { IconPicker } from '@/components/common/icon-picker';
import { MarkdownDocumentEditor } from './markdown-document-editor';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import {
   ChevronRight,
   Download,
   Eye,
   ExternalLink,
   FileText,
   FolderPlus,
   Link2,
   Pin,
   Plus,
   SlidersHorizontal,
   Trash2,
   Upload,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { type LiveDocument, useLiveTeam } from './use-live-team';

const timeAgo = (date: string) =>
   formatDistanceToNowStrict(parseISO(date), { addSuffix: true })
      .replace(' minutes', 'min')
      .replace(' hours', 'h')
      .replace(' days', 'd')
      .replace(' weeks', 'w')
      .replace(' months', 'mo')
      .replace(' years', 'y');

/** Documents tab backed by FastAPI/PostgreSQL, retaining Circle’s grouped list layout. */
export default function TeamDocuments() {
   const { teamId } = useParams<{ teamId: string }>();
   const {
      documentFolders,
      team,
      loading,
      error,
      createDocument,
      createFolder,
      uploadDocumentFile,
      updateFolder,
      updateDocument,
      deleteDocument,
   } = useLiveTeam(teamId);
   const [documentOpen, setDocumentOpen] = useState(false);
   const [folderOpen, setFolderOpen] = useState(false);
   const [title, setTitle] = useState('');
   const [folderId, setFolderId] = useState('');
   const [documentType, setDocumentType] = useState<'markdown' | 'upload' | 'link'>('markdown');
   const [sourceUrl, setSourceUrl] = useState('');
   const [file, setFile] = useState<File>();
   const [folderName, setFolderName] = useState('');
   const [folderIcon, setFolderIcon] = useState('📁');
   const [saving, setSaving] = useState(false);
   const [editorDocument, setEditorDocument] = useState<LiveDocument>();
   const [previewDocument, setPreviewDocument] = useState<LiveDocument>();
   const [documentToDelete, setDocumentToDelete] = useState<LiveDocument>();
   const createIntentHandled = useRef(false);

   useEffect(() => {
      if (createIntentHandled.current || !team || documentFolders.length === 0) return;
      const requestedType = new URLSearchParams(window.location.search).get('create');
      if (requestedType !== 'markdown' && requestedType !== 'link') return;
      createIntentHandled.current = true;
      setTitle('');
      setDocumentType(requestedType);
      setSourceUrl('');
      setFile(undefined);
      setFolderId(documentFolders[0].id);
      setDocumentOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
   }, [documentFolders, team]);

   if (loading) return <LoadingState label="Loading documents…" />;
   if (error || !team)
      return (
         <div className="h-full grid place-items-center text-sm text-destructive">
            {error ?? 'Team not found.'}
         </div>
      );

   const openDocument = () => {
      setTitle('');
      setDocumentType('markdown');
      setSourceUrl('');
      setFile(undefined);
      setFolderId(documentFolders[0]?.id ?? '');
      setDocumentOpen(true);
   };
   const create = async () => {
      if (
         !title.trim() ||
         !folderId ||
         (documentType === 'upload' && !file) ||
         (documentType === 'link' && !sourceUrl.trim())
      )
         return;
      setSaving(true);
      try {
         const document = await createDocument({
            title,
            folderId,
            sourceType: documentType,
            sourceUrl: documentType === 'link' ? sourceUrl.trim() : undefined,
            icon: documentType === 'link' ? '🔗' : documentType === 'upload' ? '📎' : '📝',
         });
         if (file) await uploadDocumentFile(document.id, file);
         setDocumentOpen(false);
         if (documentType === 'markdown') setEditorDocument(document);
         toast.success(
            documentType === 'upload'
               ? 'File uploaded.'
               : documentType === 'link'
                 ? 'Document link added.'
                 : 'Markdown document created.'
         );
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not create document.');
      } finally {
         setSaving(false);
      }
   };
   const createNewFolder = async () => {
      if (!folderName.trim()) return;
      setSaving(true);
      try {
         await createFolder(folderName.trim(), folderIcon);
         setFolderName('');
         setFolderIcon('📁');
         setFolderOpen(false);
         toast.success('Folder created.');
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not create folder.');
      } finally {
         setSaving(false);
      }
   };
   const validFile = !file || /\.(docx|pdf|md)$/i.test(file.name);

   return (
      <div className="w-full">
         <div className="relative grid grid-cols-[1fr_64px] md:grid-cols-[1fr_90px_90px_72px] items-center px-6 py-3 text-sm text-muted-foreground">
            <div className="contents">
               <span className="flex items-center gap-1 font-medium">Name ↓</span>
               <span className="hidden md:block">Created</span>
               <span className="hidden md:block">Last edited</span>
               <span />
            </div>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
               <Button size="xs" variant="outline" onClick={() => setFolderOpen(true)}>
                  <FolderPlus className="size-4 md:mr-1" />
                  <span className="hidden md:inline">New folder</span>
               </Button>
               <Button
                  size="xs"
                  variant="secondary"
                  onClick={openDocument}
                  disabled={documentFolders.length === 0}
               >
                  <Plus className="size-4 md:mr-1" />
                  <span className="hidden md:inline">New document</span>
               </Button>
               <Button size="xs" variant="ghost" aria-label="Display options">
                  <SlidersHorizontal className="size-4" />
               </Button>
            </div>
         </div>
         {documentFolders.map((folder) => (
            <Collapsible
               key={folder.id}
               defaultOpen={folder.documents.some((document) => document.pinned)}
            >
               <div className="group flex items-center bg-sidebar/30 hover:bg-sidebar/60 border-b border-border/50">
                  <CollapsibleTrigger asChild>
                     <button className="flex-1 flex items-center gap-2 px-6 h-10 text-sm text-left">
                        <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                        <span className="text-base leading-none">{folder.icon}</span>
                        <span className="font-medium">{folder.name}</span>
                        <span className="text-muted-foreground">{folder.documents.length}</span>
                     </button>
                  </CollapsibleTrigger>
                  <IconPicker
                     value={folder.icon}
                     onChange={(icon) =>
                        void updateFolder(folder.id, { icon }).catch((caught) =>
                           toast.error(
                              caught instanceof Error
                                 ? caught.message
                                 : 'Could not update folder icon.'
                           )
                        )
                     }
                     label={`Change icon for ${folder.name}`}
                     compact
                     className="size-7 p-0 mr-4 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  />
               </div>
               <CollapsibleContent>
                  {folder.documents.map((document) => (
                     <div
                        key={document.id}
                        className="group grid grid-cols-[1fr_64px] md:grid-cols-[1fr_90px_90px_72px] items-center px-6 h-11 hover:bg-sidebar/50 border-b border-border/30 text-sm"
                     >
                        <div className="flex items-center gap-2 min-w-0 pl-6">
                           <span className="text-base leading-none">{document.icon}</span>
                           {document.sourceType === 'markdown' ||
                           document.sourceType === 'flowie' ? (
                              <button
                                 type="button"
                                 className="font-medium truncate text-left hover:underline"
                                 onClick={() => setEditorDocument(document)}
                              >
                                 {document.title}
                              </button>
                           ) : document.sourceType === 'upload' && document.sourceAttachment ? (
                              <button
                                 type="button"
                                 className="font-medium truncate text-left hover:underline"
                                 onClick={() => setPreviewDocument(document)}
                              >
                                 {document.title}
                              </button>
                           ) : (
                              <span className="font-medium truncate">{document.title}</span>
                           )}
                           {document.sourceType === 'link' && (
                              <a
                                 href={document.sourceUrl ?? '#'}
                                 target="_blank"
                                 rel="noreferrer"
                                 aria-label={`Open ${document.title}`}
                                 className="text-muted-foreground hover:text-foreground"
                              >
                                 <ExternalLink className="size-3.5" />
                              </a>
                           )}
                           {document.sourceType === 'upload' && document.sourceAttachment && (
                              <>
                                 <button
                                    type="button"
                                    aria-label={`Preview ${document.sourceAttachment.filename}`}
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => setPreviewDocument(document)}
                                 >
                                    <Eye className="size-3.5" />
                                 </button>
                                 <a
                                    href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/attachments/${document.sourceAttachment.id}/download`}
                                    aria-label={`Download ${document.sourceAttachment.filename}`}
                                    className="text-muted-foreground hover:text-foreground"
                                 >
                                    <Download className="size-3.5" />
                                 </a>
                              </>
                           )}
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
                        <div className="flex items-center justify-end gap-2">
                           <Avatar className="size-5">
                              <AvatarImage
                                 src={document.createdBy.avatarUrl ?? undefined}
                                 alt={document.createdBy.name}
                              />
                              <AvatarFallback>{document.createdBy.name[0]}</AvatarFallback>
                           </Avatar>
                           <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                              aria-label={`Delete ${document.title}`}
                              onClick={() => setDocumentToDelete(document)}
                           >
                              <Trash2 className="size-3.5" />
                           </Button>
                        </div>
                     </div>
                  ))}
               </CollapsibleContent>
            </Collapsible>
         ))}
         {documentFolders.length === 0 && (
            <p className="px-6 py-10 text-sm text-muted-foreground">
               No team document folders yet.
            </p>
         )}
         <Dialog open={folderOpen} onOpenChange={(next) => !saving && setFolderOpen(next)}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>New folder</DialogTitle>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={folderName}
                     onChange={(event) => setFolderName(event.target.value)}
                     placeholder="Folder name"
                     autoFocus
                  />
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                     <span className="text-sm text-muted-foreground">Folder icon</span>
                     <IconPicker
                        value={folderIcon}
                        onChange={setFolderIcon}
                        label="Choose folder icon"
                     />
                  </div>
               </div>
               <DialogFooter>
                  <Button variant="outline" disabled={saving} onClick={() => setFolderOpen(false)}>
                     Cancel
                  </Button>
                  <Button
                     disabled={saving || folderName.trim().length < 2}
                     onClick={() => void createNewFolder()}
                  >
                     {saving ? 'Creating…' : 'Create folder'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
         <Dialog open={documentOpen} onOpenChange={(next) => !saving && setDocumentOpen(next)}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>New document</DialogTitle>
               </DialogHeader>
               <div className="space-y-3">
                  <Select
                     value={documentType}
                     onValueChange={(value: 'markdown' | 'upload' | 'link') =>
                        setDocumentType(value)
                     }
                  >
                     <SelectTrigger>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="markdown">
                           <span className="inline-flex items-center gap-2">
                              <FileText className="size-4" />
                              Markdown document
                           </span>
                        </SelectItem>
                        <SelectItem value="upload">
                           <span className="inline-flex items-center gap-2">
                              <Upload className="size-4" />
                              Upload DOCX, PDF or Markdown
                           </span>
                        </SelectItem>
                        <SelectItem value="link">
                           <span className="inline-flex items-center gap-2">
                              <Link2 className="size-4" />
                              SharePoint, Google Drive or web link
                           </span>
                        </SelectItem>
                     </SelectContent>
                  </Select>
                  <Input
                     value={title}
                     onChange={(event) => setTitle(event.target.value)}
                     placeholder="Document title"
                     autoFocus
                  />
                  <Select value={folderId} onValueChange={setFolderId}>
                     <SelectTrigger>
                        <SelectValue placeholder="Select folder" />
                     </SelectTrigger>
                     <SelectContent>
                        {documentFolders.map((folder) => (
                           <SelectItem key={folder.id} value={folder.id}>
                              {folder.icon} {folder.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
                  {documentType === 'upload' && (
                     <div className="space-y-1">
                        <Input
                           type="file"
                           accept=".docx,.pdf,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown"
                           onChange={(event) => {
                              const selected = event.target.files?.[0];
                              setFile(selected);
                              if (selected && !title)
                                 setTitle(selected.name.replace(/\.(docx|pdf|md)$/i, ''));
                           }}
                        />
                        {!validFile && (
                           <p className="text-xs text-destructive">
                              Only DOCX, PDF, and Markdown files are accepted.
                           </p>
                        )}
                     </div>
                  )}
                  {documentType === 'link' && (
                     <Input
                        type="url"
                        value={sourceUrl}
                        onChange={(event) => setSourceUrl(event.target.value)}
                        placeholder="https://sharepoint.com/... or https://drive.google.com/..."
                     />
                  )}
               </div>
               <DialogFooter>
                  <Button
                     variant="outline"
                     disabled={saving}
                     onClick={() => setDocumentOpen(false)}
                  >
                     Cancel
                  </Button>
                  <Button
                     disabled={
                        saving ||
                        title.trim().length < 2 ||
                        !folderId ||
                        (documentType === 'upload' && (!file || !validFile)) ||
                        (documentType === 'link' && !sourceUrl.trim())
                     }
                     onClick={() => void create()}
                  >
                     {saving
                        ? 'Saving…'
                        : documentType === 'upload'
                          ? 'Upload document'
                          : documentType === 'link'
                            ? 'Add link'
                            : 'Create document'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
         <MarkdownDocumentEditor
            document={editorDocument}
            open={Boolean(editorDocument)}
            onOpenChange={(open) => !open && setEditorDocument(undefined)}
            onUpdate={async (documentId, draft) => updateDocument(documentId, draft)}
         />
         <Dialog
            open={Boolean(previewDocument)}
            onOpenChange={(open) => !open && setPreviewDocument(undefined)}
         >
            <DialogContent className="flex h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] !max-w-none flex-col gap-0 overflow-hidden p-0 sm:!max-w-none">
               <DialogHeader className="border-b px-6 py-4 pr-12">
                  <DialogTitle className="truncate">{previewDocument?.title}</DialogTitle>
               </DialogHeader>
               <div className="min-h-0 flex-1 bg-muted/20">
                  {previewDocument?.sourceAttachment && (
                     <iframe
                        title={`Preview ${previewDocument.sourceAttachment.filename}`}
                        src={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/attachments/${previewDocument.sourceAttachment.id}/preview`}
                        className="size-full border-0 bg-white"
                     />
                  )}
               </div>
               <DialogFooter className="border-t px-6 py-4 sm:justify-between">
                  {previewDocument?.sourceAttachment && (
                     <a
                        href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/attachments/${previewDocument.sourceAttachment.id}/download`}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
                     >
                        <Download className="size-4" />
                        Download original
                     </a>
                  )}
                  <Button variant="outline" onClick={() => setPreviewDocument(undefined)}>
                     Close
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
         <AlertDialog
            open={Boolean(documentToDelete)}
            onOpenChange={(open) => !open && setDocumentToDelete(undefined)}
         >
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete document?</AlertDialogTitle>
                  <AlertDialogDescription>
                     “{documentToDelete?.title}” will be removed from this team. This can be
                     recovered only from a database backup.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     className="bg-destructive text-white hover:bg-destructive/90"
                     onClick={() => {
                        if (!documentToDelete) return;
                        void deleteDocument(documentToDelete.id)
                           .then(() => toast.success('Document deleted.'))
                           .catch((caught) =>
                              toast.error(
                                 caught instanceof Error
                                    ? caught.message
                                    : 'Could not delete document.'
                              )
                           )
                           .finally(() => setDocumentToDelete(undefined));
                     }}
                  >
                     Delete document
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   );
}
