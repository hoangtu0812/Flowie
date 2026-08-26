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
import type { LiveDocument } from './use-live-team';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type DocumentDraft = Pick<LiveDocument, 'title' | 'content'>;

/** A small native Markdown editor. Drafts persist after 800ms of inactivity. */
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

   const signature = useMemo(() => JSON.stringify({ title, content }), [content, title]);

   useEffect(() => {
      if (!open || !document) return;
      const initial = JSON.stringify({ title: document.title, content: document.content ?? '' });
      setTitle(document.title);
      setContent(document.content ?? '');
      setSaved(initial);
      setFailed(false);
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
      if (!open || !document || signature === saved) return;
      const timer = window.setTimeout(() => {
         void save({ title, content }, signature);
      }, 800);
      return () => window.clearTimeout(timer);
   }, [content, document, open, save, saved, signature, title]);

   const close = () => {
      if (document && signature !== saved) void save({ title, content }, signature);
      onOpenChange(false);
   };

   return (
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
         <DialogContent className="max-w-3xl">
            <DialogHeader>
               <DialogTitle>Markdown document</DialogTitle>
               <DialogDescription>
                  {saving
                     ? 'Saving…'
                     : failed
                       ? 'Save failed — editing is kept locally.'
                       : 'All changes save automatically.'}
               </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
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
                  className="min-h-80 resize-y font-mono text-sm leading-6"
               />
            </div>
            <div className="flex justify-end">
               <Button variant="outline" onClick={close}>
                  Close
               </Button>
            </div>
         </DialogContent>
      </Dialog>
   );
}
