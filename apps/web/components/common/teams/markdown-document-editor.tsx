'use client';

import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { DesignSurface } from '@/components/common/design-surface';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { useDocumentDraft, type DocumentDraft } from '@/features/documents/use-document-draft';
import type { LiveDocument } from './use-live-team';

export function MarkdownDocumentEditor({
   document,
   open,
   onOpenChange,
   onUpdate,
}: {
   document?: LiveDocument;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onUpdate: (id: string, draft: DocumentDraft) => Promise<unknown>;
}) {
   const state = useDocumentDraft(document, open, onUpdate);
   const { title, content } = state.draft;
   const [mode, setMode] = useState<'view' | 'edit'>('view');
   useEffect(() => {
      setMode('view');
   }, [document?.id, open]);
   const close = async () => {
      if (await state.flush()) onOpenChange(false);
   };
   const status = !state.ready
      ? 'Loading document…'
      : state.saving
        ? 'Saving…'
        : state.error
          ? 'Save failed — your draft is retained.'
          : state.dirty
            ? 'Unsaved changes…'
            : 'All changes saved.';

   return (
      <DesignSurface>
         <Dialog
            isOpen={open}
            onOpenChange={(next) => {
               if (next) onOpenChange(true);
               else void close();
            }}
            variant="fullscreen"
            purpose="form"
            padding={0}
         >
            <Layout
               padding={4}
               header={
                  <DialogHeader
                     title={
                        mode === 'edit'
                           ? 'Edit Markdown document'
                           : title || document?.title || 'Markdown document'
                     }
                     subtitle={status}
                     onOpenChange={() => void close()}
                     endContent={
                        mode === 'view' ? (
                           <Button
                              label="Edit"
                              isDisabled={!state.ready}
                              onClick={() => setMode('edit')}
                           />
                        ) : (
                           <Button
                              label="Done"
                              isLoading={state.saving}
                              isDisabled={!state.ready}
                              clickAction={async () => {
                                 if (await state.flush()) setMode('view');
                              }}
                           />
                        )
                     }
                  />
               }
               footer={
                  <LayoutFooter>
                     <HStack justify="end" gap={2}>
                        {state.error && (
                           <Button
                              label="Retry save"
                              clickAction={async () => {
                                 await state.flush();
                              }}
                              isLoading={state.saving}
                           />
                        )}
                        <Button
                           label="Close"
                           clickAction={close}
                           isDisabled={!state.ready}
                           isLoading={state.saving}
                        />
                     </HStack>
                  </LayoutFooter>
               }
               content={
                  <LayoutContent label="Document content">
                     <VStack gap={4}>
                        {state.recovered && (
                           <Text role="status">An unsaved local draft was recovered.</Text>
                        )}
                        {state.error && <Text role="alert">{state.error}</Text>}
                        {mode === 'view' ? (
                           <VStack as="article" maxWidth="80ch" gap={4}>
                              <MarkdownPreview content={content} />
                           </VStack>
                        ) : (
                           <Grid columns={{ minWidth: 320, max: 2, repeat: 'fit' }} gap={6}>
                              <VStack gap={3}>
                                 <TextInput
                                    label="Document title"
                                    value={title}
                                    onChange={(value) => state.update({ title: value, content })}
                                    isRequired
                                 />
                                 <TextArea
                                    label="Markdown content"
                                    value={content}
                                    onChange={(value) => state.update({ title, content: value })}
                                    rows={18}
                                    hasSpellCheck={false}
                                 />
                              </VStack>
                              <VStack as="article" gap={4}>
                                 <Text type="label">Preview</Text>
                                 <MarkdownPreview content={content} />
                              </VStack>
                           </Grid>
                        )}
                     </VStack>
                  </LayoutContent>
               }
            />
         </Dialog>
      </DesignSurface>
   );
}
