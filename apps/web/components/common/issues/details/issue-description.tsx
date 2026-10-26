'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { Button } from '@astryxdesign/core/Button';
import { TextArea } from '@astryxdesign/core/TextArea';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { useImagePaste } from '@/hooks/use-image-paste';
import { Issue } from '@/mock-data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useModifierKey } from '@/features/shared/use-modifier-key';
import { SubmissionGate } from '@/features/shared/submission-gate';

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
            if (event.key === 'Escape') {
               setDraft(issue.description);
               setEditing(false);
            }
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
               {error && <Text role="alert">{error}</Text>}
               <HStack gap={2}>
                  <Button
                     label={tx('Save description')}
                     clickAction={save}
                     isLoading={saving}
                     isDisabled={uploading}
                  />
                  <Button
                     label={tx('Cancel editing')}
                     onClick={() => {
                        setDraft(issue.description);
                        setEditing(false);
                     }}
                     isDisabled={saving}
                  />
               </HStack>
               <Text type="supporting">
                  {uploading
                     ? tx('Uploading image…')
                     : `${modifier}+Enter to save · Esc to cancel · paste to add an image`}
               </Text>
            </>
         ) : (
            <>
               {issue.description.trim() ? (
                  <MarkdownPreview content={issue.description} appearance="issue" />
               ) : (
                  <Text type="supporting">{tx('No description yet.')}</Text>
               )}
               <Button
                  label={tx('Edit description')}
                  variant="ghost"
                  size="sm"
                  className="self-start text-muted-foreground"
                  onClick={() => setEditing(true)}
               />
            </>
         )}
      </VStack>
   );
}
