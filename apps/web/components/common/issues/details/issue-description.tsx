'use client';
import { Button } from '@astryxdesign/core/Button';
import { TextArea } from '@astryxdesign/core/TextArea';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { useImagePaste } from '@/hooks/use-image-paste';
import { Issue } from '@/mock-data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { useEffect, useRef, useState } from 'react';
import { useModifierKey } from '@/features/shared/use-modifier-key';
import { SubmissionGate } from '@/features/shared/submission-gate';

export function IssueDescription({ issue }: { issue: Issue }) {
   const update = useIssuesStore((state) => state.updateIssueDescription);
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState(issue.description);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const gate = useRef(new SubmissionGate());
   const modifier = useModifierKey();
   const identity = useRef(issue.id);
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
            setEditing(false);
         } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not save description.');
         } finally {
            setSaving(false);
         }
      });
   return (
      <VStack
         gap={3}
         paddingBlock={4}
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
                  label="Issue description"
                  value={draft}
                  onChange={setDraft}
                  onPaste={onPaste}
                  rows={10}
                  isDisabled={saving}
               />
               {error && <Text role="alert">{error}</Text>}
               <HStack gap={2}>
                  <Button
                     label="Save description"
                     clickAction={save}
                     isLoading={saving}
                     isDisabled={uploading}
                  />
                  <Button
                     label="Cancel editing"
                     onClick={() => {
                        setDraft(issue.description);
                        setEditing(false);
                     }}
                     isDisabled={saving}
                  />
               </HStack>
               <Text type="supporting">
                  {uploading
                     ? 'Uploading image…'
                     : `${modifier}+Enter to save · Esc to cancel · paste to add an image`}
               </Text>
            </>
         ) : (
            <>
               {issue.description.trim() ? (
                  <MarkdownPreview content={issue.description} />
               ) : (
                  <Text type="supporting">No description yet.</Text>
               )}
               <Button label="Edit description" variant="ghost" onClick={() => setEditing(true)} />
            </>
         )}
      </VStack>
   );
}
