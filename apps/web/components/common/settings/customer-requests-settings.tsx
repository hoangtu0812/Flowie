'use client';

import { loadCurrentWorkspaceTeams } from '@/components/common/teams/team-types';
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
import { Archive, HeartHandshake, Link2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashedSmiley } from './settings-placeholder';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type RequestStatus = 'open' | 'planned' | 'in-progress' | 'completed' | 'declined';
type RequestPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';
type RequestSource = 'manual' | 'interview' | 'support' | 'sales' | 'other';
type Project = { id: string; name: string; identifier: string };
type Issue = { id: string; identifier: string; title: string };
type CustomerRequest = {
   id: string;
   title: string;
   description: string | null;
   customer: string;
   source: RequestSource;
   status: RequestStatus;
   priority: RequestPriority;
   projectId: string | null;
   issueId: string | null;
   project: Project | null;
   issue: Issue | null;
   createdBy: { id: string; name: string; avatarUrl: string | null };
   updatedAt: string;
};

const statusLabels: Record<RequestStatus, string> = {
   'open': 'Open',
   'planned': 'Planned',
   'in-progress': 'In progress',
   'completed': 'Completed',
   'declined': 'Declined',
};
const priorityLabels: Record<RequestPriority, string> = {
   none: 'No priority',
   low: 'Low',
   medium: 'Medium',
   high: 'High',
   urgent: 'Urgent',
};
const sourceLabels: Record<RequestSource, string> = {
   manual: 'Manual',
   interview: 'Interview',
   support: 'Support',
   sales: 'Sales',
   other: 'Other',
};

function errorMessage(payload: unknown, fallback: string) {
   const message = (payload as { message?: string | string[] } | null)?.message;
   return Array.isArray(message) ? message[0] : (message ?? fallback);
}

/** Original Customer Requests settings shell backed by workspace-owned records. */
export default function CustomerRequestsSettings() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [requests, setRequests] = useState<CustomerRequest[]>([]);
   const [projects, setProjects] = useState<Project[]>([]);
   const [issues, setIssues] = useState<Issue[]>([]);
   const [filter, setFilter] = useState('');
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string>();
   const [open, setOpen] = useState(false);
   const [editingId, setEditingId] = useState<string>();
   const [title, setTitle] = useState('');
   const [description, setDescription] = useState('');
   const [customer, setCustomer] = useState('');
   const [source, setSource] = useState<RequestSource>('manual');
   const [status, setStatus] = useState<RequestStatus>('open');
   const [priority, setPriority] = useState<RequestPriority>('none');
   const [projectId, setProjectId] = useState('');
   const [issueId, setIssueId] = useState('');
   const [saving, setSaving] = useState(false);
   const [formError, setFormError] = useState<string>();

   const load = useCallback(async () => {
      setLoading(true);
      setLoadError(undefined);
      try {
         const { workspaceId: id } = await loadCurrentWorkspaceTeams();
         const query = new URLSearchParams({ workspaceId: id });
         const [requestResponse, projectResponse, issueResponse] = await Promise.all([
            fetch(`${api}/customer-requests?${query}`, { credentials: 'include' }),
            fetch(`${api}/projects?${query}`, { credentials: 'include' }),
            fetch(`${api}/issues?${query}`, { credentials: 'include' }),
         ]);
         if (!requestResponse.ok || !projectResponse.ok || !issueResponse.ok) {
            throw new Error('Could not load customer requests.');
         }
         setWorkspaceId(id);
         setRequests(((await requestResponse.json()) as { data: CustomerRequest[] }).data);
         setProjects(((await projectResponse.json()) as { data: Project[] }).data);
         setIssues(((await issueResponse.json()) as { data: Issue[] }).data);
      } catch (caught) {
         setLoadError(
            caught instanceof Error ? caught.message : 'Could not load customer requests.'
         );
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void load();
   }, [load]);

   const visibleRequests = useMemo(() => {
      const value = filter.trim().toLowerCase();
      if (!value) return requests;
      return requests.filter(
         (request) =>
            request.title.toLowerCase().includes(value) ||
            request.customer.toLowerCase().includes(value) ||
            request.project?.name.toLowerCase().includes(value) ||
            request.issue?.identifier.toLowerCase().includes(value)
      );
   }, [filter, requests]);

   const reset = () => {
      setEditingId(undefined);
      setTitle('');
      setDescription('');
      setCustomer('');
      setSource('manual');
      setStatus('open');
      setPriority('none');
      setProjectId('');
      setIssueId('');
      setFormError(undefined);
   };
   const openCreate = () => {
      reset();
      setOpen(true);
   };
   const openEdit = (request: CustomerRequest) => {
      reset();
      setEditingId(request.id);
      setTitle(request.title);
      setDescription(request.description ?? '');
      setCustomer(request.customer);
      setSource(request.source);
      setStatus(request.status);
      setPriority(request.priority);
      setProjectId(request.projectId ?? '');
      setIssueId(request.issueId ?? '');
      setOpen(true);
   };

   const save = async () => {
      if (!workspaceId || title.trim().length < 2 || !customer.trim()) {
         setFormError('Request title and customer are required.');
         return;
      }
      setSaving(true);
      setFormError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(
            editingId
               ? `${api}/customer-requests/${editingId}?${query}`
               : `${api}/customer-requests`,
            {
               method: editingId ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(editingId ? {} : { workspaceId }),
                  title: title.trim(),
                  description: description.trim() || null,
                  customer: customer.trim(),
                  source,
                  status,
                  priority,
                  projectId: projectId || null,
                  issueId: issueId || null,
               }),
            }
         );
         if (!response.ok) {
            throw new Error(
               errorMessage(
                  await response.json().catch(() => null),
                  'Could not save customer request.'
               )
            );
         }
         setOpen(false);
         reset();
         await load();
      } catch (caught) {
         setFormError(
            caught instanceof Error ? caught.message : 'Could not save customer request.'
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
         const response = await fetch(
            `${api}/customer-requests/${editingId}?${new URLSearchParams({ workspaceId })}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) {
            throw new Error(
               errorMessage(
                  await response.json().catch(() => null),
                  'Could not archive customer request.'
               )
            );
         }
         setOpen(false);
         reset();
         await load();
      } catch (caught) {
         setFormError(
            caught instanceof Error ? caught.message : 'Could not archive customer request.'
         );
      } finally {
         setSaving(false);
      }
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-2xl font-medium">Customer requests</h1>
            <p className="text-sm text-muted-foreground mt-1">
               Track and manage customer requests alongside your team’s work
            </p>

            <div className="flex items-center justify-between gap-3 mt-6">
               <Input
                  placeholder="Filter by name..."
                  className="w-72 h-8"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
               />
               <Button size="xs" onClick={openCreate} disabled={!workspaceId}>
                  New request
               </Button>
            </div>

            {loading && (
               <p className="py-12 text-sm text-muted-foreground">Loading customer requests…</p>
            )}
            {loadError && <p className="py-12 text-sm text-destructive">{loadError}</p>}
            {!loading && !loadError && visibleRequests.length === 0 && (
               <div className="flex flex-col items-center justify-center gap-5 py-32">
                  <DashedSmiley />
                  <p className="text-sm text-muted-foreground">
                     {requests.length === 0 ? 'No customer requests' : 'No matching requests'}
                  </p>
               </div>
            )}
            {!loading && !loadError && visibleRequests.length > 0 && (
               <div className="mt-5 overflow-hidden rounded-lg border bg-container divide-y">
                  {visibleRequests.map((request) => (
                     <button
                        key={request.id}
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
                        onClick={() => openEdit(request)}
                     >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
                           <HeartHandshake className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                           <span className="block truncate text-sm font-medium">
                              {request.title}
                           </span>
                           <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {request.customer} · {sourceLabels[request.source]}
                           </span>
                        </span>
                        {(request.project || request.issue) && (
                           <span className="hidden max-w-44 items-center gap-1 truncate text-xs text-muted-foreground sm:flex">
                              <Link2 className="size-3.5 shrink-0" />
                              {request.issue?.identifier ?? request.project?.name}
                           </span>
                        )}
                        {request.priority !== 'none' && (
                           <span className="hidden text-xs text-muted-foreground md:block">
                              {priorityLabels[request.priority]}
                           </span>
                        )}
                        <Badge variant="outline" className="px-2 py-0.5 font-normal">
                           {statusLabels[request.status]}
                        </Badge>
                     </button>
                  ))}
               </div>
            )}
         </div>

         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[640px]">
               <DialogHeader>
                  <DialogTitle>{editingId ? 'Edit customer request' : 'New request'}</DialogTitle>
                  <DialogDescription>
                     Capture customer demand and link it to the work your team is tracking.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={title}
                     onChange={(event) => setTitle(event.target.value)}
                     placeholder="Request title"
                     autoFocus
                  />
                  <Input
                     value={customer}
                     onChange={(event) => setCustomer(event.target.value)}
                     placeholder="Customer or account"
                  />
                  <Textarea
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     placeholder="Description"
                  />
                  <div className="grid grid-cols-3 gap-2">
                     <select
                        value={source}
                        onChange={(event) => setSource(event.target.value as RequestSource)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Source"
                     >
                        {Object.entries(sourceLabels).map(([value, label]) => (
                           <option key={value} value={value}>
                              {label}
                           </option>
                        ))}
                     </select>
                     <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value as RequestStatus)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Status"
                     >
                        {Object.entries(statusLabels).map(([value, label]) => (
                           <option key={value} value={value}>
                              {label}
                           </option>
                        ))}
                     </select>
                     <select
                        value={priority}
                        onChange={(event) => setPriority(event.target.value as RequestPriority)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Priority"
                     >
                        {Object.entries(priorityLabels).map(([value, label]) => (
                           <option key={value} value={value}>
                              {label}
                           </option>
                        ))}
                     </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                     <select
                        value={projectId}
                        onChange={(event) => setProjectId(event.target.value)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Project"
                     >
                        <option value="">No linked project</option>
                        {projects.map((project) => (
                           <option key={project.id} value={project.id}>
                              {project.name}
                           </option>
                        ))}
                     </select>
                     <select
                        value={issueId}
                        onChange={(event) => setIssueId(event.target.value)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Issue"
                     >
                        <option value="">No linked issue</option>
                        {issues.map((issue) => (
                           <option key={issue.id} value={issue.id}>
                              {issue.identifier} · {issue.title}
                           </option>
                        ))}
                     </select>
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
                     {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create request'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
