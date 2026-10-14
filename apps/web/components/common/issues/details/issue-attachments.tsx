'use client';

import { useRef } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useIssuesStore } from '@/store/issues-store';
import { useIssueAttachments } from '@/features/issues/use-issue-attachments';

export function IssueAttachments({ issueId }: { issueId: string }) {
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const state = useIssueAttachments(workspaceId, issueId);
   const picker = useRef<HTMLInputElement>(null);
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   return (
      <VStack gap={2}>
         <input
            ref={picker}
            type="file"
            multiple
            hidden
            aria-label="Select files to attach"
            onChange={(event) => {
               void state.upload(event.target.files);
               event.target.value = '';
            }}
         />
         <Button
            label="Attach file"
            size="sm"
            variant="ghost"
            onClick={() => picker.current?.click()}
            isDisabled={!workspaceId}
            isLoading={state.uploading}
         />
         {state.error && <Text role="alert">{state.error}</Text>}
         {state.attachments.length > 0 && <Heading level={2}>Attachments</Heading>}
         {state.attachments.map((attachment) => (
            <a
               key={attachment.id}
               href={`${api}/attachments/${encodeURIComponent(attachment.id)}/download`}
               target="_blank"
               rel="noreferrer"
            >
               {attachment.filename}
            </a>
         ))}
      </VStack>
   );
}
