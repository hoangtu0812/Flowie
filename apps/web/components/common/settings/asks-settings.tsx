'use client';

import {
   loadCurrentWorkspaceTeams,
   type WorkspaceTeam,
} from '@/components/common/teams/team-types';
import { authenticatedFetch } from '@/lib/workspaces';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { Archive, CircleHelp, ListPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashedSmiley } from './settings-placeholder';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type AskStatus = 'open' | 'accepted' | 'declined';
type Project = {
   id: string;
   name: string;
   identifier: string;
   team: { id: string } | null;
};
type Ask = {
   id: string;
   teamId: string;
   projectId: string | null;
   title: string;
   description: string | null;
   priority: Priority;
   status: AskStatus;
   team: { id: string; name: string; identifier: string; icon: string | null };
   project: Project | null;
   createdBy: { id: string; name: string; avatarUrl: string | null };
   convertedIssue: { id: string; identifier: string; title: string } | null;
};

const priorityLabels: Record<Priority, string> = {
   NONE: 'No priority',
   LOW: 'Low',
   MEDIUM: 'Medium',
   HIGH: 'High',
   URGENT: 'Urgent',
};
const statusLabels: Record<AskStatus, string> = {
   open: 'Open',
   accepted: 'Accepted',
   declined: 'Declined',
};

function errorMessage(payload: unknown, fallback: string) {
   const message = (payload as { message?: string | string[] } | null)?.message;
   return Array.isArray(message) ? message[0] : (message ?? fallback);
}

/** Original Asks settings shell backed by requests that convert through the real Issue service. */
export default function AsksSettings() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
   const [projects, setProjects] = useState<Project[]>([]);
   const [asks, setAsks] = useState<Ask[]>([]);
   const [filter, setFilter] = useState('');
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string>();
   const [open, setOpen] = useState(false);
   const [editingId, setEditingId] = useState<string>();
   const [title, setTitle] = useState('');
   const [description, setDescription] = useState('');
   const [teamId, setTeamId] = useState('');
   const [projectId, setProjectId] = useState('');
   const [priority, setPriority] = useState<Priority>('NONE');
   const [status, setStatus] = useState<AskStatus>('open');
   const [convertedIssue, setConvertedIssue] = useState<Ask['convertedIssue']>(null);
   const [saving, setSaving] = useState(false);
   const [formError, setFormError] = useState<string>();

   const load = useCallback(async () => {
      setLoading(true);
      setLoadError(undefined);
      try {
         const workspace = await loadCurrentWorkspaceTeams();
         const query = new URLSearchParams({ workspaceId: workspace.workspaceId });
         const [askResponse, projectResponse] = await Promise.all([
            authenticatedFetch(`${api}/asks?${query}`),
            authenticatedFetch(`${api}/projects?${query}`),
         ]);
         if (!askResponse.ok || !projectResponse.ok) throw new Error('Could not load Asks.');
         setWorkspaceId(workspace.workspaceId);
         setTeams(workspace.teams);
         setAsks(((await askResponse.json()) as { data: Ask[] }).data);
         setProjects(((await projectResponse.json()) as { data: Project[] }).data);
      } catch (caught) {
         setLoadError(caught instanceof Error ? caught.message : 'Could not load Asks.');
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void load();
   }, [load]);

   const visibleAsks = useMemo(() => {
      const value = filter.trim().toLowerCase();
      if (!value) return asks;
      return asks.filter(
         (ask) =>
            ask.title.toLowerCase().includes(value) ||
            ask.team.name.toLowerCase().includes(value) ||
            ask.project?.name.toLowerCase().includes(value) ||
            ask.convertedIssue?.identifier.toLowerCase().includes(value)
      );
   }, [asks, filter]);
   const availableProjects = useMemo(
      () => projects.filter((project) => !project.team || project.team.id === teamId),
      [projects, teamId]
   );

   const reset = () => {
      setEditingId(undefined);
      setTitle('');
      setDescription('');
      setTeamId(teams[0]?.id ?? '');
      setProjectId('');
      setPriority('NONE');
      setStatus('open');
      setConvertedIssue(null);
      setFormError(undefined);
   };
   const openCreate = () => {
      reset();
      setOpen(true);
   };
   const openEdit = (ask: Ask) => {
      setEditingId(ask.id);
      setTitle(ask.title);
      setDescription(ask.description ?? '');
      setTeamId(ask.teamId);
      setProjectId(ask.projectId ?? '');
      setPriority(ask.priority);
      setStatus(ask.status);
      setConvertedIssue(ask.convertedIssue);
      setFormError(undefined);
      setOpen(true);
   };

   const save = async () => {
      if (!workspaceId || !teamId || title.trim().length < 2) {
         setFormError('Title and target team are required.');
         return;
      }
      setSaving(true);
      setFormError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await authenticatedFetch(
            editingId ? `${api}/asks/${editingId}?${query}` : `${api}/asks`,
            {
               method: editingId ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(editingId ? {} : { workspaceId }),
                  teamId,
                  projectId: projectId || null,
                  title: title.trim(),
                  description: description.trim() || null,
                  priority,
                  ...(editingId ? { status } : {}),
               }),
            }
         );
         if (!response.ok) {
            throw new Error(
               errorMessage(await response.json().catch(() => null), 'Could not save Ask.')
            );
         }
         setOpen(false);
         await load();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not save Ask.');
      } finally {
         setSaving(false);
      }
   };

   const convert = async () => {
      if (!workspaceId || !editingId) return;
      setSaving(true);
      setFormError(undefined);
      try {
         const response = await authenticatedFetch(
            `${api}/asks/${editingId}/convert?${new URLSearchParams({ workspaceId })}`,
            { method: 'POST', credentials: 'include' }
         );
         if (!response.ok) {
            throw new Error(
               errorMessage(await response.json().catch(() => null), 'Could not create issue.')
            );
         }
         const converted = ((await response.json()) as { data: Ask }).data;
         setStatus(converted.status);
         setConvertedIssue(converted.convertedIssue);
         await load();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not create issue.');
      } finally {
         setSaving(false);
      }
   };

   const archive = async () => {
      if (!workspaceId || !editingId) return;
      setSaving(true);
      try {
         const response = await authenticatedFetch(
            `${api}/asks/${editingId}?${new URLSearchParams({ workspaceId })}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not archive Ask.');
         setOpen(false);
         await load();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not archive Ask.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-2xl font-medium">Asks</h1>
            <p className="text-sm text-muted-foreground mt-1">
               Turn requests into actionable issues
            </p>
            <div className="flex items-center justify-between gap-3 mt-6">
               <Input
                  placeholder="Filter by name..."
                  className="w-72 h-8"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
               />
               <Button size="xs" onClick={openCreate} disabled={!workspaceId || teams.length === 0}>
                  New Ask
               </Button>
            </div>

            {loading && <p className="py-12 text-sm text-muted-foreground">Loading Asks…</p>}
            {loadError && <p className="py-12 text-sm text-destructive">{loadError}</p>}
            {!loading && !loadError && visibleAsks.length === 0 && (
               <div className="flex flex-col items-center justify-center gap-5 py-32">
                  <DashedSmiley />
                  <p className="text-sm text-muted-foreground">
                     {asks.length === 0 ? 'No asks' : 'No matching asks'}
                  </p>
               </div>
            )}
            {!loading && !loadError && visibleAsks.length > 0 && (
               <div className="mt-5 overflow-hidden rounded-lg border bg-container divide-y">
                  {visibleAsks.map((ask) => (
                     <button
                        key={ask.id}
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
                        onClick={() => openEdit(ask)}
                     >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
                           <CircleHelp className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                           <span className="block truncate text-sm font-medium">{ask.title}</span>
                           <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {ask.team.name}
                              {ask.project ? ` · ${ask.project.name}` : ''}
                           </span>
                        </span>
                        {ask.convertedIssue && (
                           <span className="text-xs text-muted-foreground">
                              {ask.convertedIssue.identifier}
                           </span>
                        )}
                        {ask.priority !== 'NONE' && (
                           <span className="hidden text-xs text-muted-foreground sm:block">
                              {priorityLabels[ask.priority]}
                           </span>
                        )}
                        <Badge variant="outline" className="px-2 py-0.5 font-normal">
                           {statusLabels[ask.status]}
                        </Badge>
                     </button>
                  ))}
               </div>
            )}
         </div>

         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[620px]">
               <DialogHeader>
                  <DialogTitle>{editingId ? 'Edit Ask' : 'New Ask'}</DialogTitle>
                  <DialogDescription>
                     Capture a request now and convert it into a real issue when ready.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={title}
                     onChange={(event) => setTitle(event.target.value)}
                     placeholder="What is being requested?"
                     autoFocus
                     disabled={Boolean(convertedIssue)}
                  />
                  <Textarea
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     placeholder="Description"
                     disabled={Boolean(convertedIssue)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                     <select
                        value={teamId}
                        onChange={(event) => {
                           setTeamId(event.target.value);
                           setProjectId('');
                        }}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Target team"
                        disabled={Boolean(convertedIssue)}
                     >
                        {teams.map((team) => (
                           <option key={team.id} value={team.id}>
                              {team.name}
                           </option>
                        ))}
                     </select>
                     <select
                        value={projectId}
                        onChange={(event) => setProjectId(event.target.value)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Project"
                        disabled={Boolean(convertedIssue)}
                     >
                        <option value="">No linked project</option>
                        {availableProjects.map((project) => (
                           <option key={project.id} value={project.id}>
                              {project.name}
                           </option>
                        ))}
                     </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                     <select
                        value={priority}
                        onChange={(event) => setPriority(event.target.value as Priority)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Priority"
                        disabled={Boolean(convertedIssue)}
                     >
                        {Object.entries(priorityLabels).map(([value, label]) => (
                           <option key={value} value={value}>
                              {label}
                           </option>
                        ))}
                     </select>
                     <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value as AskStatus)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Status"
                        disabled={Boolean(convertedIssue)}
                     >
                        <option value="open">Open</option>
                        <option value="declined">Declined</option>
                        {convertedIssue && <option value="accepted">Accepted</option>}
                     </select>
                  </div>
                  {convertedIssue && (
                     <div className="rounded-md border px-3 py-2 text-sm">
                        Created issue{' '}
                        <span className="font-medium">{convertedIssue.identifier}</span> ·{' '}
                        {convertedIssue.title}
                     </div>
                  )}
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
               </div>
               <DialogFooter className="sm:justify-between">
                  {editingId ? (
                     <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => void archive()}
                        disabled={saving}
                     >
                        <Archive className="size-4" />
                        Archive
                     </Button>
                  ) : (
                     <span />
                  )}
                  <div className="flex items-center gap-2">
                     {editingId && !convertedIssue && status !== 'declined' && (
                        <Button
                           size="sm"
                           variant="outline"
                           onClick={() => void convert()}
                           disabled={saving}
                        >
                           <ListPlus className="size-4" />
                           Create issue
                        </Button>
                     )}
                     {!convertedIssue && (
                        <Button size="sm" onClick={() => void save()} disabled={saving}>
                           {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create Ask'}
                        </Button>
                     )}
                  </div>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
