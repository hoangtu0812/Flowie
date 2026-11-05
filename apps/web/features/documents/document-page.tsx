'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MarkdownDocumentEditor } from '@/components/common/teams/markdown-document-editor';
import type { LiveDocument } from '@/components/common/teams/use-live-team';
import { getDocument, documentRequest } from './document-api';
import { updateTreeDocument, type ProjectTreeDocument } from './project-docs-api';
import { DocumentPreview } from './doc-preview';
import { QueryState } from '@/components/common/query-state';
import { LoadingState } from '@/components/common/loading-state';
import { usePageEntity } from '@/features/shared/document-title';

/**
 * Full view of one document, opened from a task, search, a link or the Approvals page. It shows
 * the same preview as the Docs tab (type, status, approved version, SharePoint state, review
 * buttons, earlier releases), so a reviewer can approve without going to Docs. Edit opens the
 * editor straight in edit mode; closing the editor reloads the document to show its new status.
 * `onChanged` runs after anything that may have changed the document's review state.
 * VI: Khung xem đầy đủ một tài liệu, mở từ task, tìm kiếm, link hoặc trang Phê duyệt. Hiển thị cùng
 * VI: khung xem trước như tab Docs (loại, trạng thái, phiên bản đã duyệt, SharePoint, nút duyệt,
 * VI: phiên bản cũ) để người duyệt duyệt được mà không phải vào Docs. Nút Sửa mở editor ở thẳng chế
 * VI: độ sửa; đóng editor thì tải lại tài liệu để hiện trạng thái mới. `onChanged` chạy sau mọi thao
 * VI: tác có thể làm đổi trạng thái duyệt của tài liệu.
 */
export function DocumentView({
   documentId,
   onClose,
   onChanged,
}: {
   documentId: string;
   onClose: () => void;
   onChanged?: () => void;
}) {
   const tx = useMessages(messages);

   const { orgId } = useParams<{ orgId: string }>();
   const [document, setDocument] = useState<ProjectTreeDocument>(),
      [error, setError] = useState<string>(),
      [editing, setEditing] = useState(false);
   usePageEntity(document?.title);
   const load = useCallback(
      () =>
         getDocument(documentId)
            .then((item) => {
               setDocument(item as ProjectTreeDocument);
               setError(undefined);
            })
            .catch((reason) => setError(reason.message)),
      [documentId]
   );
   useEffect(() => {
      setDocument(undefined);
      void load();
   }, [load, orgId]);
   const reload = () => {
      void load();
      onChanged?.();
   };
   if (error) return <QueryState message={error} onRetry={() => void load()} />;
   if (!document) return <LoadingState label={tx('Loading document…')} />;
   return (
      <>
         <DocumentPreview
            document={document}
            // Only projects that publish to SharePoint have publication rows.
            // VI: Chỉ dự án có phát hành SharePoint mới có dòng publication.
            publishing={Boolean(document.publication)}
            onEdit={() => setEditing(true)}
            onReviewChanged={reload}
            onStatusChange={(status) =>
               // expectedVersion makes Approve fail if the document changed after it was shown;
               // a refused change reloads the document to show the newer text.
               // VI: expectedVersion làm thao tác Duyệt thất bại nếu tài liệu đã đổi sau khi hiển
               // VI: thị; thay đổi bị từ chối sẽ tải lại tài liệu để hiện nội dung mới hơn.
               void updateTreeDocument(document.id, { status, expectedVersion: document.version })
                  .then(() => toast.success(tx('Status updated.')))
                  .catch((reason) =>
                     toast.error(reason instanceof Error ? reason.message : tx('Could not save.'))
                  )
                  .finally(reload)
            }
            onClose={onClose}
         />
         {editing && (
            <MarkdownDocumentEditor
               document={document}
               open
               initialMode="edit"
               onOpenChange={(open) => {
                  if (open) return;
                  setEditing(false);
                  reload();
               }}
               onUpdate={async (id, draft) => {
                  const updated = await documentRequest<LiveDocument>(id, '', {
                     method: 'PATCH',
                     headers: { 'content-type': 'application/json' },
                     body: JSON.stringify(draft),
                  });
                  // PATCH returns no publication; keep the one already loaded.
                  // VI: PATCH không trả publication; giữ giá trị đã tải.
                  setDocument((current) => ({ ...current, ...updated }) as ProjectTreeDocument);
                  return updated;
               }}
            />
         )}
      </>
   );
}

/** Route page of one document. VI: Trang route của một tài liệu. */
export function DocumentPage() {
   const { documentId, orgId } = useParams<{ documentId: string; orgId: string }>();
   const router = useRouter();
   return (
      <DocumentView
         documentId={documentId}
         onClose={() => {
            // Closing returns to the page that opened the document (search, a task, Docs). A
            // document opened in a fresh tab has nothing behind it, so it falls back to Docs.
            // shortcut: a tab that visited another site first goes back to that site; track
            // in-app navigation if that becomes a complaint.
            // VI: Đóng thì quay về trang đã mở tài liệu (tìm kiếm, task, Docs). Tài liệu mở ở
            // VI: tab mới không có trang trước, nên chuyển về Docs.
            // VI: shortcut: tab đã vào site khác trước đó sẽ quay về site đó; nếu bị phàn nàn
            // VI: thì theo dõi điều hướng trong app.
            if (window.history.length > 1) router.back();
            else router.push(`/${orgId}/docs`);
         }}
      />
   );
}
