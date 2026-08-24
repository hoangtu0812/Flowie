'use client';

import { useIssuesStore } from '@/store/issues-store';
import { Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityFeed } from './activity-feed';
import { ContentBlocks } from './content-blocks';
import { IssuePropertiesPanel } from './issue-properties-panel';
import { IssueReactions } from './issue-reactions';
import { IssueSubIssues } from './issue-sub-issues';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

type Attachment = {
   id: string;
   filename: string;
   mimeType: string;
   size: number;
   createdAt: string;
   uploadedBy: { id: string; name: string; avatarUrl: string | null };
};

const formatFileSize = (size: number) => {
   if (size < 1024) return `${size} B`;
   if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
   return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

/** Original issue-detail layout backed by the live Issues store and API data. */
export default function IssueDetails() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const { issues, isLoading, error, loadIssues, workspaceId } = useIssuesStore();
   const [attachments, setAttachments] = useState<Attachment[]>([]);
   const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
   const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
   const [attachmentError, setAttachmentError] = useState<string>();
   const attachmentInputRef = useRef<HTMLInputElement>(null);

   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);

   const issue = useMemo(
      () => issues.find((candidate) => candidate.identifier === issueId),
      [issues, issueId]
   );
   const issueEntityId = issue?.id;
   const descriptionBlocks = useMemo(
      () =>
         issue?.description
            ? issue.description
                 .split(/\n{2,}/)
                 .map((text) => ({ type: 'paragraph' as const, text }))
            : [],
      [issue?.description]
   );

   const loadAttachments = useCallback(async () => {
      if (!workspaceId || !issueEntityId) return;

      setIsLoadingAttachments(true);
      setAttachmentError(undefined);
      try {
         const query = new URLSearchParams({
            workspaceId,
            entityType: 'issue',
            entityId: issueEntityId,
         });
         const response = await fetch(`${api}/attachments?${query}`, { credentials: 'include' });
         if (!response.ok) throw new Error('Could not load issue attachments.');
         const payload = (await response.json()) as { data: Attachment[] };
         setAttachments(payload.data);
      } catch (caught) {
         setAttachments([]);
         setAttachmentError(
            caught instanceof Error ? caught.message : 'Could not load issue attachments.'
         );
      } finally {
         setIsLoadingAttachments(false);
      }
   }, [issueEntityId, workspaceId]);

   useEffect(() => {
      void loadAttachments();
   }, [loadAttachments]);

   const uploadAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (!workspaceId || !issueEntityId) {
         setAttachmentError('The issue is not ready for attachments yet.');
         return;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
         setAttachmentError('Files must be 10 MB or smaller.');
         return;
      }

      setIsUploadingAttachment(true);
      setAttachmentError(undefined);
      try {
         const form = new FormData();
         form.set('workspaceId', workspaceId);
         form.set('entityType', 'issue');
         form.set('entityId', issueEntityId);
         form.set('file', file);
         const response = await fetch(`${api}/attachments`, {
            method: 'POST',
            credentials: 'include',
            body: form,
         });
         if (!response.ok) {
            const body = (await response.json().catch(() => undefined)) as
               { message?: string | string[] } | undefined;
            const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
            throw new Error(message ?? 'Could not upload attachment.');
         }
         await loadAttachments();
      } catch (caught) {
         setAttachmentError(
            caught instanceof Error ? caught.message : 'Could not upload attachment.'
         );
      } finally {
         setIsUploadingAttachment(false);
      }
   };

   if (isLoading) {
      return (
         <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading issue…
         </div>
      );
   }

   if (!issue) {
      return (
         <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <p>{error ? 'Could not load this issue.' : `Issue ${issueId} not found.`}</p>
            <Link href={`/${orgId}/teams`} className="underline">
               Back to issues
            </Link>
         </div>
      );
   }

   return (
      <div className="w-full h-full flex overflow-hidden">
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10">
               <h1 className="text-3xl font-semibold leading-tight text-balance">{issue.title}</h1>

               <div className="mt-6">
                  {descriptionBlocks.length ? (
                     <ContentBlocks blocks={descriptionBlocks} />
                  ) : (
                     <p className="text-sm text-muted-foreground">No description provided.</p>
                  )}
               </div>

               <div className="flex items-center gap-3 mt-6 text-muted-foreground">
                  <IssueReactions issueId={issue.id} />
                  <button
                     type="button"
                     disabled={isUploadingAttachment}
                     title={isUploadingAttachment ? 'Uploading attachment…' : 'Add attachment'}
                     className="disabled:opacity-50 disabled:cursor-not-allowed"
                     aria-label={isUploadingAttachment ? 'Uploading attachment' : 'Add attachment'}
                     onClick={() => attachmentInputRef.current?.click()}
                  >
                     <Paperclip className="size-4" />
                  </button>
                  <input
                     ref={attachmentInputRef}
                     type="file"
                     className="sr-only"
                     onChange={uploadAttachment}
                     aria-label="Upload issue attachment"
                  />
               </div>

               {(isLoadingAttachments || attachmentError || attachments.length > 0) && (
                  <div className="mt-4 text-sm">
                     {isLoadingAttachments ? (
                        <p className="text-muted-foreground">Loading attachments…</p>
                     ) : attachmentError ? (
                        <p className="text-destructive">{attachmentError}</p>
                     ) : attachments.length ? (
                        <ul className="space-y-2">
                           {attachments.map((attachment) => (
                              <li className="flex items-center gap-3" key={attachment.id}>
                                 <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                                 <a
                                    className="min-w-0 truncate hover:underline"
                                    href={`${api}/attachments/${attachment.id}/download`}
                                 >
                                    {attachment.filename}
                                 </a>
                                 <span className="shrink-0 text-xs text-muted-foreground">
                                    {formatFileSize(attachment.size)}
                                 </span>
                              </li>
                           ))}
                        </ul>
                     ) : null}
                  </div>
               )}

               {issue.team && (
                  <IssueSubIssues issueId={issue.id} teamId={issue.team.id} orgId={orgId} />
               )}

               <div className="border-t border-border/60 mt-8" />

               <ActivityFeed issueId={issue.id} initialSubscribed={Boolean(issue.isSubscribed)} />
            </div>
         </div>

         <aside className="hidden lg:block w-80 shrink-0 border-l h-full overflow-y-auto bg-container px-5 py-6">
            <IssuePropertiesPanel issue={issue} orgId={orgId} />
         </aside>
      </div>
   );
}
