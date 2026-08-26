import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RiEditLine } from '@remixicon/react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { priorities } from '@/mock-data/priorities';
import { status, Status } from '@/mock-data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { toast } from 'sonner';
import { StatusSelector } from './status-selector';
import { PrioritySelector } from './priority-selector';
import { AssigneeSelector } from './assignee-selector';
import { ProjectOption, ProjectSelector } from './project-selector';
import { LabelSelector } from './label-selector';
import { DialogTitle } from '@radix-ui/react-dialog';
import { useParams } from 'next/navigation';
import { Box } from 'lucide-react';
import { LabelInterface } from '@/mock-data/labels';
import { Priority } from '@/mock-data/priorities';
import { User } from '@/mock-data/users';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { loadJoinedWorkspaceTeams, WorkspaceTeam } from '@/components/common/teams/team-types';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type NativeIssueOptions = {
   statuses: Array<{ id: string; name: string }>;
   projects: Array<{ id: string; name: string }>;
   members: Array<{ id: string; name: string; email: string; avatarUrl?: string | null }>;
   labels: LabelInterface[];
};

type CreateIssueForm = {
   title: string;
   description: string;
   status: Status;
   assignee: User | null;
   priority: Priority;
   labels: LabelInterface[];
   project: ProjectOption | undefined;
};

type IssueContext = {
   workspaceId: string;
   team: WorkspaceTeam;
   /** Joined teams the issue can be filed under. */
   teams: WorkspaceTeam[];
   options: NativeIssueOptions;
};

const priorityForApi: Record<string, 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'> = {
   'no-priority': 'NONE',
   'low': 'LOW',
   'medium': 'MEDIUM',
   'high': 'HIGH',
   'urgent': 'URGENT',
};

const normalise = (value: string) => value.trim().toLowerCase();

export function CreateNewIssue() {
   const [createMore, setCreateMore] = useState<boolean>(false);
   const { isOpen, defaultStatus, openModal, closeModal } = useCreateIssueStore();
   const { issues, loadIssues } = useIssuesStore();
   const params = useParams<{ teamId?: string | string[]; projectId?: string | string[] }>();
   const teamIdentifier = Array.isArray(params.teamId) ? params.teamId[0] : params.teamId;
   const projectIdFromRoute = Array.isArray(params.projectId)
      ? params.projectId[0]
      : params.projectId;
   const [context, setContext] = useState<IssueContext>();
   const [creating, setCreating] = useState(false);

   const createDefaultData = useCallback(() => {
      return {
         title: '',
         description: '',
         status: defaultStatus || status.find((s) => s.id === 'to-do')!,
         assignee: null,
         priority: priorities.find((p) => p.id === 'no-priority')!,
         labels: [],
         project: undefined,
      };
   }, [defaultStatus]);

   const [addIssueForm, setAddIssueForm] = useState<CreateIssueForm>(createDefaultData());

   useEffect(() => {
      setAddIssueForm(createDefaultData());
   }, [createDefaultData]);

   const loadOptions = useCallback(async (workspaceId: string, teamId: string) => {
      const query = new URLSearchParams({ workspaceId, teamId });
      const response = await authenticatedFetch(`${api}/issues/options?${query}`);
      if (!response.ok) throw new Error('Could not load issue options.');
      return ((await response.json()) as { data: NativeIssueOptions }).data;
   }, []);

   const loadContext = useCallback(async () => {
      if (!isOpen) return;
      try {
         const [workspace, joinedTeams] = await Promise.all([
            loadCurrentWorkspace(),
            loadJoinedWorkspaceTeams(),
         ]);
         const team =
            joinedTeams.teams.find(
               (candidate) =>
                  candidate.id === teamIdentifier || candidate.identifier === teamIdentifier
            ) ?? joinedTeams.teams[0];
         if (!team) throw new Error('Join a team before creating an issue.');
         setContext({
            workspaceId: workspace.id,
            team,
            teams: joinedTeams.teams,
            options: await loadOptions(workspace.id, team.id),
         });
      } catch (error) {
         setContext(undefined);
         toast.error(error instanceof Error ? error.message : 'Workspace is not ready yet.');
      }
   }, [isOpen, loadOptions, teamIdentifier]);

   /** Members, projects and labels are team-scoped, so a switch reloads them. */
   const selectTeam = useCallback(
      async (team: WorkspaceTeam) => {
         if (!context || team.id === context.team.id) return;
         try {
            const options = await loadOptions(context.workspaceId, team.id);
            setContext({ ...context, team, options });
            setAddIssueForm((form) => ({
               ...form,
               assignee: null,
               project: undefined,
               labels: [],
            }));
         } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not switch team.');
         }
      },
      [context, loadOptions]
   );

   useEffect(() => {
      void loadContext();
   }, [loadContext]);

   const liveUsers = useMemo<User[]>(
      () =>
         (context?.options.members ?? []).map((member) => ({
            id: member.id,
            name: member.name,
            avatarUrl: member.avatarUrl ?? '',
            email: member.email,
            status: 'offline',
            role: 'Member',
            joinedDate: '',
            teamIds: context ? [context.team.identifier] : [],
            timezone: 'UTC',
         })),
      [context]
   );
   const liveProjects = useMemo<ProjectOption[]>(
      () => (context?.options.projects ?? []).map((project) => ({ ...project, icon: Box })),
      [context]
   );

   // Opened from a project screen, the dialog starts on that project; the
   // picker stays available for anything else.
   useEffect(() => {
      if (!isOpen || !projectIdFromRoute) return;
      const routeProject = liveProjects.find((project) => project.id === projectIdFromRoute);
      if (!routeProject) return;
      setAddIssueForm((form) => (form.project ? form : { ...form, project: routeProject }));
   }, [isOpen, liveProjects, projectIdFromRoute]);
   const statusCounts = useMemo(
      () =>
         Object.fromEntries(
            status.map((presentation) => [
               presentation.id,
               issues.filter(
                  (issue) => normalise(issue.status.name) === normalise(presentation.name)
               ).length,
            ])
         ),
      [issues]
   );

   const createIssue = async () => {
      if (!addIssueForm.title) {
         toast.error('Title is required');
         return;
      }
      if (!context) {
         toast.error('Workspace is not ready yet.');
         return;
      }
      if (creating) return;
      const statusId = context.options.statuses.find(
         (candidate) => normalise(candidate.name) === normalise(addIssueForm.status.name)
      )?.id;
      if (!statusId) {
         toast.error('A valid status is required.');
         return;
      }
      setCreating(true);
      try {
         const response = await authenticatedFetch(`${api}/issues`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId: context.workspaceId,
               teamId: context.team.id,
               title: addIssueForm.title.trim(),
               description: addIssueForm.description.trim() || undefined,
               statusId,
               priority: priorityForApi[addIssueForm.priority.id],
               assigneeId: addIssueForm.assignee?.id,
               projectId: addIssueForm.project?.id,
               labelIds: addIssueForm.labels.map((label) => label.id),
            }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not create issue.');
         }
         await loadIssues(context.team.identifier);
         toast.success('Issue created');
         if (!createMore) closeModal();
         setAddIssueForm(createDefaultData());
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not create issue.');
      } finally {
         setCreating(false);
      }
   };

   return (
      <Dialog open={isOpen} onOpenChange={(value) => (value ? openModal() : closeModal())}>
         <DialogTrigger asChild>
            <Button className="size-8 shrink-0" variant="secondary" size="icon">
               <RiEditLine />
            </Button>
         </DialogTrigger>
         <DialogContent className="w-full sm:max-w-[750px] p-0 shadow-xl top-[30%]">
            <DialogHeader>
               <DialogTitle>
                  <div className="flex items-center px-4 pt-4 gap-2">
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild disabled={!context}>
                           <Button size="sm" variant="outline" className="gap-1.5">
                              <span>{context?.team.icon ?? '👥'}</span>
                              <span className="font-medium">
                                 {context?.team.identifier ?? 'Loading…'}
                              </span>
                           </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                           {(context?.teams ?? []).map((team) => (
                              <DropdownMenuItem key={team.id} onClick={() => void selectTeam(team)}>
                                 <span>{team.icon ?? '👥'}</span>
                                 <span className="truncate">{team.name}</span>
                                 <span className="ml-auto text-xs text-muted-foreground">
                                    {team.identifier}
                                 </span>
                              </DropdownMenuItem>
                           ))}
                        </DropdownMenuContent>
                     </DropdownMenu>
                  </div>
               </DialogTitle>
            </DialogHeader>

            <div className="px-4 pb-0 space-y-3 w-full">
               <Input
                  className="border-none w-full shadow-none outline-none text-2xl font-medium px-0 h-auto focus-visible:ring-0 overflow-hidden text-ellipsis whitespace-normal break-words"
                  placeholder="Issue title"
                  value={addIssueForm.title}
                  onChange={(e) => setAddIssueForm({ ...addIssueForm, title: e.target.value })}
               />

               <Textarea
                  className="border-none w-full shadow-none outline-none resize-none px-0 min-h-16 focus-visible:ring-0 break-words whitespace-normal overflow-wrap"
                  placeholder="Add description..."
                  value={addIssueForm.description}
                  onChange={(e) =>
                     setAddIssueForm({ ...addIssueForm, description: e.target.value })
                  }
               />

               <div className="w-full flex items-center justify-start gap-1.5 flex-wrap">
                  <StatusSelector
                     status={addIssueForm.status}
                     counts={statusCounts}
                     onChange={(newStatus) =>
                        setAddIssueForm({ ...addIssueForm, status: newStatus })
                     }
                  />
                  <PrioritySelector
                     priority={addIssueForm.priority}
                     onChange={(newPriority) =>
                        setAddIssueForm({ ...addIssueForm, priority: newPriority })
                     }
                  />
                  <AssigneeSelector
                     assignee={addIssueForm.assignee}
                     users={liveUsers}
                     teamIdentifier={context?.team.identifier}
                     onChange={(newAssignee) =>
                        setAddIssueForm({ ...addIssueForm, assignee: newAssignee })
                     }
                  />
                  <ProjectSelector
                     project={addIssueForm.project}
                     projects={liveProjects}
                     onChange={(newProject) =>
                        setAddIssueForm({ ...addIssueForm, project: newProject })
                     }
                  />
                  <LabelSelector
                     selectedLabels={addIssueForm.labels}
                     labels={context?.options.labels ?? []}
                     onChange={(newLabels) =>
                        setAddIssueForm({ ...addIssueForm, labels: newLabels })
                     }
                  />
               </div>
            </div>
            <div className="flex items-center justify-between py-2.5 px-4 w-full border-t">
               <div className="flex items-center gap-2">
                  <div className="flex items-center space-x-2">
                     <Switch
                        id="create-more"
                        checked={createMore}
                        onCheckedChange={setCreateMore}
                     />
                     <Label htmlFor="create-more">Create more</Label>
                  </div>
               </div>
               <Button
                  size="sm"
                  onClick={() => {
                     void createIssue();
                  }}
               >
                  Create issue
               </Button>
            </div>
         </DialogContent>
      </Dialog>
   );
}
