'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Link2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';
import { fold } from '@/lib/document-tree';
import { DocStatusBadge, DocTypeBadge } from './document-badges';
import { loadProjectTree, type ProjectTreeDocument } from './project-docs-api';
import type { IssueDocumentsState } from './use-issue-documents';

const failure = (caught: unknown, fallback: string) =>
   caught instanceof Error && caught.message ? caught.message : fallback;

/**
 * Linked documents in the issue's Attachments tab: Link document picks a document from the
 * project's Docs tree, and each linked document opens its page or can be unlinked. Linking is
 * many-to-many, so a document already linked elsewhere can still be picked. Only a task in a
 * project can pick, since the list comes from that project's tree. Server errors (no access,
 * another team's document) are shown in place.
 * VI: Tài liệu liên kết trong tab Attachments của issue: Link document chọn một tài liệu trong
 * VI: cây Docs của dự án, mỗi tài liệu đã liên kết mở được trang của nó hoặc gỡ liên kết. Liên
 * VI: kết là nhiều-nhiều, nên tài liệu đã liên kết với task khác vẫn chọn được. Chỉ task thuộc
 * VI: dự án mới chọn được, vì danh sách lấy từ cây của dự án đó. Lỗi từ server (không có quyền,
 * VI: tài liệu của team khác) hiển thị tại chỗ.
 */
export function IssueDocumentLinks({
   state,
   projectId,
}: {
   state: IssueDocumentsState;
   projectId?: string;
}) {
   const tx = useMessages(messages);
   const { orgId } = useParams<{ orgId: string }>();
   const [picking, setPicking] = useState(false);
   const [error, setError] = useState<string>();
   const documents = state.documents ?? [];

   const unlink = async (documentId: string) => {
      setError(undefined);
      try {
         await state.unlink(documentId);
      } catch (caught) {
         setError(failure(caught, tx('Could not unlink the document.')));
      }
   };

   return (
      <section aria-label={tx('Linked documents')} className="space-y-2">
         <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">{tx('Linked documents')}</h2>
            <Button
               size="xs"
               variant="secondary"
               disabled={!projectId}
               title={
                  projectId ? undefined : tx('Only a task in a project can link Docs documents.')
               }
               onClick={() => setPicking(true)}
            >
               <Link2 className="size-3.5" />
               {tx('Link document')}
            </Button>
         </div>
         {error && (
            <p role="alert" className="text-sm text-destructive">
               {error}
            </p>
         )}
         {state.documents && documents.length === 0 && (
            <p className="text-sm text-muted-foreground">{tx('No linked documents yet.')}</p>
         )}
         <ul className="space-y-0.5">
            {documents.map((document) => (
               <li key={document.id} className="flex items-center gap-1">
                  <Link
                     href={`/${orgId}/documents/${document.id}`}
                     className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60"
                  >
                     <span aria-hidden="true">{document.icon}</span>
                     <span className="min-w-0 flex-1 truncate">{document.title}</span>
                     <DocTypeBadge type={document.docType} />
                     <DocStatusBadge status={document.status} />
                  </Link>
                  <Button
                     size="xs"
                     variant="ghost"
                     aria-label={tx('Unlink {value0}', { value0: document.title })}
                     title={tx('Unlink')}
                     onClick={() => void unlink(document.id)}
                  >
                     <X className="size-3.5" />
                  </Button>
               </li>
            ))}
         </ul>
         {projectId && (
            <DocumentSearchDialog
               open={picking}
               onOpenChange={setPicking}
               projectId={projectId}
               excludeIds={documents.map((document) => document.id)}
               onPick={state.link}
            />
         )}
      </section>
   );
}

/**
 * Picks a Markdown document of the project's Docs tree by title (ignoring case and Vietnamese
 * accents), leaving out documents already linked to this issue. The tree is loaded each time
 * the dialog opens so new documents appear without reloading the page.
 * VI: Chọn một tài liệu Markdown trong cây Docs của dự án theo tiêu đề (không phân biệt hoa
 * VI: thường và dấu tiếng Việt), bỏ các tài liệu đã liên kết với issue này. Cây được tải lại mỗi
 * VI: lần mở hộp thoại để tài liệu mới xuất hiện mà không cần tải lại trang.
 */
function DocumentSearchDialog({
   open,
   onOpenChange,
   projectId,
   excludeIds,
   onPick,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   projectId: string;
   excludeIds: string[];
   onPick: (documentId: string) => Promise<void>;
}) {
   const tx = useMessages(messages);
   const [query, setQuery] = useState('');
   const [documents, setDocuments] = useState<ProjectTreeDocument[]>();
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   useEffect(() => {
      if (!open) return;
      let current = true;
      setDocuments(undefined);
      void loadProjectTree(projectId)
         .then((tree) => current && setDocuments(tree.documents))
         .catch((caught) => current && setError(failure(caught, tx('Could not load Docs.'))));
      return () => {
         current = false;
      };
   }, [open, projectId, tx]);

   const close = (next: boolean) => {
      onOpenChange(next);
      if (!next) {
         setQuery('');
         setError(undefined);
      }
   };

   const pick = async (documentId: string) => {
      setSaving(true);
      setError(undefined);
      try {
         await onPick(documentId);
         close(false);
      } catch (caught) {
         setError(failure(caught, tx('Could not link the document.')));
      } finally {
         setSaving(false);
      }
   };

   const needle = fold(query.trim());
   const visible = (documents ?? [])
      .filter((document) => !excludeIds.includes(document.id))
      .filter((document) => !needle || fold(document.title).includes(needle))
      .sort((a, b) => a.title.localeCompare(b.title));

   return (
      <Dialog open={open} onOpenChange={close}>
         <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
               <DialogTitle>{tx('Link document')}</DialogTitle>
               <DialogDescription>
                  {tx('Pick a document from this project’s Docs to link to the task.')}
               </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
               <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tx('Search by title')}
                  aria-label={tx('Search documents')}
                  autoFocus
               />
               <div className="flex max-h-72 flex-col overflow-y-auto" role="list">
                  {documents && visible.length === 0 && (
                     <p className="px-1 py-3 text-sm text-muted-foreground">
                        {tx('No documents found.')}
                     </p>
                  )}
                  {/* Rows keep their height (shrink-0) so a long list scrolls instead of squeezing them.
                      VI: Dòng giữ nguyên chiều cao (shrink-0) để danh sách dài cuộn thay vì bị ép lại. */}
                  {visible.map((document) => (
                     <button
                        key={document.id}
                        type="button"
                        role="listitem"
                        disabled={saving}
                        onClick={() => void pick(document.id)}
                        className="flex h-9 min-w-0 shrink-0 items-center gap-2 rounded-md px-1 text-left text-sm hover:bg-sidebar/60"
                     >
                        <span aria-hidden="true">{document.icon}</span>
                        <span className="min-w-0 flex-1 truncate">{document.title}</span>
                        <DocTypeBadge type={document.docType} />
                        <DocStatusBadge status={document.status} />
                     </button>
                  ))}
               </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
         </DialogContent>
      </Dialog>
   );
}
