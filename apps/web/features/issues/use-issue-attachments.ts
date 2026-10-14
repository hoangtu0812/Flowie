'use client';

import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { uploadAttachment, type Attachment } from '@/lib/attachments';

export function useIssueAttachments(workspaceId: string | undefined, issueId: string) {
   const [attachments, setAttachments] = useState<Attachment[]>([]);
   const [uploading, setUploading] = useState(false);
   const [error, setError] = useState<string>();
   const load = useCallback(async () => {
      if (!workspaceId) return;
      const query = new URLSearchParams({ workspaceId, entityType: 'issue', entityId: issueId });
      const response = await authenticatedFetch(
         `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/attachments?${query}`
      );
      setAttachments(await responseData<Attachment[]>(response, 'Could not load attachments.'));
   }, [issueId, workspaceId]);
   useEffect(() => {
      setAttachments([]);
      setError(undefined);
      void load().catch((caught: unknown) =>
         setError(caught instanceof Error ? caught.message : 'Could not load attachments.')
      );
   }, [load]);
   const upload = async (files: FileList | null) => {
      if (!files || !workspaceId || uploading) return;
      setUploading(true);
      setError(undefined);
      try {
         for (const file of Array.from(files))
            await uploadAttachment(workspaceId, 'issue', issueId, file);
         await load();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not upload file.');
      } finally {
         setUploading(false);
      }
   };
   return { attachments, uploading, error, upload, retry: load };
}
