'use client';

import { useRef } from 'react';
import { FileText, Paperclip } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { useLocale } from '@/features/shared/use-locale';
import type { useIssueAttachments } from '@/features/issues/use-issue-attachments';

/**
 * Attachments tab of an issue: the file list and the attach button. The state comes from the
 * parent so the tab label can show the file count while this tab is closed.
 * VI: Tab tệp đính kèm của công việc: danh sách tệp và nút đính kèm. State do component cha giữ
 * VI: để nhãn tab hiện được số tệp cả khi tab này đang đóng.
 */
export function IssueAttachments({
   workspaceId,
   state,
}: {
   workspaceId?: string;
   state: ReturnType<typeof useIssueAttachments>;
}) {
   const { t } = useLocale();
   const picker = useRef<HTMLInputElement>(null);
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   return (
      <VStack gap={3} align="start">
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
            label={t('attachFile')}
            icon={<Paperclip className="size-4" />}
            size="sm"
            variant="secondary"
            onClick={() => picker.current?.click()}
            isDisabled={!workspaceId}
            isLoading={state.uploading}
         />
         {state.error && <Text role="alert">{state.error}</Text>}
         {state.attachments.length === 0 && !state.error && (
            <Text type="supporting">{t('noAttachments')}</Text>
         )}
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
      </VStack>
   );
}
