'use client';

import { useState, type ReactNode } from 'react';
import {
   ContextMenu,
   ContextMenuTrigger,
   ContextMenuContent,
   ContextMenuItem,
} from '@/components/ui/context-menu';
import {
   DropdownMenu,
   DropdownMenuTrigger,
   DropdownMenuContent,
   DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Icon } from '@astryxdesign/core/Icon';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { ArrowRightLeft, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useMessages } from '@/features/shared/use-messages';
import {
   folderDestinations,
   folderLabel,
   type TreeFile,
   type TreeFolder,
} from '@/lib/document-tree';
import { messages } from './messages.vi';
import {
   archiveTreeDocument,
   deleteDocumentFolder,
   deleteFolderFile,
   moveFolderFile,
   updateDocumentFolder,
   updateTreeDocument,
   type ProjectTree,
   type ProjectTreeDocument,
} from './project-docs-api';

export type TreeTarget =
   | { kind: 'folder'; value: TreeFolder }
   | { kind: 'document'; value: ProjectTreeDocument }
   | { kind: 'file'; value: TreeFile };
export type TreeAction = 'move' | 'delete' | 'edit';
export const targetName = (target: TreeTarget) =>
   target.kind === 'folder'
      ? folderLabel(target.value)
      : target.kind === 'file'
        ? target.value.filename
        : target.value.title;
export const sourceFolder = (target: TreeTarget) =>
   target.kind === 'folder' ? target.value.parentId : target.value.folderId;

export async function mutateTreeItem(
   target: TreeTarget,
   destination?: string,
   number?: number | null
) {
   if (target.kind === 'folder') {
      return destination
         ? updateDocumentFolder(target.value.id, {
              parentId: destination,
              expectedParentId: target.value.parentId,
              ...(number !== undefined ? { number } : {}),
           })
         : deleteDocumentFolder(target.value.id, target.value.parentId);
   }
   if (target.kind === 'file') {
      return destination
         ? moveFolderFile(target.value.id, target.value.folderId, destination)
         : deleteFolderFile(target.value.id, target.value.folderId);
   }
   return destination
      ? updateTreeDocument(target.value.id, {
           folderId: destination,
           expectedVersion: target.value.version,
        })
      : archiveTreeDocument(target.value.id, target.value.version);
}

function useActionItems(
   target: TreeTarget | undefined,
   busy: boolean,
   onAction: (action: TreeAction, target: TreeTarget) => void
) {
   const tx = useMessages(messages);
   const item = (action: TreeAction, label: string, icon: ReactNode) => ({
      label,
      icon,
      isDisabled: busy || !target,
      onClick: () => {
         if (target && !busy) onAction(action, target);
      },
   });
   return [
      ...(target?.kind === 'folder'
         ? [item('edit', tx('Edit folder'), <Icon icon={Pencil} />)]
         : []),
      item('move', tx('Move…'), <Icon icon={ArrowRightLeft} />),
      { ...item('delete', tx('Delete…'), <Icon icon={Trash2} />), variant: 'destructive' as const },
   ];
}

export function TreeItemMenu({
   target,
   busy,
   onAction,
}: {
   target: TreeTarget;
   busy: boolean;
   onAction: (action: TreeAction, target: TreeTarget) => void;
}) {
   const tx = useMessages(messages);
   const items = useActionItems(target, busy, onAction);
   return (
      <DropdownMenu modal={false}>
         <DropdownMenuTrigger asChild>
            <Button
               variant="ghost"
               size="icon"
               className="size-6"
               disabled={busy}
               aria-label={tx('Actions for {value0}', { value0: targetName(target) })}
            >
               <MoreHorizontal className="size-4" />
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            {items.map((item) => (
               <DropdownMenuItem
                  key={item.label}
                  disabled={item.isDisabled}
                  variant={'variant' in item ? item.variant : 'default'}
                  onSelect={() => item.onClick()}
               >
                  {item.icon}
                  {item.label}
               </DropdownMenuItem>
            ))}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

/** Resolve the nearest row, including whitespace and chevrons, before opening its menu.
 * Capturing the target avoids acting on an earlier selection or an ancestor folder.
 * VI: Xác định hàng gần nhất, kể cả khoảng trống/nút mở, trước khi mở menu của nó.
 * VI: Bắt đối tượng trước giúp tránh thao tác lên mục đã chọn trước đó hoặc thư mục tổ tiên. */
export function DocsContextMenu({
   tree,
   busy,
   onAction,
   children,
}: {
   tree: ProjectTree;
   busy: boolean;
   onAction: (action: TreeAction, target: TreeTarget) => void;
   children: ReactNode;
}) {
   const tx = useMessages(messages);
   const [target, setTarget] = useState<TreeTarget>();
   const items = useActionItems(target, busy, onAction);
   const resolve = (element: EventTarget | null): TreeTarget | undefined => {
      const id =
         element instanceof Element
            ? element.closest('[data-tree-id]')?.getAttribute('data-tree-id')
            : null;
      const folder = tree.folders.find((item) => item.id === id && item.kind !== 'project');
      if (folder) return { kind: 'folder', value: folder };
      const document = tree.documents.find((item) => item.id === id && !item.linked);
      if (document) return { kind: 'document', value: document };
      const file = tree.files.find((item) => item.id === id);
      if (file) return { kind: 'file', value: file };
   };
   return (
      <ContextMenu modal={false}>
         <ContextMenuTrigger asChild disabled={busy}>
            <section
               onTouchStartCapture={(event) => {
                  const next = resolve(event.target);
                  if (!next || busy) {
                     event.stopPropagation();
                     return;
                  }
                  setTarget(next);
               }}
               onContextMenuCapture={(event) => {
                  const next = resolve(event.target);
                  if (!next || busy) {
                     event.stopPropagation();
                     return;
                  }
                  setTarget(next);
               }}
               onKeyDownCapture={(event) => {
                  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))
                     return;
                  if (!resolve(event.target) || busy) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const row = (event.target as HTMLElement).closest(
                     '[data-tree-id]'
                  ) as HTMLElement;
                  const rect = row.getBoundingClientRect();
                  row.dispatchEvent(
                     new MouseEvent('contextmenu', {
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.left,
                        clientY: rect.top,
                     })
                  );
               }}
            >
               {children}
            </section>
         </ContextMenuTrigger>
         <ContextMenuContent
            aria-label={tx('Document actions')}
            onClick={(event) => event.stopPropagation()}
         >
            {items.map((item) => (
               <ContextMenuItem
                  key={item.label}
                  disabled={item.isDisabled}
                  variant={'variant' in item ? item.variant : 'default'}
                  onSelect={() => item.onClick()}
               >
                  {item.icon}
                  {item.label}
               </ContextMenuItem>
            ))}
         </ContextMenuContent>
      </ContextMenu>
   );
}

export function TreeMutationDialog({
   target,
   action,
   tree,
   busy,
   onClose,
   onSubmit,
   initialDestination,
   notice,
}: {
   target: TreeTarget;
   action: 'move' | 'delete';
   tree: ProjectTree;
   busy: boolean;
   onClose: () => void;
   onSubmit: (destination?: string, number?: number | null) => Promise<void>;
   initialDestination?: string;
   notice?: string;
}) {
   const tx = useMessages(messages);
   const [destination, setDestination] = useState(initialDestination ?? '');
   const [search, setSearch] = useState('');
   const [number, setNumber] = useState(
      target.kind === 'folder' && target.value.number != null
         ? String(target.value.number).padStart(2, '0')
         : ''
   );
   const numberValid = /^\d{0,2}$/.test(number.trim());
   const folders = folderDestinations(
      tree.folders,
      target.kind === 'folder' ? target.value.id : undefined
   );
   const current = folderDestinations(tree.folders).find(
      (folder) => folder.id === sourceFolder(target)
   )?.path;
   const nonEmpty =
      target.kind === 'folder' &&
      (tree.folders.some((folder) => folder.parentId === target.value.id) ||
         tree.documents.some(
            (document) => !document.linked && document.folderId === target.value.id
         ) ||
         tree.files.some((file) => file.folderId === target.value.id));
   return (
      <Dialog
         open
         onOpenChange={(open) => {
            if (!open && !busy) onClose();
         }}
      >
         <DialogContent
            onEscapeKeyDown={(event) => {
               if (busy) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
               if (busy) event.preventDefault();
            }}
         >
            <DialogHeader>
               <DialogTitle>
                  {tx(action === 'move' ? 'Move {value0}' : 'Delete {value0}?', {
                     value0: targetName(target),
                  })}
               </DialogTitle>
               <DialogDescription>
                  {action === 'move'
                     ? tx('Choose a destination in this project.')
                     : tx(
                          target.kind === 'document'
                             ? 'The document will be archived. Its history and task links are retained.'
                             : target.kind === 'folder'
                               ? 'Only an empty folder can be deleted.'
                               : 'The PDF will be removed from Docs. SharePoint copies are kept.'
                       )}
               </DialogDescription>
            </DialogHeader>
            <VStack gap={3}>
               {notice && <Text role="alert">{notice}</Text>}
               {current && (
                  <Text type="supporting">
                     {tx('Current location: {value0}', { value0: current })}
                  </Text>
               )}
               {action === 'move' ? (
                  <>
                     <Input
                        aria-label={tx('Search folders')}
                        placeholder={tx('Search folders')}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        disabled={busy}
                     />
                     <label htmlFor="docs-destination">{tx('Destination folder')}</label>
                     <select
                        id="docs-destination"
                        className="w-full rounded-md border bg-surface p-2 text-sm text-primary"
                        value={destination}
                        disabled={busy}
                        onChange={(event) => setDestination(event.target.value)}
                     >
                        <option value="">{tx('Choose a folder')}</option>
                        {folders
                           .filter(
                              (folder) =>
                                 folder.id === destination ||
                                 folder.path
                                    .toLocaleLowerCase()
                                    .includes(search.toLocaleLowerCase())
                           )
                           .map((folder) => (
                              <option
                                 key={folder.id}
                                 value={folder.id}
                                 disabled={folder.id === sourceFolder(target)}
                              >
                                 {folder.path}
                              </option>
                           ))}
                     </select>
                     {target.kind === 'folder' && (
                        <>
                           <Input
                              aria-label={tx('Folder number')}
                              value={number}
                              onChange={(event) => setNumber(event.target.value)}
                              inputMode="numeric"
                              maxLength={2}
                              aria-invalid={!numberValid}
                              disabled={busy}
                           />
                           <Text type="supporting">{tx('Number (00–99), empty for none')}</Text>
                        </>
                     )}
                  </>
               ) : (
                  nonEmpty && (
                     <Text role="alert">
                        {tx('This folder is not empty. Move or delete its contents first.')}
                     </Text>
                  )
               )}
            </VStack>
            <DialogFooter>
               <Button variant="ghost" disabled={busy} onClick={onClose}>
                  {tx('Cancel')}
               </Button>
               <Button
                  variant={action === 'delete' ? 'destructive' : 'default'}
                  disabled={
                     busy ||
                     (action === 'move'
                        ? !destination || destination === sourceFolder(target) || !numberValid
                        : nonEmpty)
                  }
                  onClick={() =>
                     void onSubmit(
                        action === 'move' ? destination : undefined,
                        target.kind === 'folder'
                           ? number.trim()
                              ? Number(number)
                              : null
                           : undefined
                     )
                  }
               >
                  {tx(busy ? 'Saving…' : action === 'move' ? 'Move' : 'Delete')}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
