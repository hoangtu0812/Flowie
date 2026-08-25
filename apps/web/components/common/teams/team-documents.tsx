'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ChevronRight, Pin, Plus, SlidersHorizontal } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useLiveTeam } from './use-live-team';

const timeAgo = (date: string) => formatDistanceToNowStrict(parseISO(date), { addSuffix: true }).replace(' minutes', 'min').replace(' hours', 'h').replace(' days', 'd').replace(' weeks', 'w').replace(' months', 'mo').replace(' years', 'y');

/** Documents tab backed by FastAPI/PostgreSQL, retaining Circle’s grouped list layout. */
export default function TeamDocuments() {
   const { teamId } = useParams<{ teamId: string }>();
   const { documentFolders, team, loading, error, createDocument } = useLiveTeam(teamId);
   const [open, setOpen] = useState(false);
   const [title, setTitle] = useState('');
   const [folderId, setFolderId] = useState('');
   const [saving, setSaving] = useState(false);

   if (loading) return <div className="h-full grid place-items-center text-sm text-muted-foreground">Loading documents…</div>;
   if (error || !team) return <div className="h-full grid place-items-center text-sm text-destructive">{error ?? 'Team not found.'}</div>;

   const create = async () => {
      if (!title.trim()) return;
      setSaving(true);
      try { await createDocument({ title, folderId: folderId || undefined }); setTitle(''); setFolderId(''); setOpen(false); toast.success('Document created.'); }
      catch (caught) { toast.error(caught instanceof Error ? caught.message : 'Could not create document.'); }
      finally { setSaving(false); }
   };

   return (
      <div className="w-full">
         <div className="flex items-center justify-between px-6 py-3 gap-2"><div className="grid grid-cols-[1fr_40px] md:grid-cols-[1fr_90px_90px_40px] w-full items-center text-sm text-muted-foreground"><span className="flex items-center gap-1 font-medium">Name ↓</span><span className="hidden md:block">Created</span><span className="hidden md:block">Last edited</span><span /></div><div className="flex items-center gap-2 shrink-0"><Button size="xs" variant="secondary" onClick={() => setOpen(true)}><Plus className="size-4 md:mr-1" /><span className="hidden md:inline">New document</span></Button><Button size="xs" variant="ghost" aria-label="Display options"><SlidersHorizontal className="size-4" /></Button></div></div>
         {documentFolders.map((folder) => <Collapsible key={folder.id} defaultOpen={folder.documents.some((document) => document.pinned)}><CollapsibleTrigger asChild><button className="group w-full flex items-center gap-2 px-6 h-10 bg-sidebar/30 hover:bg-sidebar/60 border-b border-border/50 text-sm"><ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" /><span className="text-base leading-none">{folder.icon}</span><span className="font-medium">{folder.name}</span><span className="text-muted-foreground">{folder.documents.length}</span></button></CollapsibleTrigger><CollapsibleContent>{folder.documents.map((document) => <div key={document.id} className="grid grid-cols-[1fr_40px] md:grid-cols-[1fr_90px_90px_40px] items-center px-6 h-11 hover:bg-sidebar/50 border-b border-border/30 text-sm"><div className="flex items-center gap-2 min-w-0 pl-6"><span className="text-base leading-none">{document.icon}</span><span className="font-medium truncate">{document.title}</span>{document.pinned && <Pin className="size-3 text-muted-foreground shrink-0" />}</div><span className="hidden md:block text-xs text-muted-foreground">{timeAgo(document.createdAt)}</span><span className="hidden md:block text-xs text-muted-foreground">{timeAgo(document.updatedAt)}</span><Avatar className="size-5"><AvatarImage src={document.createdBy.avatarUrl ?? undefined} alt={document.createdBy.name} /><AvatarFallback>{document.createdBy.name[0]}</AvatarFallback></Avatar></div>)}</CollapsibleContent></Collapsible>)}
         {documentFolders.length === 0 && <p className="px-6 py-10 text-sm text-muted-foreground">No team document folders yet.</p>}
         <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}><DialogContent><DialogHeader><DialogTitle>New document</DialogTitle></DialogHeader><div className="space-y-3"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Document title" autoFocus /><Select value={folderId || 'default'} onValueChange={(value) => setFolderId(value === 'default' ? '' : value)}><SelectTrigger><SelectValue placeholder="Folder" /></SelectTrigger><SelectContent><SelectItem value="default">Default team folder</SelectItem>{documentFolders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}</SelectContent></Select></div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving || title.trim().length < 2} onClick={() => void create()}>{saving ? 'Creating…' : 'Create document'}</Button></DialogFooter></DialogContent></Dialog>
      </div>
   );
}
