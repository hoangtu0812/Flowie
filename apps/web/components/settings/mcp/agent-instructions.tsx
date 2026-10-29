'use client';

import { useEffect, useState } from 'react';
import { Check, RotateCcw, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Button } from '@astryxdesign/core/Button';
import {
   getMcpInstructions,
   MAX_MCP_WORKFLOW_LENGTH,
   saveMcpInstructions,
   type McpInstructions,
} from '@/lib/mcp';
import { SuccessMark } from './success-mark';

/**
 * Owner/Admin editor for the workflow AI clients receive at MCP initialize. The text is
 * edited and shown as plain text only; the fixed preamble is read-only and always sent first.
 * VI: Trình sửa (Owner/Admin) quy trình mà AI client nhận lúc MCP initialize. Văn bản chỉ
 * VI: được sửa và hiển thị dạng văn bản thuần; câu cố định chỉ đọc và luôn được gửi trước.
 */
export function AgentInstructions({ workspaceId }: { workspaceId: string }) {
   const [current, setCurrent] = useState<McpInstructions>();
   const [draft, setDraft] = useState('');
   const [busy, setBusy] = useState(false);
   const [confirmReset, setConfirmReset] = useState(false);
   /** Cleared before each save so the check mark remounts and replays its animation. */
   /** VI: Xoá trước mỗi lần lưu để dấu check mount lại và chạy lại hiệu ứng. */
   const [saved, setSaved] = useState(false);

   useEffect(() => {
      let cancelled = false;
      void getMcpInstructions(workspaceId)
         .then((next) => {
            if (cancelled) return;
            setCurrent(next);
            setDraft(next.workflow);
         })
         .catch((cause: unknown) =>
            toast.error(cause instanceof Error ? cause.message : 'Could not load instructions.')
         );
      return () => {
         cancelled = true;
      };
   }, [workspaceId]);

   async function save(workflow: string | null, success: string) {
      setBusy(true);
      setSaved(false);
      try {
         const next = await saveMcpInstructions(workspaceId, workflow);
         setCurrent(next);
         setDraft(next.workflow);
         setConfirmReset(false);
         setSaved(true);
         toast.success(success);
      } catch (cause) {
         toast.error(cause instanceof Error ? cause.message : 'Could not save instructions.');
      } finally {
         setBusy(false);
      }
   }

   if (!current) return null;
   const changed = draft.trim() !== current.workflow;

   return (
      <VStack gap={3}>
         <HStack gap={2} vAlign="center">
            <Heading level={3}>Agent instructions</Heading>
            <Text type="supporting" color="secondary">
               {current.custom ? 'Custom' : 'Default'}
            </Text>
         </HStack>
         <Text color="secondary">
            The task workflow AI clients receive when they connect. AI clients receive new
            instructions when they reconnect.
         </Text>
         <Text type="supporting" color="secondary">
            Always sent first: {current.preamble}
         </Text>
         <TextArea
            label="Workflow"
            value={draft}
            onChange={setDraft}
            rows={14}
            maxLength={MAX_MCP_WORKFLOW_LENGTH}
            isDisabled={busy}
            description={`${draft.length.toLocaleString()} / ${MAX_MCP_WORKFLOW_LENGTH.toLocaleString()} characters`}
         />
         <HStack gap={2} vAlign="center">
            <Button
               label="Save instructions"
               icon={<Save className="size-4" />}
               isLoading={busy}
               isDisabled={!changed}
               onClick={() =>
                  void save(draft, 'Instructions saved. Clients get them on reconnect.')
               }
            />
            {confirmReset ? (
               <>
                  <Button
                     label="Confirm reset"
                     icon={<Check className="size-4" />}
                     variant="destructive"
                     isLoading={busy}
                     onClick={() =>
                        void save(
                           null,
                           'Instructions reset to default. Clients get them on reconnect.'
                        )
                     }
                  />
                  <Button
                     label="Keep instructions"
                     tooltip="Keep instructions"
                     icon={<X className="size-4" />}
                     isIconOnly
                     variant="ghost"
                     onClick={() => setConfirmReset(false)}
                  />
               </>
            ) : (
               <Button
                  label="Reset to default"
                  icon={<RotateCcw className="size-4" />}
                  variant="ghost"
                  isDisabled={busy || (!current.custom && draft === current.defaultWorkflow)}
                  onClick={() => setConfirmReset(true)}
               />
            )}
            {saved && <SuccessMark label="Instructions saved" />}
         </HStack>
      </VStack>
   );
}
