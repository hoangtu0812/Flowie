'use client';

import { ArrowLeft, FileText, Plus, SendHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMessages } from '@/features/shared/use-messages';
import { ApiRequestError } from '@/lib/http';
import {
   MAX_QUESTION,
   fallbackDraft,
   historyFor,
   latestDraft,
   offersTicket,
   type AssistantApplication,
   type AssistantStatus,
   type Exchange,
   type TicketPrefill,
} from './assistant-draft';
import { messages } from './messages.vi';
import { askAssistant, loadAssistantStatus } from './service-desk-api';

/**
 * Assistant availability for a workspace; undefined while loading or when the check fails, so a
 * failure leaves Service Desk exactly as it was without the assistant.
 * VI: Trạng thái trợ lý của workspace; undefined khi đang tải hoặc khi lỗi, để lỗi chỉ làm Service
 * VI: Desk trở lại như khi chưa có trợ lý.
 */
export function useAssistantStatus(workspaceId: string | undefined) {
   const [status, setStatus] = useState<AssistantStatus>();
   useEffect(() => {
      setStatus(undefined);
      if (!workspaceId) return;
      let current = true;
      loadAssistantStatus(workspaceId).then(
         (value) => current && setStatus(value),
         () => undefined
      );
      return () => {
         current = false;
      };
   }, [workspaceId]);
   return status?.available ? status : undefined;
}

/**
 * Chat that answers from the workspace's approved documents and hands a ticket draft to the
 * ticket form. The conversation lives only in this component, so it starts over when the
 * component leaves the page. Answers are rendered as Markdown, which never renders raw HTML.
 * VI: Khung chat trả lời từ tài liệu đã duyệt của workspace và chuyển bản nháp ticket cho form
 * VI: tạo ticket. Hội thoại chỉ nằm trong component này, nên bắt đầu lại khi component rời trang.
 * VI: Câu trả lời hiển thị dạng Markdown, không bao giờ render HTML thô.
 */
export function ServiceDeskAssistant({
   workspaceId,
   workspaceSlug,
   applications,
   onCreateTicket,
   onClose,
}: {
   workspaceId: string;
   workspaceSlug: string;
   applications: AssistantApplication[];
   onCreateTicket: (draft?: TicketPrefill) => void;
   onClose?: () => void;
}) {
   const tx = useMessages(messages);
   const [exchanges, setExchanges] = useState<Exchange[]>([]);
   const [question, setQuestion] = useState('');
   const [busy, setBusy] = useState(false);
   const end = useRef<HTMLDivElement>(null);

   // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect that returns
   // anything but a function or undefined makes React call it as a cleanup and crash.
   // VI: Cần dấu ngoặc nhọn: trình duyệt mới trả Promise từ scrollIntoView, và effect trả về thứ gì
   // VI: khác hàm hoặc undefined sẽ bị React gọi như hàm dọn dẹp và làm trang lỗi.
   useEffect(() => {
      end.current?.scrollIntoView?.({ block: 'end' });
   }, [exchanges]);

   const update = (index: number, change: Partial<Exchange>) =>
      setExchanges((items) =>
         items.map((item, position) => (position === index ? { ...item, ...change } : item))
      );

   const ask = async (text: string, earlier: Exchange[]) => {
      const index = earlier.length;
      setExchanges([...earlier, { question: text }]);
      setBusy(true);
      try {
         update(index, { reply: await askAssistant(workspaceId, text, historyFor(earlier)) });
      } catch (caught) {
         update(index, {
            error: {
               status: caught instanceof ApiRequestError ? caught.status : 0,
               message: caught instanceof Error ? caught.message : '',
            },
         });
      } finally {
         setBusy(false);
      }
   };

   const submit = () => {
      const text = question.trim();
      if (!text || busy) return;
      setQuestion('');
      void ask(text, exchanges);
   };

   return (
      <VStack className="h-full min-h-0 w-full">
         <HStack gap={2} className="h-10 shrink-0 items-center border-b px-4">
            {onClose && (
               <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={tx('Back')}
                  onClick={onClose}
               >
                  <ArrowLeft className="size-4" />
               </Button>
            )}
            <Text type="label" className="flex-1">
               {tx('Ask the assistant')}
            </Text>
            <Button
               type="button"
               size="sm"
               variant="outline"
               onClick={() => onCreateTicket(latestDraft(exchanges))}
            >
               <Plus className="size-3.5" />
               {tx('Create ticket')}
            </Button>
         </HStack>
         <VStack
            gap={4}
            role="log"
            aria-live="polite"
            aria-label={tx('Conversation')}
            className="min-h-0 flex-1 overflow-y-auto p-4"
         >
            <Bubble>
               <Text type="body">
                  {tx('Ask about an application and I will look in its approved documents.')}
               </Text>
               {applications.length > 0 && (
                  <Text type="supporting">
                     {tx('I can help with: {names}', {
                        names: applications.map((item) => item.name).join(', '),
                     })}
                  </Text>
               )}
            </Bubble>
            {exchanges.map((exchange, index) => (
               <VStack key={index} gap={2}>
                  <div className="ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                     {exchange.question}
                  </div>
                  {!exchange.reply && !exchange.error && (
                     <Bubble>
                        <Text type="supporting">{tx('Looking in the documents…')}</Text>
                     </Bubble>
                  )}
                  {exchange.error && (
                     <Bubble>
                        <Text type="body">
                           {tx(
                              exchange.error.status === 429
                                 ? 'You have asked a lot in the last hour. Try again later, or create a ticket.'
                                 : 'The assistant cannot answer right now.'
                           )}
                        </Text>
                        <HStack gap={2} className="flex-wrap">
                           {exchange.error.status !== 429 && index === exchanges.length - 1 && (
                              <Button
                                 type="button"
                                 size="sm"
                                 variant="outline"
                                 disabled={busy}
                                 onClick={() =>
                                    void ask(exchange.question, exchanges.slice(0, index))
                                 }
                              >
                                 {tx('Try again')}
                              </Button>
                           )}
                           <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                 onCreateTicket(
                                    fallbackDraft(
                                       exchanges.slice(0, index + 1).map((item) => item.question)
                                    )
                                 )
                              }
                           >
                              {tx('Create ticket')}
                           </Button>
                        </HStack>
                     </Bubble>
                  )}
                  {exchange.reply && (
                     <Answer
                        exchange={exchange}
                        workspaceSlug={workspaceSlug}
                        onResolved={(resolved) => update(index, { resolved })}
                        onDecline={() => update(index, { declined: true })}
                        onCreateTicket={() => onCreateTicket(exchange.reply?.ticket)}
                     />
                  )}
               </VStack>
            ))}
            <div ref={end} />
         </VStack>
         <form
            className="flex shrink-0 items-end gap-2 border-t p-3"
            onSubmit={(event) => {
               event.preventDefault();
               submit();
            }}
         >
            <Textarea
               aria-label={tx('Your question')}
               placeholder={tx('Type your question')}
               value={question}
               maxLength={MAX_QUESTION}
               rows={2}
               className="min-h-0 resize-none"
               onChange={(event) => setQuestion(event.target.value)}
               onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                     event.preventDefault();
                     submit();
                  }
               }}
            />
            <Button
               type="submit"
               size="icon"
               aria-label={tx('Send question')}
               disabled={busy || !question.trim()}
            >
               <SendHorizontal className="size-4" />
            </Button>
         </form>
      </VStack>
   );
}

function Bubble({ children }: { children: React.ReactNode }) {
   return (
      <VStack gap={2} className="max-w-[92%] rounded-lg border bg-muted/40 px-3 py-2">
         {children}
      </VStack>
   );
}

function Answer({
   exchange,
   workspaceSlug,
   onResolved,
   onDecline,
   onCreateTicket,
}: {
   exchange: Exchange;
   workspaceSlug: string;
   onResolved: (resolved: boolean) => void;
   onDecline: () => void;
   onCreateTicket: () => void;
}) {
   const tx = useMessages(messages);
   const reply = exchange.reply!;
   return (
      <Bubble>
         {reply.answer.trim() ? (
            <div className="text-sm">
               <MarkdownPreview content={reply.answer} />
            </div>
         ) : (
            <Text type="body">{tx('I could not find this in the documents.')}</Text>
         )}
         {reply.sources.length > 0 && (
            <VStack gap={1}>
               <Text type="supporting">{tx('Sources')}</Text>
               {reply.sources.map((source) => (
                  <details
                     key={source.id}
                     className="rounded border bg-background px-2 py-1 text-sm"
                  >
                     <summary className="cursor-pointer">
                        [{source.id}] {source.projectName} · {source.title} (v{source.release}) ›{' '}
                        {source.heading}
                     </summary>
                     <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                        {source.excerpt}
                     </p>
                     {source.canOpen && (
                        <Link
                           href={`/${workspaceSlug}/documents/${source.documentId}`}
                           target="_blank"
                           className="mt-1 inline-flex items-center gap-1 text-primary underline"
                        >
                           <FileText className="size-3.5" />
                           {tx('Open document')}
                        </Link>
                     )}
                  </details>
               ))}
            </VStack>
         )}
         {reply.status === 'answered' && exchange.resolved === undefined && (
            <HStack gap={2} className="flex-wrap items-center">
               <Text type="supporting">{tx('Did this solve your problem?')}</Text>
               <Button type="button" size="sm" variant="outline" onClick={() => onResolved(true)}>
                  {tx('Solved')}
               </Button>
               <Button type="button" size="sm" variant="outline" onClick={() => onResolved(false)}>
                  {tx('Not solved')}
               </Button>
            </HStack>
         )}
         {exchange.resolved === true && <Text type="supporting">{tx('Glad it helped.')}</Text>}
         {offersTicket(exchange) && (
            <HStack gap={2} className="flex-wrap items-center">
               <Text type="supporting">
                  {tx('Would you like to create a ticket so the team can help?')}
               </Text>
               <Button type="button" size="sm" onClick={onCreateTicket}>
                  {tx('Create ticket')}
               </Button>
               <Button type="button" size="sm" variant="ghost" onClick={onDecline}>
                  {tx('No, thanks')}
               </Button>
            </HStack>
         )}
      </Bubble>
   );
}
