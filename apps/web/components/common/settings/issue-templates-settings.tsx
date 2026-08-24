'use client';

import { loadCurrentWorkspaceTeams } from '@/components/common/teams/team-types';
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
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type Option = { id: string; name: string };
type Template = {
   id: string;
   name: string;
   description: string | null;
   title: string;
   issueDescription: string | null;
   statusId: string | null;
   priority: string;
   projectId: string | null;
   assigneeId: string | null;
   labelIds: string[];
   updatedAt: string;
   createdBy: { id: string; name: string };
};
type Options = {
   statuses: Option[];
   projects: Option[];
   members: Option[];
   labels: Array<Option & { color: string }>;
};
const emptyOptions: Options = { statuses: [], projects: [], members: [], labels: [] };

/** Original Issue Templates settings layout backed by persisted workspace templates. */
export default function IssueTemplatesSettings() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [templates, setTemplates] = useState<Template[]>([]);
   const [options, setOptions] = useState<Options>(emptyOptions);
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string>();
   const [open, setOpen] = useState(false);
   const [editingId, setEditingId] = useState<string>();
   const [name, setName] = useState('');
   const [description, setDescription] = useState('');
   const [title, setTitle] = useState('');
   const [issueDescription, setIssueDescription] = useState('');
   const [statusId, setStatusId] = useState('');
   const [priority, setPriority] = useState('NONE');
   const [projectId, setProjectId] = useState('');
   const [assigneeId, setAssigneeId] = useState('');
   const [labelIds, setLabelIds] = useState<string[]>([]);
   const [saving, setSaving] = useState(false);
   const [formError, setFormError] = useState<string>();

   const load = useCallback(async () => {
      setLoading(true);
      setLoadError(undefined);
      try {
         const { workspaceId: id } = await loadCurrentWorkspaceTeams();
         const query = new URLSearchParams({ workspaceId: id });
         const [templatesResponse, optionsResponse] = await Promise.all([
            fetch(`${api}/issues/templates?${query}`, { credentials: 'include' }),
            fetch(`${api}/issues/options?${query}`, { credentials: 'include' }),
         ]);
         if (!templatesResponse.ok || !optionsResponse.ok) {
            throw new Error('Could not load issue templates.');
         }
         setWorkspaceId(id);
         setTemplates(((await templatesResponse.json()) as { data: Template[] }).data);
         setOptions(((await optionsResponse.json()) as { data: Options }).data);
      } catch (caught) {
         setLoadError(caught instanceof Error ? caught.message : 'Could not load issue templates.');
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void load();
   }, [load]);

   const reset = () => {
      setEditingId(undefined);
      setName('');
      setDescription('');
      setTitle('');
      setIssueDescription('');
      setStatusId('');
      setPriority('NONE');
      setProjectId('');
      setAssigneeId('');
      setLabelIds([]);
      setFormError(undefined);
   };
   const openCreate = () => {
      reset();
      setOpen(true);
   };
   const openEdit = (template: Template) => {
      reset();
      setEditingId(template.id);
      setName(template.name);
      setDescription(template.description ?? '');
      setTitle(template.title);
      setIssueDescription(template.issueDescription ?? '');
      setStatusId(template.statusId ?? '');
      setPriority(template.priority);
      setProjectId(template.projectId ?? '');
      setAssigneeId(template.assigneeId ?? '');
      setLabelIds(template.labelIds);
      setOpen(true);
   };

   const save = async () => {
      if (!workspaceId || name.trim().length < 2 || title.trim().length < 2) {
         setFormError('Template name and issue title must contain at least 2 characters.');
         return;
      }
      setSaving(true);
      setFormError(undefined);
      try {
         const response = await fetch(
            editingId
               ? `${api}/issues/templates/${editingId}?${new URLSearchParams({ workspaceId }).toString()}`
               : `${api}/issues/templates`,
            {
               method: editingId ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(editingId ? {} : { workspaceId }),
                  name: name.trim(),
                  description: description.trim() || null,
                  title: title.trim(),
                  issueDescription: issueDescription.trim() || null,
                  statusId: statusId || null,
                  priority,
                  projectId: projectId || null,
                  assigneeId: assigneeId || null,
                  labelIds,
               }),
            }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string | string[];
            } | null;
            throw new Error(
               Array.isArray(payload?.message)
                  ? payload.message[0]
                  : (payload?.message ?? 'Could not save issue template.')
            );
         }
         setOpen(false);
         reset();
         await load();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not save issue template.');
      } finally {
         setSaving(false);
      }
   };

   const remove = async () => {
      if (!workspaceId || !editingId) return;
      setSaving(true);
      setFormError(undefined);
      try {
         const response = await fetch(
            `${api}/issues/templates/${editingId}?${new URLSearchParams({ workspaceId }).toString()}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not delete issue template.');
         setOpen(false);
         reset();
         await load();
      } catch (caught) {
         setFormError(
            caught instanceof Error ? caught.message : 'Could not delete issue template.'
         );
      } finally {
         setSaving(false);
      }
   };

   return (
      <SettingsShell
         title="Issue templates"
         description="These templates are available when creating issues for any team in the workspace. To create templates that only apply to specific teams, add them as team templates."
      >
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title={`${templates.length} issue templates`}
                  trailing={
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={openCreate}
                        disabled={!workspaceId}
                     >
                        <Plus className="size-4" />
                     </Button>
                  }
               />
               {loading && <SettingsRow title="Loading issue templates…" muted />}
               {loadError && <SettingsRow title={loadError} muted />}
               {!loading && !loadError && templates.length === 0 && (
                  <SettingsRow title="No issue templates configured" muted />
               )}
               {templates.map((template) => (
                  <SettingsRow
                     key={template.id}
                     icon={<FileText className="size-4" />}
                     title={template.name}
                     description={`Created by ${template.createdBy.name} · Updated ${new Date(template.updatedAt).toLocaleDateString()}`}
                     onClick={() => openEdit(template)}
                  />
               ))}
            </SettingsCard>
         </SettingsSection>

         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[620px]">
               <DialogHeader>
                  <DialogTitle>
                     {editingId ? 'Edit issue template' : 'New issue template'}
                  </DialogTitle>
                  <DialogDescription>
                     Configure the fields applied by the original Create Issue dialog.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={name}
                     onChange={(event) => setName(event.target.value)}
                     placeholder="Template name"
                     autoFocus
                  />
                  <Input
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     placeholder="Template description"
                  />
                  <Input
                     value={title}
                     onChange={(event) => setTitle(event.target.value)}
                     placeholder="Default issue title"
                  />
                  <Textarea
                     value={issueDescription}
                     onChange={(event) => setIssueDescription(event.target.value)}
                     placeholder="Default issue description"
                  />
                  <div className="grid grid-cols-2 gap-2">
                     <select
                        value={statusId}
                        onChange={(event) => setStatusId(event.target.value)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                     >
                        <option value="">Default status</option>
                        {options.statuses.map((option) => (
                           <option key={option.id} value={option.id}>
                              {option.name}
                           </option>
                        ))}
                     </select>
                     <select
                        value={priority}
                        onChange={(event) => setPriority(event.target.value)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                     >
                        {['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((value) => (
                           <option key={value} value={value}>
                              {value.toLowerCase()}
                           </option>
                        ))}
                     </select>
                     <select
                        value={projectId}
                        onChange={(event) => setProjectId(event.target.value)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                     >
                        <option value="">No project</option>
                        {options.projects.map((option) => (
                           <option key={option.id} value={option.id}>
                              {option.name}
                           </option>
                        ))}
                     </select>
                     <select
                        value={assigneeId}
                        onChange={(event) => setAssigneeId(event.target.value)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                     >
                        <option value="">Unassigned</option>
                        {options.members.map((option) => (
                           <option key={option.id} value={option.id}>
                              {option.name}
                           </option>
                        ))}
                     </select>
                  </div>
                  {options.labels.length > 0 && (
                     <div className="flex flex-wrap gap-2">
                        {options.labels.map((option) => (
                           <label
                              key={option.id}
                              className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
                           >
                              <input
                                 type="checkbox"
                                 checked={labelIds.includes(option.id)}
                                 onChange={() =>
                                    setLabelIds((current) =>
                                       current.includes(option.id)
                                          ? current.filter((id) => id !== option.id)
                                          : [...current, option.id]
                                    )
                                 }
                              />
                              <span
                                 className="size-2 rounded-full"
                                 style={{ backgroundColor: option.color }}
                              />
                              {option.name}
                           </label>
                        ))}
                     </div>
                  )}
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
               </div>
               <DialogFooter>
                  {editingId && (
                     <Button
                        variant="destructive"
                        onClick={() => void remove()}
                        disabled={saving}
                        className="mr-auto"
                     >
                        <Trash2 className="size-4" /> Delete
                     </Button>
                  )}
                  <Button variant="outline" onClick={() => setOpen(false)}>
                     Cancel
                  </Button>
                  <Button onClick={() => void save()} disabled={saving}>
                     {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create template'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </SettingsShell>
   );
}
