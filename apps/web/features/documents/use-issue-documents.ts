'use client';

import { useEffect, useState } from 'react';
import type { LiveDocument } from '@/components/common/teams/use-live-team';
import { linkIssueDocument, loadIssueDocuments, unlinkIssueDocument } from './project-docs-api';

/**
 * Documents linked to an issue, shared by the Overview list and the Attachments tab so a link
 * made in one shows in the other. `documents` is undefined while loading or after a load error;
 * `link` and `unlink` replace it with the list the server returns and rethrow on failure so the
 * caller can show the error.
 * VI: Tài liệu liên kết với issue, dùng chung cho danh sách ở Overview và tab Attachments để
 * VI: liên kết tạo ở nơi này hiện ngay ở nơi kia. `documents` là undefined khi đang tải hoặc tải
 * VI: lỗi; `link` và `unlink` thay bằng danh sách server trả về và ném lại lỗi để nơi gọi hiển thị.
 */
export function useIssueDocuments(issueId: string) {
   const [documents, setDocuments] = useState<LiveDocument[]>();

   useEffect(() => {
      let current = true;
      setDocuments(undefined);
      void loadIssueDocuments(issueId)
         .then((items) => {
            if (current) setDocuments(items);
         })
         .catch(() => undefined);
      return () => {
         current = false;
      };
   }, [issueId]);

   return {
      documents,
      link: async (documentId: string) =>
         setDocuments(await linkIssueDocument(documentId, issueId)),
      unlink: async (documentId: string) =>
         setDocuments(await unlinkIssueDocument(documentId, issueId)),
   };
}

export type IssueDocumentsState = ReturnType<typeof useIssueDocuments>;
