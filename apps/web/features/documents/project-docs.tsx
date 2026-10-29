'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
   CloudUpload,
   FilePlus2,
   FileText,
   FileUp,
   FolderPlus,
   FolderUp,
   LayoutTemplate,
   Search,
} from 'lucide-react';
import { TreeList } from '@astryxdesign/core/TreeList';
import type { TreeListItemData } from '@astryxdesign/core/TreeList';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import { MarkdownDocumentEditor } from '@/components/common/teams/markdown-document-editor';
import type { LiveDocument } from '@/components/common/teams/use-live-team';
import { useLocale } from '@/features/shared/use-locale';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';
import { documentTemplate, documentTitle } from '@/lib/document-templates';
import {
   buildTree,
   filterTree,
   type DocType,
   type FolderKind,
   type TreeFile,
   type TreeNode,
} from '@/lib/document-tree';
import { relativeTime } from '@/lib/time';
import {
   createDocumentFolder,
   createTreeDocument,
   loadProjectTree,
   scaffoldProjectTree,
   updateTreeDocument,
   uploadFolderFile,
   type ProjectTree,
   type ProjectTreeDocument,
} from './project-docs-api';
import { DocStatusBadge, DocTypeBadge, DOC_TYPES } from './document-badges';
import { DocumentPreview, EmptyPreview, PdfPreview } from './doc-preview';
import { ProjectSharepointDialog } from './project-sharepoint';
import { loadProjectSharepoint } from '@/components/settings/sharepoint-integration';

const FOLDER_KINDS: { value: FolderKind; label: keyof typeof messages }[] = [
   { value: 'module', label: 'Module' },
   { value: 'feature', label: 'Feature' },
   { value: 'changes', label: 'Bugs & changes' },
   { value: 'general', label: 'General folder' },
];

/**
 * Project "Docs" tab: the project's document tree (project → module → feature → bugs &
 * changes), filterable by document type and searchable by title and content, with folders
 * and FDS/TDS documents created and PDFs uploaded in the selected folder. The tree sits on
 * the left; a selected document or PDF is previewed on the right, and Edit opens the shared
 * Markdown editor. Below the lg breakpoint the preview stacks under the tree.
 * VI: Tab "Docs" của dự án: cây tài liệu (dự án → module → tính năng → bugs & changes), lọc
 * VI: theo loại và tìm theo tiêu đề, nội dung; tạo thư mục, tài liệu FDS/TDS và tải PDF lên
 * VI: thư mục đang chọn. Cây nằm bên trái; tài liệu hoặc PDF được chọn hiển thị xem trước
 * VI: bên phải, nút Sửa mở editor Markdown dùng chung. Dưới breakpoint lg, khung xem trước
 * VI: nằm dưới cây.
 */
export function ProjectDocs({ projectId }: { projectId: string }) {
   const tx = useMessages(messages);
   const { locale } = useLocale();
   const [tree, setTree] = useState<ProjectTree>();
   const [error, setError] = useState<string>();
   const [query, setQuery] = useState('');
   const [docType, setDocType] = useState<DocType | 'ALL'>('ALL');
   const [selected, setSelected] = useState<string>();
   const [dialog, setDialog] = useState<'folder' | 'document' | 'sharepoint'>();
   const [open, setOpen] = useState<LiveDocument>();
   const [preview, setPreview] = useState<{ kind: 'document' | 'file'; id: string }>();
   const [busy, setBusy] = useState(false);
   const upload = useRef<HTMLInputElement>(null);

   const reload = useCallback(async () => {
      try {
         setTree(await loadProjectTree(projectId));
         setError(undefined);
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : tx('Could not load documents.'));
      }
   }, [projectId, tx]);

   useEffect(() => {
      void reload();
   }, [reload]);

   const [publishing, setPublishing] = useState(false);
   const loadPublishing = useCallback(() => {
      void loadProjectSharepoint(projectId)
         .then((value) => setPublishing(Boolean(value.folderUrl && value.connectionEnabled)))
         .catch(() => setPublishing(false));
   }, [projectId]);
   useEffect(loadPublishing, [loadPublishing]);

   const { roots, unfiled } = useMemo(
      () => buildTree(tree?.folders ?? [], tree?.documents ?? [], tree?.files ?? []),
      [tree]
   );
   const visible = useMemo(() => filterTree(roots, query, docType), [roots, query, docType]);
   const root = roots.find((node) => node.folder.kind === 'project') ?? roots[0];
   const target = selected ?? root?.folder.id;

   async function act(operation: () => Promise<unknown>, success: string) {
      setBusy(true);
      try {
         await operation();
         await reload();
         toast.success(success);
         return true;
      } catch (reason) {
         toast.error(reason instanceof Error ? reason.message : tx('Could not save.'));
         return false;
      } finally {
         setBusy(false);
      }
   }

   if (error) return <QueryState message={error} onRetry={() => void reload()} />;
   if (!tree) return <LoadingState label={tx('Loading documents…')} />;

   // Preview targets are looked up by id so a reload after editing shows fresh content.
   // VI: Đối tượng xem trước được tra theo id để sau khi sửa và tải lại thì nội dung mới.
   const previewDocument =
      preview?.kind === 'document'
         ? tree.documents.find((document) => document.id === preview.id)
         : undefined;
   const previewFile =
      preview?.kind === 'file' ? tree.files.find((file) => file.id === preview.id) : undefined;

   const documentItem = (document: ProjectTreeDocument): TreeListItemData => ({
      id: document.id,
      label: document.title,
      startContent: document.icon,
      isSelected: previewDocument?.id === document.id,
      endContent: (
         <HStack gap={2} vAlign="center">
            <DocTypeBadge type={document.docType} />
            <DocStatusBadge status={document.status} />
            {document.publication?.webUrl && document.publication.version === document.version && (
               <CloudUpload
                  className="size-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-label={tx('Published to SharePoint')}
               />
            )}
            <Text type="supporting" size="sm">
               {relativeTime(document.updatedAt, Date.now(), locale)}
            </Text>
         </HStack>
      ),
      onClick: () => {
         setPreview({ kind: 'document', id: document.id });
         if (document.folderId && !document.linked) setSelected(document.folderId);
      },
   });
   const fileItem = (file: TreeFile): TreeListItemData => ({
      id: file.id,
      label: file.filename,
      startContent: <FileText className="size-4 text-red-600 dark:text-red-400" />,
      isSelected: previewFile?.id === file.id,
      onClick: () => {
         setPreview({ kind: 'file', id: file.id });
         setSelected(file.folderId);
      },
   });
   const folderItem = (node: TreeNode<ProjectTreeDocument>): TreeListItemData => {
      const kind = FOLDER_KINDS.find((option) => option.value === node.folder.kind);
      return {
         id: node.folder.id,
         label: node.folder.name,
         startContent: node.folder.icon,
         endContent:
            node.folder.kind === 'project' ? undefined : kind ? (
               <Text type="supporting" size="sm">
                  {tx(kind.label)}
               </Text>
            ) : undefined,
         isExpanded: true,
         isSelected: target === node.folder.id,
         onClick: () => setSelected(node.folder.id),
         children: [
            ...node.children.map(folderItem),
            ...node.documents.map(documentItem),
            ...node.files.map(fileItem),
         ],
      };
   };

   return (
      <div className="flex h-full flex-col overflow-hidden">
         <div className="flex flex-wrap items-center gap-2 border-b px-6 py-1.5">
            <div className="relative">
               <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
               <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tx('Search documents…')}
                  aria-label={tx('Search documents…')}
                  className="h-7 w-56 pl-7 text-xs"
               />
            </div>
            <Select value={docType} onValueChange={(value) => setDocType(value as DocType | 'ALL')}>
               <SelectTrigger className="h-7 w-36 text-xs" aria-label={tx('Document type')}>
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  <SelectItem value="ALL">{tx('All types')}</SelectItem>
                  {DOC_TYPES.map((type) => (
                     <SelectItem key={type} value={type}>
                        {type}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            <span className="ml-auto" />
            <Button
               size="xs"
               variant="ghost"
               disabled={busy}
               onClick={() =>
                  void act(() => scaffoldProjectTree(projectId), tx('Standard structure is ready.'))
               }
            >
               <LayoutTemplate className="size-4" />
               {tx('Standard structure')}
            </Button>
            <Button
               size="xs"
               variant="ghost"
               disabled={busy || !target}
               onClick={() => setDialog('folder')}
            >
               <FolderPlus className="size-4" />
               {tx('New folder')}
            </Button>
            <Button
               size="xs"
               variant="secondary"
               disabled={busy || !target}
               onClick={() => setDialog('document')}
            >
               <FilePlus2 className="size-4" />
               {tx('New document')}
            </Button>
            <Button
               size="xs"
               variant="ghost"
               disabled={busy || !target}
               onClick={() => upload.current?.click()}
            >
               <FileUp className="size-4" />
               {tx('Upload PDF')}
            </Button>
            <input
               ref={upload}
               type="file"
               accept="application/pdf,.pdf"
               hidden
               onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file && target)
                     void act(() => uploadFolderFile(target, file), tx('File uploaded.'));
               }}
            />
            <Button size="xs" variant="ghost" onClick={() => setDialog('sharepoint')}>
               <FolderUp className="size-4" />
               {tx('SharePoint')}
            </Button>
         </div>
         <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)] lg:grid-rows-1">
            <div className="min-h-0 overflow-auto border-b px-3 py-3 lg:border-r lg:border-b-0">
               {roots.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-24 text-center text-sm text-muted-foreground">
                     <p>{tx('This project has no document tree yet.')}</p>
                     <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                           void act(
                              () => scaffoldProjectTree(projectId),
                              tx('Standard structure is ready.')
                           )
                        }
                     >
                        <LayoutTemplate className="size-4" />
                        {tx('Create standard structure')}
                     </Button>
                  </div>
               ) : (
                  <>
                     {/* Remounting on a new filter re-expands every branch of the matches. */}
                     <TreeList
                        key={`${query}|${docType}`}
                        aria-label={tx('Project documents')}
                        density="compact"
                        items={visible.map(folderItem)}
                     />
                     {visible.length === 0 && (
                        <Text type="supporting">{tx('No documents match.')}</Text>
                     )}
                  </>
               )}
               {unfiled.length > 0 && (
                  <section className="mt-6">
                     <h2 className="mb-1 text-xs font-medium text-muted-foreground uppercase">
                        {tx('Linked to this project')}
                     </h2>
                     <TreeList density="compact" items={unfiled.map(documentItem)} />
                  </section>
               )}
            </div>
            <div className="min-h-0 overflow-hidden">
               {previewDocument ? (
                  <DocumentPreview
                     document={previewDocument}
                     publishing={publishing}
                     onEdit={() => setOpen(previewDocument)}
                     onStatusChange={(status) =>
                        void act(
                           () => updateTreeDocument(previewDocument.id, { status }),
                           tx('Status updated.')
                        )
                     }
                     onConfigureSharepoint={() => setDialog('sharepoint')}
                  />
               ) : previewFile ? (
                  <PdfPreview file={previewFile} />
               ) : (
                  <EmptyPreview />
               )}
            </div>
         </div>
         {dialog === 'sharepoint' && (
            <ProjectSharepointDialog
               projectId={projectId}
               onClose={() => {
                  setDialog(undefined);
                  loadPublishing();
               }}
            />
         )}
         {dialog === 'folder' && target && (
            <NewFolderDialog
               busy={busy}
               onClose={() => setDialog(undefined)}
               onCreate={async (name, kind) => {
                  if (
                     await act(
                        () => createDocumentFolder({ parentId: target, name, kind }),
                        tx('Folder created.')
                     )
                  )
                     setDialog(undefined);
               }}
            />
         )}
         {dialog === 'document' && target && (
            <NewDocumentDialog
               busy={busy}
               onClose={() => setDialog(undefined)}
               onCreate={async (type, name) => {
                  let created: LiveDocument | undefined;
                  const ok = await act(async () => {
                     created = await createTreeDocument({
                        teamId: tree.teamId,
                        folderId: target,
                        title: documentTitle(type, name),
                        content: documentTemplate(type, name.trim()),
                        docType: type,
                     });
                  }, tx('Document created.'));
                  if (ok && created) {
                     setDialog(undefined);
                     setPreview({ kind: 'document', id: created.id });
                     setOpen(created);
                  }
               }}
            />
         )}
         {open && (
            <MarkdownDocumentEditor
               document={open}
               open
               onOpenChange={(next) => {
                  if (!next) {
                     setOpen(undefined);
                     void reload();
                  }
               }}
               onUpdate={async (id, draft) => {
                  const updated = await updateTreeDocument(id, draft);
                  setOpen(updated);
                  return updated;
               }}
               onMetadataChange={async (id, metadata) => {
                  const updated = await updateTreeDocument(id, metadata);
                  setOpen(updated);
               }}
            />
         )}
      </div>
   );
}

function NewFolderDialog({
   busy,
   onClose,
   onCreate,
}: {
   busy: boolean;
   onClose: () => void;
   onCreate: (name: string, kind: FolderKind) => Promise<void>;
}) {
   const tx = useMessages(messages);
   const [name, setName] = useState('');
   const [kind, setKind] = useState<FolderKind>('module');
   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{tx('New folder')}</DialogTitle>
            </DialogHeader>
            <form
               className="grid gap-3"
               onSubmit={(event) => {
                  event.preventDefault();
                  void onCreate(name, kind);
               }}
            >
               <Input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={tx('Folder name')}
                  aria-label={tx('Folder name')}
               />
               <Select value={kind} onValueChange={(value) => setKind(value as FolderKind)}>
                  <SelectTrigger aria-label={tx('Folder type')}>
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     {FOLDER_KINDS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                           {tx(option.label)}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
               <DialogFooter>
                  <Button type="button" variant="ghost" onClick={onClose}>
                     {tx('Cancel')}
                  </Button>
                  <Button type="submit" disabled={busy || name.trim().length < 2}>
                     {tx('Create')}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}

function NewDocumentDialog({
   busy,
   onClose,
   onCreate,
}: {
   busy: boolean;
   onClose: () => void;
   onCreate: (type: DocType, name: string) => Promise<void>;
}) {
   const tx = useMessages(messages);
   const [name, setName] = useState('');
   const [type, setType] = useState<DocType>('FDS');
   const feature = type === 'FDS' || type === 'TDS';
   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{tx('New document')}</DialogTitle>
            </DialogHeader>
            <form
               className="grid gap-3"
               onSubmit={(event) => {
                  event.preventDefault();
                  void onCreate(type, name);
               }}
            >
               <Select value={type} onValueChange={(value) => setType(value as DocType)}>
                  <SelectTrigger aria-label={tx('Document type')}>
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     {DOC_TYPES.map((option) => (
                        <SelectItem key={option} value={option}>
                           {option}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
               <Input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={feature ? tx('Feature name') : tx('Document title')}
                  aria-label={feature ? tx('Feature name') : tx('Document title')}
               />
               {feature && (
                  <p className="text-xs text-muted-foreground">
                     {tx('Starts from the {value0} template.', { value0: type })}
                  </p>
               )}
               <DialogFooter>
                  <Button type="button" variant="ghost" onClick={onClose}>
                     {tx('Cancel')}
                  </Button>
                  <Button type="submit" disabled={busy || name.trim().length < 2}>
                     {tx('Create')}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}
