'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { uploadAttachment, type Attachment } from '@/lib/attachments';
import { SubmissionGate } from '@/features/shared/submission-gate';

export function useIssueAttachments(workspaceId: string | undefined, issueId: string) {
   const [attachments, setAttachments] = useState<Attachment[]>([]);
   const [uploading, setUploading] = useState(false);
   const [error, setError] = useState<string>();
   const scope = `${workspaceId}:${issueId}`;
   const scopeRef = useRef(scope);
   scopeRef.current = scope;
   const gate = useRef(new SubmissionGate());
   const load = useCallback(async () => {
      if (!workspaceId) return;
      const query = new URLSearchParams({ workspaceId, entityType: 'issue', entityId: issueId });
      const response = await authenticatedFetch(
         `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/attachments?${query}`
      );
      const items = await responseData<Attachment[]>(response, 'Could not load attachments.');
      if (scopeRef.current === scope) setAttachments(items);
   }, [issueId, workspaceId, scope]);
   useEffect(() => {
      setAttachments([]);
      setError(undefined);
      setUploading(false);
      gate.current = new SubmissionGate();
      void load().catch(
         (caught: unknown) =>
            scopeRef.current === scope &&
            setError(caught instanceof Error ? caught.message : 'Could not load attachments.')
      );
   }, [load, scope]);
   const upload = async (files: FileList | null) => {
      if (!files || !workspaceId) return;
      const selected = Array.from(files);
      await gate.current.run(async () => {
         setUploading(true);
         setError(undefined);
         try {
            for (const file of selected)
               await uploadAttachment(workspaceId, 'issue', issueId, file);
            await load();
         } catch (caught) {
            if (scopeRef.current === scope)
               setError(caught instanceof Error ? caught.message : 'Could not upload file.');
         } finally {
            if (scopeRef.current === scope) setUploading(false);
         }
      });
   };
   const retry = async () => {
      try {
         await load();
         if (scopeRef.current === scope) setError(undefined);
      } catch (caught) {
         if (scopeRef.current === scope)
            setError(caught instanceof Error ? caught.message : 'Could not load attachments.');
      }
   };
   return { attachments, uploading, error, upload, retry };
}
