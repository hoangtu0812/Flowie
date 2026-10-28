'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilePlus2, FolderPlus, LayoutTemplate, Search } from 'lucide-react';
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
   type TreeNode,
} from '@/lib/document-tree';
import { relativeTime } from '@/lib/time';
import {
   createDocumentFolder,
   createTreeDocument,
   loadProjectTree,
   scaffoldProjectTree,
   updateTreeDocument,
   type ProjectTree,
   type ProjectTreeDocument,
} from './project-docs-api';
import { DocStatusBadge, DocTypeBadge, DOC_TYPES } from './document-badges';

const FOLDER_KINDS: { value: FolderKind; label: keyof typeof messages }[] = [
   { value: 'module', label: 'Module' },
   { value: 'feature', label: 'Feature' },
   { value: 'changes', label: 'Bugs & changes' },
   { value: 'general', label: 'General folder' },
];

/**
 * Project "Docs" tab: the project's document tree (project → module → feature → bugs &
 * changes), filterable by document type and searchable by title and content, with folders
 * and FDS/TDS documents created in the selected folder. Documents open in the shared
 * Markdown editor.
 * VI: Tab "Docs" của dự án: cây tài liệu (dự án → module → tính năng → bugs & changes), lọc
 * VI: theo loại và tìm theo tiêu đề, nội dung; tạo thư mục và tài liệu FDS/TDS trong thư mục
 * VI: đang chọn. Tài liệu mở trong editor Markdown dùng chung.
 */
export function ProjectDocs({ projectId }: { projectId: string }) {
   const tx = useMessages(messages);
   const { locale } = useLocale();
   const [tree, setTree] = useState<ProjectTree>();
   const [error, setError] = useState<string>();
   const [query, setQuery] = useState('');
   const [docType, setDocType] = useState<DocType | 'ALL'>('ALL');
   const [selected, setSelected] = useState<string>();
   const [dialog, setDialog] = useState<'folder' | 'document'>();
   const [open, setOpen] = useState<LiveDocument>();
   const [busy, setBusy] = useState(false);

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

   const { roots, unfiled } = useMemo(
      () => buildTree(tree?.folders ?? [], tree?.documents ?? []),
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

   const documentItem = (document: ProjectTreeDocument): TreeListItemData => ({
      id: document.id,
      label: document.title,
      startContent: document.icon,
      endContent: (
         <HStack gap={2} vAlign="center">
            <DocTypeBadge type={document.docType} />
            <DocStatusBadge status={document.status} />
            <Text type="supporting" size="sm">
               {relativeTime(document.updatedAt, Date.now(), locale)}
            </Text>
         </HStack>
      ),
      onClick: () => setOpen(document),
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
         children: [...node.children.map(folderItem), ...node.documents.map(documentItem)],
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
         </div>
         <div className="flex-1 overflow-auto">
            <div className="mx-auto max-w-4xl px-6 py-4">
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
         </div>
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
                  if (ok) {
                     setDialog(undefined);
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
