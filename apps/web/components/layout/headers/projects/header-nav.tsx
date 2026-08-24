'use client';

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
import { Label } from '@/components/ui/label';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type TeamOption = { id: string; name: string; identifier: string };
type TemplateOption = { id: string; name: string; description: string | null; type: string };

function CreateProjectDialog({
   open,
   onOpenChange,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [teams, setTeams] = useState<TeamOption[]>([]);
   const [templates, setTemplates] = useState<TemplateOption[]>([]);
   const [name, setName] = useState('');
   const [teamId, setTeamId] = useState('');
   const [templateId, setTemplateId] = useState('');
   const [error, setError] = useState<string>();
   const [saving, setSaving] = useState(false);

   useEffect(() => {
      if (!open) return;
      void (async () => {
         const workspacesResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
         if (!workspacesResponse.ok) throw new Error('Could not load the current workspace.');
         const workspaces = (await workspacesResponse.json()) as {
            data: Array<{ workspace: { id: string } }>;
         };
         const currentWorkspaceId = workspaces.data[0]?.workspace.id;
         if (!currentWorkspaceId) throw new Error('No workspace is available for this account.');
         setWorkspaceId(currentWorkspaceId);
         const [teamsResponse, templatesResponse] = await Promise.all([
            fetch(`${api}/teams?workspaceId=${currentWorkspaceId}`, {
               credentials: 'include',
            }),
            fetch(`${api}/projects/templates?workspaceId=${currentWorkspaceId}`, {
               credentials: 'include',
            }),
         ]);
         if (teamsResponse.ok)
            setTeams(((await teamsResponse.json()) as { data: TeamOption[] }).data);
         if (templatesResponse.ok)
            setTemplates(((await templatesResponse.json()) as { data: TemplateOption[] }).data);
      })().catch((caught: unknown) =>
         setError(caught instanceof Error ? caught.message : 'Could not load project options.')
      );
   }, [open]);

   const create = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || name.trim().length < 2 || saving) return;
      setSaving(true);
      setError(undefined);
      const identifier = name
         .trim()
         .toUpperCase()
         .replace(/[^A-Z0-9]+/g, '-')
         .replace(/^-|-$/g, '')
         .slice(0, 24);
      try {
         const response = await fetch(`${api}/projects`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               name: name.trim(),
               identifier: identifier || 'PROJECT',
               ...(teamId ? { teamId } : {}),
               ...(templateId ? { templateId } : {}),
            }),
         });
         const payload = (await response.json().catch(() => null)) as {
            message?: string | string[];
         } | null;
         if (!response.ok) {
            throw new Error(
               Array.isArray(payload?.message)
                  ? payload.message[0]
                  : (payload?.message ?? 'Could not create project.')
            );
         }
         window.location.reload();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not create project.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Create project</DialogTitle>
               <DialogDescription>Create a project in the current workspace.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={create}>
               <div className="space-y-2">
                  <Label htmlFor="project-name">Project name</Label>
                  <Input
                     id="project-name"
                     value={name}
                     onChange={(event) => setName(event.target.value)}
                     placeholder="e.g. Product launch"
                     autoFocus
                  />
               </div>
               <div className="space-y-2">
                  <Label htmlFor="project-template">Template</Label>
                  <select
                     id="project-template"
                     value={templateId}
                     onChange={(event) => setTemplateId(event.target.value)}
                     className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                     <option value="">No template</option>
                     {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                           {template.name}
                        </option>
                     ))}
                  </select>
               </div>
               <div className="space-y-2">
                  <Label htmlFor="project-team">Team</Label>
                  <select
                     id="project-team"
                     value={teamId}
                     onChange={(event) => setTeamId(event.target.value)}
                     className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                     <option value="">No team</option>
                     {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                           {team.name} ({team.identifier})
                        </option>
                     ))}
                  </select>
               </div>
               {error && <p className="text-sm text-destructive">{error}</p>}
               <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                     Cancel
                  </Button>
                  <Button type="submit" disabled={!workspaceId || name.trim().length < 2 || saving}>
                     {saving ? 'Creating…' : 'Create project'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}

export default function HeaderNav() {
   const [count, setCount] = useState<number>();
   const [createOpen, setCreateOpen] = useState(false);

   useEffect(() => {
      void (async () => {
         const workspacesResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
         if (!workspacesResponse.ok) return;
         const workspaces = (await workspacesResponse.json()) as {
            data: Array<{ workspace: { id: string } }>;
         };
         const workspaceId = workspaces.data[0]?.workspace.id;
         if (!workspaceId) return;
         const projectsResponse = await fetch(`${api}/projects?workspaceId=${workspaceId}`, {
            credentials: 'include',
         });
         if (!projectsResponse.ok) return;
         const payload = (await projectsResponse.json()) as { data: unknown[] };
         setCount(payload.data.length);
      })();
   }, []);

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger className="" />
            <div className="flex items-center gap-1">
               <span className="text-sm font-medium">Projects</span>
               <span className="text-xs bg-accent rounded-md px-1.5 py-1">{count ?? '…'}</span>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <Button
               className="relative"
               size="xs"
               variant="secondary"
               onClick={() => setCreateOpen(true)}
            >
               <Plus className="size-4" />
               <span className="hidden sm:inline ml-1">Create project</span>
            </Button>
            <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
         </div>
      </div>
   );
}
