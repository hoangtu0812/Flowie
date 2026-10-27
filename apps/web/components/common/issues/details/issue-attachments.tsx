'use client';

import { useRef } from 'react';
import { FileText, Paperclip } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useIssuesStore } from '@/store/issues-store';
import { useIssueAttachments } from '@/features/issues/use-issue-attachments';

export function IssueAttachments({ issueId }: { issueId: string }) {
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const state = useIssueAttachments(workspaceId, issueId);
   const picker = useRef<HTMLInputElement>(null);
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   return (
      <>
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
            tooltip="Attach file"
            icon={<Paperclip className="size-4" />}
            isIconOnly
            size="sm"
            variant="ghost"
            onClick={() => picker.current?.click()}
            isDisabled={!workspaceId}
            isLoading={state.uploading}
         />
         {/* basis-full moves errors and the list below the reaction and attach controls. */}
         {/* VI: basis-full đẩy lỗi và danh sách tệp xuống dưới hàng nút reaction và đính kèm. */}
         {state.error && (
            <Text role="alert" className="basis-full">
               {state.error}
            </Text>
         )}
         {state.attachments.length > 0 && (
            <div className="flex basis-full flex-col gap-1.5">
               <Heading level={4} accessibilityLevel={2}>
                  Attachments
               </Heading>
               {state.attachments.map((attachment) => (
                  <a
                     key={attachment.id}
                     href={`${api}/attachments/${encodeURIComponent(attachment.id)}/download`}
                     target="_blank"
                     rel="noreferrer"
                     className="inline-flex items-center gap-1.5 text-sm hover:underline"
                  >
                     <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                     {attachment.filename}
                  </a>
               ))}
            </div>
         )}
      </>
   );
}
