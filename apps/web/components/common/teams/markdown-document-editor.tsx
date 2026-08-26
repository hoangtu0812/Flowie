'use client';

import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Check, Pencil, X } from 'lucide-react';
import type { LiveDocument } from './use-live-team';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type DocumentDraft = Pick<LiveDocument, 'title' | 'content'>;

function InlineMarkdown({ value }: { value: string }) {
   const parts: ReactNode[] = [];
   const token = /(\*\*[^*]+\*\*|\x60[^\x60]+\x60|\[[^\]]+\]\([^\s)]+\))/g;
   let cursor = 0;

   for (const match of value.matchAll(token)) {
      const index = match.index ?? 0;
      if (index > cursor) parts.push(value.slice(cursor, index));
      const item = match[0];
      if (item.startsWith('**')) {
         parts.push(<strong key={index + '-bold'}>{item.slice(2, -2)}</strong>);
      } else if (item.startsWith('\x60')) {
         parts.push(
            <code
               key={index + '-code'}
               className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
            >
               {item.slice(1, -1)}
            </code>
         );
      } else {
         const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(item);
         if (link && /^https?:\/\//.test(link[2])) {
            parts.push(
               <a
                  key={index + '-link'}
                  href={link[2]}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-4"
               >
                  {link[1]}
               </a>
            );
         } else {
            parts.push(item);
         }
      }
      cursor = index + item.length;
   }
   if (cursor < value.length) parts.push(value.slice(cursor));
   return <>{parts}</>;
}

/** Safe, dependency-free Markdown preview for the native editor. */
function MarkdownPreview({ content }: { content: string }) {
   const blocks: ReactNode[] = [];
   const lines = content.replace(/\r\n/g, '\n').split('\n');
   let paragraph: string[] = [];
   const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push(
         <p key={'p-' + blocks.length} className="whitespace-pre-wrap leading-7">
            <InlineMarkdown value={paragraph.join('\n')} />
         </p>
      );
      paragraph = [];
   };

   for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.trim()) {
         flushParagraph();
         continue;
      }
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
         flushParagraph();
         const className =
            heading[1].length === 1
               ? 'mt-7 text-2xl font-semibold'
               : heading[1].length === 2
                 ? 'mt-6 text-xl font-semibold'
                 : 'mt-5 text-lg font-semibold';
         blocks.push(
            <div key={'heading-' + blocks.length} className={className}>
               <InlineMarkdown value={heading[2]} />
            </div>
         );
         continue;
      }
      if (/^[-*]\s+/.test(line)) {
         flushParagraph();
         const items: string[] = [];
         while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
            items.push(lines[index].replace(/^[-*]\s+/, ''));
            index += 1;
         }
         index -= 1;
         blocks.push(
            <ul key={'list-' + blocks.length} className="list-disc space-y-1 pl-6">
               {items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                     <InlineMarkdown value={item} />
                  </li>
               ))}
            </ul>
         );
         continue;
      }
      if (line.startsWith('> ')) {
         flushParagraph();
         blocks.push(
            <blockquote
               key={'quote-' + blocks.length}
               className="border-l-2 border-primary/50 pl-4 text-muted-foreground"
            >
               <InlineMarkdown value={line.slice(2)} />
            </blockquote>
         );
         continue;
      }
      if (/^---+$/.test(line.trim())) {
         flushParagraph();
         blocks.push(<hr key={'rule-' + blocks.length} className="my-5 border-border" />);
         continue;
      }
      paragraph.push(line);
   }
   flushParagraph();
   return blocks.length ? (
      <div className="space-y-4">{blocks}</div>
   ) : (
      <p className="text-muted-foreground">This document is empty.</p>
   );
}

/** Opens in rendered View mode; Edit is a large split-pane Markdown editor with auto-save. */
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
   const [title, setTitle] = useState('');
   const [content, setContent] = useState('');
   const [saved, setSaved] = useState('');
   const [saving, setSaving] = useState(false);
   const [failed, setFailed] = useState(false);
   const [mode, setMode] = useState<'view' | 'edit'>('view');
   const signature = useMemo(() => JSON.stringify({ title, content }), [content, title]);

   useEffect(() => {
      if (!open || !document) return;
      const initial = JSON.stringify({ title: document.title, content: document.content ?? '' });
      setTitle(document.title);
      setContent(document.content ?? '');
      setSaved(initial);
      setFailed(false);
      setMode('view');
   }, [document, open]);

   const save = useCallback(
      async (draft: DocumentDraft, nextSignature: string) => {
         if (!document || nextSignature === saved) return;
         setSaving(true);
         setFailed(false);
         try {
            await onUpdate(document.id, draft);
            setSaved(nextSignature);
         } catch (caught) {
            setFailed(true);
            toast.error(caught instanceof Error ? caught.message : 'Could not auto-save document.');
         } finally {
            setSaving(false);
         }
      },
      [document, onUpdate, saved]
   );

   useEffect(() => {
      if (!open || mode !== 'edit' || !document || signature === saved) return;
      const timer = window.setTimeout(() => void save({ title, content }, signature), 800);
      return () => window.clearTimeout(timer);
   }, [content, document, mode, open, save, saved, signature, title]);

   const close = () => {
      if (document && signature !== saved) void save({ title, content }, signature);
      onOpenChange(false);
   };

   return (
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
         <DialogContent className="flex h-[min(90svh,900px)] w-[min(96vw,1100px)] max-w-none flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="flex-row items-start justify-between gap-4 border-b p-6 pr-12">
               <div className="min-w-0 text-left">
                  <DialogTitle>
                     {mode === 'edit' ? 'Edit Markdown document' : title || 'Markdown document'}
                  </DialogTitle>
                  <DialogDescription className="mt-1">
                     {mode === 'edit'
                        ? saving
                           ? 'Saving…'
                           : failed
                             ? 'Save failed — editing is kept locally.'
                             : 'All changes save automatically.'
                        : 'Rendered Markdown view'}
                  </DialogDescription>
               </div>
               {mode === 'view' ? (
                  <Button size="sm" onClick={() => setMode('edit')}>
                     <Pencil className="size-4" />
                     Edit
                  </Button>
               ) : (
                  <Button size="sm" variant="outline" onClick={() => setMode('view')}>
                     <Check className="size-4" />
                     Done
                  </Button>
               )}
            </DialogHeader>
            {mode === 'view' ? (
               <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
                  <article className="mx-auto max-w-3xl text-sm">
                     <MarkdownPreview content={content} />
                  </article>
               </div>
            ) : (
               <div className="grid min-h-0 flex-1 grid-cols-1 divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
                  <div className="flex min-h-0 flex-col gap-3 p-5">
                     <Input
                        aria-label="Document title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Document title"
                     />
                     <Textarea
                        aria-label="Markdown content"
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        placeholder={'# Notes\n\nWrite Markdown here…'}
                        className="min-h-0 flex-1 resize-none font-mono text-sm leading-6"
                     />
                  </div>
                  <div className="min-h-0 overflow-y-auto p-6">
                     <article className="text-sm">
                        <MarkdownPreview content={content} />
                     </article>
                  </div>
               </div>
            )}
            <div className="flex justify-end border-t p-4">
               <Button variant="outline" onClick={close}>
                  <X className="size-4" />
                  Close
               </Button>
            </div>
         </DialogContent>
      </Dialog>
   );
}
