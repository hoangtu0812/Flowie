'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { Button } from '@astryxdesign/core/Button';
import { TextArea } from '@astryxdesign/core/TextArea';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { DraftImages } from '@/components/common/markdown/draft-images';
import { useImagePaste } from '@/hooks/use-image-paste';
import { Issue } from '@/mock-data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useModifierKey } from '@/features/shared/use-modifier-key';
import { SubmissionGate } from '@/features/shared/submission-gate';

/**
 * Issue description: rendered Markdown with an edit button, or an editor that saves only on an
 * explicit Save (button or Ctrl/⌘+Enter), like a comment; there is no autosave. Esc leaves the
 * editor only while the draft is unchanged, so a stray key never drops typed text; Cancel discards
 * it. The draft lives here and survives tab switches because the Overview tab stays mounted.
 * VI: Mô tả issue: Markdown đã hiển thị kèm nút sửa, hoặc ô soạn chỉ lưu khi bấm Save (nút hoặc
 * VI: Ctrl/⌘+Enter), giống bình luận; không tự động lưu. Esc chỉ thoát khi bản nháp chưa đổi, để
 * VI: lỡ tay bấm phím không làm mất nội dung đã gõ; Cancel mới bỏ bản nháp. Bản nháp nằm ở đây và
 * VI: còn nguyên khi đổi tab vì tab Overview luôn được giữ mount.
 */
export function IssueDescription({ issue }: { issue: Issue }) {
   const tx = useMessages(messages);

   const update = useIssuesStore((state) => state.updateIssueDescription);
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState(issue.description);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const gate = useRef(new SubmissionGate());
   const modifier = useModifierKey();
   const identity = useRef(issue.id);
   const scope = useMemo(() => ({ id: issue.id }), [issue.id]);
   const currentScope = useRef(scope);
   currentScope.current = scope;
   const { onPaste, uploading } = useImagePaste({
      workspaceId,
      entityType: 'issue',
      entityId: issue.id,
      value: draft,
      onChange: setDraft,
   });
   useEffect(() => {
      if (identity.current !== issue.id) {
         identity.current = issue.id;
         setDraft(issue.description);
         setEditing(false);
         setError(undefined);
         setSaving(false);
         gate.current = new SubmissionGate();
      }
   }, [issue.id, issue.description]);
   useEffect(() => {
      if (!editing) setDraft(issue.description);
   }, [issue.description, editing]);
   const save = () =>
      gate.current.run(async () => {
         if (uploading) return;
         setSaving(true);
         setError(undefined);
         try {
            if (draft !== issue.description) await update(issue.id, draft);
            if (currentScope.current === scope) setEditing(false);
         } catch (reason) {
            if (currentScope.current === scope)
               setError(
                  reason instanceof Error ? reason.message : tx('Could not save description.')
               );
         } finally {
            if (currentScope.current === scope) setSaving(false);
         }
      });
   return (
      <VStack
         gap={3}
         paddingBlock={0}
         className="min-w-0"
         onKeyDown={(event) => {
            if (!editing || event.nativeEvent.isComposing || saving) return;
            if (event.key === 'Escape' && draft === issue.description) setEditing(false);
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
               event.preventDefault();
               void save();
            }
         }}
      >
         {editing ? (
            <>
               <TextArea
                  label={tx('Issue description')}
                  value={draft}
                  onChange={setDraft}
                  onPaste={onPaste}
                  rows={10}
                  isDisabled={saving}
               />
               <DraftImages
                  value={draft}
                  onChange={setDraft}
                  label={tx('Images in this description')}
                  removeLabel={tx('Remove image')}
                  isDisabled={saving || uploading}
               />
               {error && <Text role="alert">{error}</Text>}
               <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                  <Text type="supporting">
                     {uploading
                        ? tx('Uploading image…')
                        : `${modifier}+Enter to save · paste to add an image`}
                  </Text>
                  <HStack gap={2}>
                     <Button
                        label={tx('Cancel')}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                           setDraft(issue.description);
                           setEditing(false);
                        }}
                        isDisabled={saving}
                     />
                     <Button
                        label={tx('Save')}
                        variant="primary"
                        size="sm"
                        clickAction={save}
                        isLoading={saving}
                        isDisabled={uploading}
                     />
                  </HStack>
               </HStack>
            </>
         ) : (
            <HStack gap={2} vAlign="start" className="min-w-0">
               <VStack className="min-w-0 flex-1">
                  {issue.description.trim() ? (
                     <MarkdownPreview content={issue.description} appearance="issue" />
                  ) : (
                     <Text type="supporting">{tx('No description yet.')}</Text>
                  )}
               </VStack>
               <Button
                  label={tx('Edit description')}
                  tooltip={tx('Edit description')}
                  icon={<Pencil className="size-4" />}
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
               />
            </HStack>
         )}
      </VStack>
   );
}
