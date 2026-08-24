'use client';

import { loadCurrentWorkspaceTeams } from '@/components/common/teams/team-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Archive, CalendarDays, Package } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashedSmiley } from './settings-placeholder';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type Project = { id: string; name: string; identifier: string };
type ReleaseStatus = 'planned' | 'in-progress' | 'released' | 'canceled';
type Release = {
   id: string;
   name: string;
   version: string;
   description: string | null;
   status: ReleaseStatus;
   targetDate: string | null;
   releasedAt: string | null;
   updatedAt: string;
   createdBy: { id: string; name: string; avatarUrl: string | null };
   projectLinks: Array<{ project: Project }>;
};

const statusLabels: Record<ReleaseStatus, string> = {
   'planned': 'Planned',
   'in-progress': 'In progress',
   'released': 'Released',
   'canceled': 'Canceled',
};

function errorMessage(payload: unknown, fallback: string) {
   const message = (payload as { message?: string | string[] } | null)?.message;
   return Array.isArray(message) ? message[0] : (message ?? fallback);
}

/** The original Releases settings shell, now backed by persisted workspace releases. */
export default function ReleasesSettings() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [releases, setReleases] = useState<Release[]>([]);
   const [projects, setProjects] = useState<Project[]>([]);
   const [filter, setFilter] = useState('');
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string>();
   const [open, setOpen] = useState(false);
   const [editingId, setEditingId] = useState<string>();
   const [name, setName] = useState('');
   const [version, setVersion] = useState('');
   const [description, setDescription] = useState('');
   const [status, setStatus] = useState<ReleaseStatus>('planned');
   const [targetDate, setTargetDate] = useState('');
   const [projectIds, setProjectIds] = useState<string[]>([]);
   const [saving, setSaving] = useState(false);
   const [formError, setFormError] = useState<string>();

   const load = useCallback(async () => {
      setLoading(true);
      setLoadError(undefined);
      try {
         const { workspaceId: id } = await loadCurrentWorkspaceTeams();
         const query = new URLSearchParams({ workspaceId: id });
         const [releaseResponse, projectResponse] = await Promise.all([
            fetch(`${api}/releases?${query}`, { credentials: 'include' }),
            fetch(`${api}/projects?${query}`, { credentials: 'include' }),
         ]);
         if (!releaseResponse.ok || !projectResponse.ok) {
            throw new Error('Could not load releases.');
         }
         setWorkspaceId(id);
         setReleases(((await releaseResponse.json()) as { data: Release[] }).data);
         setProjects(((await projectResponse.json()) as { data: Project[] }).data);
      } catch (caught) {
         setLoadError(caught instanceof Error ? caught.message : 'Could not load releases.');
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void load();
   }, [load]);

   const visibleReleases = useMemo(() => {
      const value = filter.trim().toLowerCase();
      if (!value) return releases;
      return releases.filter(
         (release) =>
            release.name.toLowerCase().includes(value) ||
            release.version.toLowerCase().includes(value) ||
            statusLabels[release.status].toLowerCase().includes(value) ||
            release.projectLinks.some((link) => link.project.name.toLowerCase().includes(value))
      );
   }, [filter, releases]);

   const reset = () => {
      setEditingId(undefined);
      setName('');
      setVersion('');
      setDescription('');
      setStatus('planned');
      setTargetDate('');
      setProjectIds([]);
      setFormError(undefined);
   };

   const openCreate = () => {
      reset();
      setOpen(true);
   };

   const openEdit = (release: Release) => {
      reset();
      setEditingId(release.id);
      setName(release.name);
      setVersion(release.version);
      setDescription(release.description ?? '');
      setStatus(release.status);
      setTargetDate(release.targetDate?.slice(0, 10) ?? '');
      setProjectIds(release.projectLinks.map((link) => link.project.id));
      setOpen(true);
   };

   const save = async () => {
      if (!workspaceId || name.trim().length < 2 || !version.trim()) {
         setFormError('Release name and version are required.');
         return;
      }
      setSaving(true);
      setFormError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(
            editingId ? `${api}/releases/${editingId}?${query}` : `${api}/releases`,
            {
               method: editingId ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(editingId ? {} : { workspaceId }),
                  name: name.trim(),
                  version: version.trim(),
                  description: description.trim() || null,
                  status,
                  targetDate: targetDate || null,
                  projectIds,
               }),
            }
         );
         if (!response.ok) {
            throw new Error(
               errorMessage(await response.json().catch(() => null), 'Could not save release.')
            );
         }
         setOpen(false);
         reset();
         await load();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not save release.');
      } finally {
         setSaving(false);
      }
   };

   const archive = async () => {
      if (!workspaceId || !editingId) return;
      setSaving(true);
      setFormError(undefined);
      try {
         const response = await fetch(
            `${api}/releases/${editingId}?${new URLSearchParams({ workspaceId })}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) {
            throw new Error(
               errorMessage(await response.json().catch(() => null), 'Could not archive release.')
            );
         }
         setOpen(false);
         reset();
         await load();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not archive release.');
      } finally {
         setSaving(false);
      }
   };

   const toggleProject = (projectId: string, checked: boolean) => {
      setProjectIds((current) =>
         checked ? [...current, projectId] : current.filter((id) => id !== projectId)
      );
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-2xl font-medium">Releases</h1>

            <div className="flex items-center justify-between gap-3 mt-6">
               <Input
                  placeholder="Filter by name..."
                  className="w-72 h-8"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
               />
               <Button size="xs" onClick={openCreate} disabled={!workspaceId}>
                  New release
               </Button>
            </div>

            {loading && <p className="py-12 text-sm text-muted-foreground">Loading releases…</p>}
            {loadError && <p className="py-12 text-sm text-destructive">{loadError}</p>}
            {!loading && !loadError && visibleReleases.length === 0 && (
               <div className="flex flex-col items-center justify-center gap-5 py-32">
                  <DashedSmiley />
                  <p className="text-sm text-muted-foreground">
                     {releases.length === 0 ? 'No releases' : 'No matching releases'}
                  </p>
               </div>
            )}
            {!loading && !loadError && visibleReleases.length > 0 && (
               <div className="mt-5 overflow-hidden rounded-lg border bg-container divide-y">
                  {visibleReleases.map((release) => (
                     <button
                        type="button"
                        key={release.id}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
                        onClick={() => openEdit(release)}
                     >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
                           <Package className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                           <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{release.name}</span>
                              <span className="text-xs text-muted-foreground">
                                 {release.version}
                              </span>
                           </span>
                           <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {release.projectLinks.length === 0
                                 ? 'No linked projects'
                                 : release.projectLinks.map((link) => link.project.name).join(', ')}
                           </span>
                        </span>
                        {release.targetDate && (
                           <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                              <CalendarDays className="size-3.5" />
                              {new Date(release.targetDate).toLocaleDateString()}
                           </span>
                        )}
                        <Badge variant="outline" className="px-2 py-0.5 font-normal">
                           {statusLabels[release.status]}
                        </Badge>
                     </button>
                  ))}
               </div>
            )}
         </div>

         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[620px]">
               <DialogHeader>
                  <DialogTitle>{editingId ? 'Edit release' : 'New release'}</DialogTitle>
                  <DialogDescription>
                     Group workspace projects into a planned or completed release.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <div className="grid grid-cols-[1fr_160px] gap-2">
                     <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Release name"
                        autoFocus
                     />
                     <Input
                        value={version}
                        onChange={(event) => setVersion(event.target.value)}
                        placeholder="Version"
                     />
                  </div>
                  <Textarea
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     placeholder="Description"
                  />
                  <div className="grid grid-cols-2 gap-2">
                     <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value as ReleaseStatus)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                     >
                        {Object.entries(statusLabels).map(([value, label]) => (
                           <option key={value} value={value}>
                              {label}
                           </option>
                        ))}
                     </select>
                     <Input
                        type="date"
                        value={targetDate}
                        onChange={(event) => setTargetDate(event.target.value)}
                        aria-label="Target date"
                     />
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-md border p-3">
                     <p className="mb-2 text-xs font-medium">Projects</p>
                     {projects.length === 0 && (
                        <p className="text-xs text-muted-foreground">No projects available.</p>
                     )}
                     <div className="space-y-2">
                        {projects.map((project) => (
                           <label key={project.id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                 checked={projectIds.includes(project.id)}
                                 onCheckedChange={(checked) =>
                                    toggleProject(project.id, checked === true)
                                 }
                              />
                              <span className="truncate">{project.name}</span>
                              <span className="ml-auto text-xs text-muted-foreground">
                                 {project.identifier}
                              </span>
                           </label>
                        ))}
                     </div>
                  </div>
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
                  <Button size="sm" onClick={() => void save()} disabled={saving}>
                     {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create release'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
