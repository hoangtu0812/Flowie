'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';

import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { DesignSurface } from '@/components/common/design-surface';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { MarkdownEditor } from '@/components/common/markdown/markdown-editor';
import { useDocumentDraft, type DocumentDraft } from '@/features/documents/use-document-draft';
import type { LiveDocument } from './use-live-team';
import { DocumentHistory } from '@/features/documents/document-history';
import { Selector } from '@astryxdesign/core/Selector';
import { DOC_STATUSES, DOC_TYPES } from '@/features/documents/document-badges';
import { markdownHeadings } from '@/lib/markdown-headings';
import type { DocStatus, DocType } from '@/lib/document-tree';

/**
 * Table of contents for the view mode, shown once a document has three or more headings.
 * Links scroll inside the editor dialog instead of changing the page URL.
 * VI: Mục lục ở chế độ xem, hiện khi tài liệu có từ ba heading trở lên. Link cuộn bên trong
 * VI: hộp thoại editor thay vì đổi URL của trang.
 */
export function TableOfContents({ content, label }: { content: string; label: string }) {
   const headings = markdownHeadings(content);
   if (headings.length < 3) return null;
   return (
      <nav aria-label={label} className="rounded-md border border-border/60 p-3 text-sm">
         <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">{label}</p>
         <ul className="space-y-0.5">
            {headings.map((heading) => (
               <li key={heading.id} style={{ paddingLeft: (heading.level - 1) * 12 }}>
                  <a
                     href={`#${heading.id}`}
                     className="text-muted-foreground hover:text-foreground"
                     onClick={(event) => {
                        event.preventDefault();
                        document
                           .getElementById(heading.id)
                           ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                     }}
                  >
                     {heading.text}
                  </a>
               </li>
            ))}
         </ul>
      </nav>
   );
}

export function MarkdownDocumentEditor({
   document,
   open,
   onOpenChange,
   onUpdate,
   onMetadataChange,
}: {
   document?: LiveDocument;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onUpdate: (
      id: string,
      draft: DocumentDraft & { expectedVersion: number }
   ) => Promise<LiveDocument>;
   /** Saves type/status right away; without it the pickers are hidden. */
   /** VI: Lưu ngay loại/trạng thái; không truyền thì không hiện ô chọn. */
   onMetadataChange?: (
      id: string,
      metadata: { docType?: DocType; status?: DocStatus }
   ) => Promise<void>;
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
                        {document && onMetadataChange && (
                           <HStack gap={3} wrap="wrap">
                              <Selector
                                 label={tx('Document type')}
                                 value={document.docType ?? 'OTHER'}
                                 options={DOC_TYPES.map((value) => ({ value, label: value }))}
                                 onChange={(value) =>
                                    void onMetadataChange(document.id, {
                                       docType: value as DocType,
                                    })
                                 }
                              />
                              <Selector
                                 label={tx('Document status')}
                                 value={document.status ?? 'DRAFT'}
                                 options={DOC_STATUSES.map((item) => ({
                                    value: item.value,
                                    label: tx(item.label),
                                 }))}
                                 onChange={(value) =>
                                    void onMetadataChange(document.id, {
                                       status: value as DocStatus,
                                    })
                                 }
                              />
                           </HStack>
                        )}
                        {mode === 'view' ? (
                           <VStack as="article" maxWidth="80ch" gap={4}>
                              <TableOfContents content={content} label={tx('Contents')} />
                              <MarkdownPreview content={content} />
                           </VStack>
                        ) : (
                           <VStack gap={3}>
                              <TextInput
                                 label={tx('Document title')}
                                 value={title}
                                 onChange={(value) => state.update({ title: value, content })}
                                 isRequired
                              />
                              <MarkdownEditor
                                 value={content}
                                 onChange={(value) => state.update({ title, content: value })}
                              />
                           </VStack>
                        )}
                     </VStack>
                  </LayoutContent>
               }
            />
         </Dialog>
      </DesignSurface>
   );
}
