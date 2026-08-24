'use client';

import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { format, parseISO } from 'date-fns';
import { Calendar } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const formatDay = (iso?: string | null) => (iso ? format(parseISO(iso), 'MMM do') : '—');

export function ProjectDateDialog({
   value,
   title,
   fallback,
   onSave,
}: {
   value?: string | null;
   title: string;
   fallback: string;
   onSave: (value: string | null) => Promise<unknown>;
}) {
   const [open, setOpen] = useState(false);
   const [draft, setDraft] = useState(value?.slice(0, 10) ?? '');
   const [saving, setSaving] = useState(false);
   const save = async () => {
      setSaving(true);
      try {
         await onSave(draft || null);
         setOpen(false);
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : `Could not update ${title}.`);
      } finally {
         setSaving(false);
      }
   };
   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <button
            type="button"
            className="inline-flex items-center gap-1"
            onClick={() => {
               setDraft(value?.slice(0, 10) ?? '');
               setOpen(true);
            }}
         >
            <Calendar className="size-3.5 text-muted-foreground" />
            {value ? formatDay(value) : fallback}
         </button>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <Input type="date" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <DialogFooter>
               <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
               </Button>
               <Button disabled={saving} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Save'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
