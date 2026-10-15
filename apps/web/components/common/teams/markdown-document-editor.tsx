'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';

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
import { DocumentHistory } from '@/features/documents/document-history';

export function MarkdownDocumentEditor({
   document,
   open,
   onOpenChange,
   onUpdate,
}: {
   document?: LiveDocument;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onUpdate: (
      id: string,
      draft: DocumentDraft & { expectedVersion: number }
   ) => Promise<LiveDocument>;
}) {
   const tx = useMessages(messages);

   const state = useDocumentDraft(document, open, onUpdate);
   const { title, content } = state.draft;
   const [mode, setMode] = useState<'view' | 'edit'>('view');
   const [history, setHistory] = useState(false);
   const [latest, setLatest] = useState<LiveDocument>();
   const [compareError, setCompareError] = useState<string>();
   useEffect(() => {
      setMode('view');
      setHistory(false);
      setLatest(undefined);
      setCompareError(undefined);
   }, [document?.id, open]);
   const close = async () => {
      if (!state.dirty || (await state.flush())) onOpenChange(false);
   };
   const status = !state.ready
      ? tx('Loading document…')
      : state.saving
        ? tx('Saving…')
        : state.error
          ? tx('Save failed — your draft is retained.')
          : state.dirty
            ? tx('Unsaved changes…')
            : tx('All changes saved.');

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
                           ? tx('Edit Markdown document')
                           : title || document?.title || tx('Markdown document')
                     }
                     subtitle={status}
                     onOpenChange={() => void close()}
                     endContent={
                        mode === 'view' ? (
                           <Button
                              label={tx('Edit')}
                              isDisabled={!state.ready}
                              onClick={() => setMode('edit')}
                           />
                        ) : (
                           <Button
                              label={tx('Done')}
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
                        <Button
                           label={history ? tx('Hide history') : tx('Revision history')}
                           onClick={() => setHistory(!history)}
                        />
                        {state.error && (
                           <Button
                              label={tx('Retry save')}
                              clickAction={async () => {
                                 await state.flush();
                              }}
                              isLoading={state.saving}
                           />
                        )}
                        {(state.error || state.conflict) && state.dirty && (
                           <Button
                              label={tx('Close and keep local draft')}
                              isDisabled={state.saving}
                              onClick={() => {
                                 if (state.keepLocally()) onOpenChange(false);
                                 else
                                    setCompareError(
                                       tx(
                                          'Browser storage is unavailable. Keep this editor open and copy your draft before leaving.'
                                       )
                                    );
                              }}
                           />
                        )}
                        <Button label={tx('Close')} clickAction={close} isLoading={state.saving} />
                     </HStack>
                  </LayoutFooter>
               }
               content={
                  <LayoutContent label={tx('Document content')}>
                     <VStack gap={4}>
                        {state.recovered && (
                           <Text role="status">{tx('An unsaved local draft was recovered.')}</Text>
                        )}
                        {state.error && <Text role="alert">{state.error}</Text>}
                        {compareError && !state.conflict && (
                           <Text role="alert">{compareError}</Text>
                        )}
                        {state.conflict && (
                           <VStack gap={3} role="alert">
                              <Text>
                                 {tx(
                                    'Your draft cannot overwrite a newer revision. Compare the latest version first.'
                                 )}
                              </Text>
                              <Button
                                 label={tx('Compare latest version')}
                                 clickAction={async () => {
                                    try {
                                       setLatest(await state.latest());
                                       setCompareError(undefined);
                                    } catch (reason) {
                                       setCompareError(
                                          reason instanceof Error
                                             ? reason.message
                                             : tx('Could not load latest version.')
                                       );
                                    }
                                 }}
                              />
                              {compareError && <Text>{compareError}</Text>}
                              {latest && (
                                 <VStack gap={3}>
                                    <Text>
                                       {tx('Latest version: v')}
                                       {latest.version} · {latest.title}
                                    </Text>
                                    <MarkdownPreview content={latest.content} />
                                    <Text>
                                       {tx(
                                          'The retained draft remains in the editor. Review both before choosing.'
                                       )}
                                    </Text>
                                    <HStack gap={2}>
                                       <Button
                                          label={tx('Use latest version')}
                                          onClick={() => void state.resolve(latest, false)}
                                       />
                                       <Button
                                          label={tx('Save retained draft over reviewed version')}
                                          clickAction={() => state.resolve(latest, true)}
                                       />
                                    </HStack>
                                 </VStack>
                              )}
                           </VStack>
                        )}
                        {history && document && (
                           <DocumentHistory
                              id={document.id}
                              latest={state.latest}
                              beforeRestore={state.flush}
                              onRestore={async (restored) => {
                                 await state.resolve(restored, false);
                              }}
                           />
                        )}
                        {mode === 'view' ? (
                           <VStack as="article" maxWidth="80ch" gap={4}>
                              <MarkdownPreview content={content} />
                           </VStack>
                        ) : (
                           <Grid columns={{ minWidth: 320, max: 2, repeat: 'fit' }} gap={6}>
                              <VStack gap={3}>
                                 <TextInput
                                    label={tx('Document title')}
                                    value={title}
                                    onChange={(value) => state.update({ title: value, content })}
                                    isRequired
                                 />
                                 <TextArea
                                    label={tx('Markdown content')}
                                    value={content}
                                    onChange={(value) => state.update({ title, content: value })}
                                    rows={18}
                                    hasSpellCheck={false}
                                 />
                              </VStack>
                              <VStack as="article" gap={4}>
                                 <Text type="label">{tx('Preview')}</Text>
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
