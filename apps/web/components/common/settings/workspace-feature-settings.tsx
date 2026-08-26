'use client';

import { loadCurrentWorkspaceTeams } from '@/components/common/teams/team-types';
import { authenticatedFetch } from '@/lib/workspaces';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Compass, FileText, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashedSmiley } from './settings-placeholder';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type Feature = 'documents' | 'initiatives';
type Member = {
   userId: string;
   user: { id: string; name: string; avatarUrl: string | null };
};
type WorkspaceDocument = {
   id: string;
   title: string;
   content: string;
   createdAt: string;
   updatedAt: string;
   team: { id: string; name: string; identifier: string } | null;
   updatedBy: { id: string; name: string; avatarUrl: string | null };
};
type WorkspaceInitiative = {
   id: string;
   name: string;
   description: string | null;
   status: string;
   priority: string;
   health: string;
   targetDate: string | null;
   owner: { id: string; name: string; avatarUrl: string | null };
   _count: { projectLinks: number };
};

const config = {
   documents: {
      title: 'Documents',
      description: 'Manage workspace and team documents',
      action: 'New document',
      empty: 'No documents',
   },
   initiatives: {
      title: 'Initiatives',
      description: 'Group projects into larger bodies of work',
      action: 'New initiative',
      empty: 'No initiatives',
   },
} as const;

const label = (value: string) =>
   value
      .split(/[-_]/)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ');

export default function WorkspaceFeatureSettings({ feature }: { feature: Feature }) {
   const { orgId } = useParams<{ orgId: string }>();
   const section = config[feature];
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
   const [initiatives, setInitiatives] = useState<WorkspaceInitiative[]>([]);
   const [members, setMembers] = useState<Member[]>([]);
   const [query, setQuery] = useState('');
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string>();
   const [dialogOpen, setDialogOpen] = useState(false);
   const [editingId, setEditingId] = useState<string>();
   const [name, setName] = useState('');
   const [description, setDescription] = useState('');
   const [status, setStatus] = useState('planned');
   const [priority, setPriority] = useState('none');
   const [health, setHealth] = useState('no-update');
   const [targetDate, setTargetDate] = useState('');
   const [ownerId, setOwnerId] = useState('');
   const [saving, setSaving] = useState(false);
   const [formError, setFormError] = useState<string>();

   const load = useCallback(async () => {
      setLoading(true);
      setLoadError(undefined);
      try {
         const { workspaceId: id } = await loadCurrentWorkspaceTeams();
         const [recordsResponse, membersResponse] = await Promise.all([
            authenticatedFetch(
               feature === 'documents'
                  ? `${api}/documents?${new URLSearchParams({ workspaceId: id }).toString()}`
                  : `${api}/initiatives?${new URLSearchParams({ workspaceId: id }).toString()}`,
               {}
            ),
            feature === 'initiatives'
               ? authenticatedFetch(`${api}/workspaces/${id}/members`)
               : Promise.resolve(undefined),
         ]);
         if (!recordsResponse.ok || (membersResponse && !membersResponse.ok)) {
            throw new Error(`Could not load ${section.title.toLowerCase()}.`);
         }
         const records = (await recordsResponse.json()) as { data: unknown };
         setWorkspaceId(id);
         if (feature === 'documents') {
            setDocuments(records.data as WorkspaceDocument[]);
         } else {
            setInitiatives(records.data as WorkspaceInitiative[]);
            setMembers(((await membersResponse!.json()) as { data: Member[] }).data);
         }
      } catch (caught) {
         setLoadError(
            caught instanceof Error
               ? caught.message
               : `Could not load ${section.title.toLowerCase()}.`
         );
      } finally {
         setLoading(false);
      }
   }, [feature, section.title]);

   useEffect(() => {
      void load();
   }, [load]);

   const resetForm = () => {
      setEditingId(undefined);
      setName('');
      setDescription('');
      setStatus('planned');
      setPriority('none');
      setHealth('no-update');
      setTargetDate('');
      setOwnerId('');
      setFormError(undefined);
   };

   const create = () => {
      resetForm();
      setDialogOpen(true);
   };

   const editDocument = (document: WorkspaceDocument) => {
      resetForm();
      setEditingId(document.id);
      setName(document.title);
      setDescription(document.content);
      setDialogOpen(true);
   };

   const editInitiative = (initiative: WorkspaceInitiative) => {
      resetForm();
      setEditingId(initiative.id);
      setName(initiative.name);
      setDescription(initiative.description ?? '');
      setStatus(initiative.status);
      setPriority(initiative.priority);
      setHealth(initiative.health);
      setTargetDate(initiative.targetDate?.slice(0, 10) ?? '');
      setOwnerId(initiative.owner.id);
      setDialogOpen(true);
   };

   const save = async () => {
      if (!workspaceId || name.trim().length < 2) {
         setFormError(
            `${feature === 'documents' ? 'Document title' : 'Initiative name'} must contain at least 2 characters.`
         );
         return;
      }
      setSaving(true);
      setFormError(undefined);
      try {
         const endpoint = editingId
            ? `${api}/${feature}/${editingId}?${new URLSearchParams({ workspaceId }).toString()}`
            : `${api}/${feature}`;
         const body =
            feature === 'documents'
               ? editingId
                  ? { title: name.trim(), content: description }
                  : { workspaceId, title: name.trim(), content: description }
               : {
                    ...(editingId ? {} : { workspaceId }),
                    name: name.trim(),
                    description: description.trim() || null,
                    status,
                    priority,
                    health,
                    targetDate: targetDate || null,
                    ...(ownerId ? { ownerId } : {}),
                 };
         const response = await authenticatedFetch(endpoint, {
            method: editingId ? 'PATCH' : 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string | string[];
            } | null;
            throw new Error(
               Array.isArray(payload?.message)
                  ? payload.message[0]
                  : (payload?.message ?? `Could not save ${feature.slice(0, -1)}.`)
            );
         }
         setDialogOpen(false);
         resetForm();
         await load();
      } catch (caught) {
         setFormError(
            caught instanceof Error ? caught.message : `Could not save ${feature.slice(0, -1)}.`
         );
      } finally {
         setSaving(false);
      }
   };

   const archive = async () => {
      if (!workspaceId || !editingId) return;
      setSaving(true);
      setFormError(undefined);
      try {
         const response = await authenticatedFetch(
            `${api}/${feature}/${editingId}?${new URLSearchParams({ workspaceId }).toString()}`,
            { method: 'DELETE' }
         );
         if (!response.ok) throw new Error(`Could not archive ${feature.slice(0, -1)}.`);
         setDialogOpen(false);
         resetForm();
         await load();
      } catch (caught) {
         setFormError(
            caught instanceof Error ? caught.message : `Could not archive ${feature.slice(0, -1)}.`
         );
      } finally {
         setSaving(false);
      }
   };

   const filteredDocuments = useMemo(
      () =>
         documents.filter((document) => document.title.toLowerCase().includes(query.toLowerCase())),
      [documents, query]
   );
   const filteredInitiatives = useMemo(
      () =>
         initiatives.filter((initiative) =>
            initiative.name.toLowerCase().includes(query.toLowerCase())
         ),
      [initiatives, query]
   );
   const isEmpty =
      feature === 'documents' ? filteredDocuments.length === 0 : filteredInitiatives.length === 0;

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-2xl font-medium">{section.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{section.description}</p>

            <div className="flex items-center justify-between gap-3 mt-6">
               <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by name..."
                  className="w-72 h-8"
               />
               <Button size="xs" onClick={create} disabled={!workspaceId}>
                  <Plus className="size-4" />
                  {section.action}
               </Button>
            </div>

            {loading && <p className="py-12 text-sm text-muted-foreground">Loading…</p>}
            {loadError && <p className="py-12 text-sm text-destructive">{loadError}</p>}
            {!loading && !loadError && isEmpty && (
               <div className="flex flex-col items-center justify-center gap-5 py-32">
                  <DashedSmiley />
                  <p className="text-sm text-muted-foreground">{section.empty}</p>
               </div>
            )}
            {!loading && !loadError && feature === 'documents' && filteredDocuments.length > 0 && (
               <div className="mt-6 overflow-hidden rounded-lg border divide-y">
                  {filteredDocuments.map((document) => (
                     <button
                        key={document.id}
                        type="button"
                        onClick={() => editDocument(document)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
                     >
                        <FileText className="size-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                           <p className="truncate text-sm font-medium">{document.title}</p>
                           <p className="text-xs text-muted-foreground">
                              {document.team ? document.team.name : 'Workspace document'} · Updated{' '}
                              {new Date(document.updatedAt).toLocaleDateString()}
                           </p>
                        </div>
                        <Avatar className="size-6">
                           <AvatarImage src={document.updatedBy.avatarUrl ?? undefined} />
                           <AvatarFallback>{document.updatedBy.name[0]}</AvatarFallback>
                        </Avatar>
                     </button>
                  ))}
               </div>
            )}
            {!loading &&
               !loadError &&
               feature === 'initiatives' &&
               filteredInitiatives.length > 0 && (
                  <div className="mt-6 overflow-hidden rounded-lg border divide-y">
                     {filteredInitiatives.map((initiative) => (
                        <div
                           key={initiative.id}
                           className="flex w-full items-center gap-3 px-4 py-3 hover:bg-accent/40"
                        >
                           <button
                              type="button"
                              onClick={() => editInitiative(initiative)}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                           >
                              <Compass className="size-4 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                 <p className="truncate text-sm font-medium">{initiative.name}</p>
                                 <p className="text-xs text-muted-foreground">
                                    {label(initiative.status)} · {initiative._count.projectLinks}{' '}
                                    projects
                                 </p>
                              </div>
                              <Avatar className="size-6">
                                 <AvatarImage src={initiative.owner.avatarUrl ?? undefined} />
                                 <AvatarFallback>{initiative.owner.name[0]}</AvatarFallback>
                              </Avatar>
                           </button>
                           <Link
                              href={`/${orgId}/initiative/${initiative.id}`}
                              className="text-xs text-muted-foreground hover:text-foreground"
                           >
                              Open
                           </Link>
                        </div>
                     ))}
                  </div>
               )}
         </div>

         <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>
                     {editingId ? `Edit ${feature.slice(0, -1)}` : section.action}
                  </DialogTitle>
                  <DialogDescription>
                     Changes are saved to the workspace backend immediately.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={name}
                     onChange={(event) => setName(event.target.value)}
                     placeholder={feature === 'documents' ? 'Document title' : 'Initiative name'}
                     autoFocus
                  />
                  <Textarea
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     placeholder={feature === 'documents' ? 'Start writing…' : 'Description'}
                     className={feature === 'documents' ? 'min-h-48' : undefined}
                  />
                  {feature === 'initiatives' && (
                     <>
                        <div className="grid grid-cols-3 gap-2">
                           <Select value={status} onValueChange={setStatus}>
                              <SelectTrigger>
                                 <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                 {['planned', 'active', 'completed', 'canceled'].map((value) => (
                                    <SelectItem key={value} value={value}>
                                       {label(value)}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                           <Select value={priority} onValueChange={setPriority}>
                              <SelectTrigger>
                                 <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                 {['none', 'low', 'medium', 'high', 'urgent'].map((value) => (
                                    <SelectItem key={value} value={value}>
                                       {label(value)}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                           <Select value={health} onValueChange={setHealth}>
                              <SelectTrigger>
                                 <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                 {['no-update', 'on-track', 'at-risk', 'off-track'].map((value) => (
                                    <SelectItem key={value} value={value}>
                                       {label(value)}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                           <Input
                              type="date"
                              value={targetDate}
                              onChange={(event) => setTargetDate(event.target.value)}
                              aria-label="Initiative target date"
                           />
                           <Select value={ownerId} onValueChange={setOwnerId}>
                              <SelectTrigger>
                                 <SelectValue placeholder="Owner" />
                              </SelectTrigger>
                              <SelectContent>
                                 {members.map((member) => (
                                    <SelectItem key={member.userId} value={member.userId}>
                                       {member.user.name}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                        </div>
                     </>
                  )}
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
               </div>
               <DialogFooter>
                  {editingId && (
                     <Button
                        variant="destructive"
                        onClick={() => void archive()}
                        disabled={saving}
                        className="mr-auto"
                     >
                        <Trash2 className="size-4" />
                        Archive
                     </Button>
                  )}
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                     Cancel
                  </Button>
                  <Button onClick={() => void save()} disabled={saving}>
                     {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
