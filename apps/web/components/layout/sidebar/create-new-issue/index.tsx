'use client';

import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';
import {
   BugFieldsForm,
   IssueTypeSelector,
   emptyBug,
   type BugFields,
} from '@/features/issues/bug-fields';
import { Button } from '@/components/ui/button';
import { Button as ActionButton } from '@astryxdesign/core/Button';
import { DraftImages } from '@/components/common/markdown/draft-images';
import {
   IssueSearchDialog,
   type IssueCandidate,
} from '@/components/common/issues/details/issue-search-dialog';
import { uploadAttachment } from '@/lib/attachments';
import dynamic from 'next/dynamic';
import {
   draftDescriptionForServer,
   type DraftIssueImage,
} from '@/features/issues/draft-issue-images';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { priorities } from '@/lib/priority-presentations';
import { status, Status } from '@/lib/status-presentations';
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
import Link from 'next/link';
import { Box, ChevronDown, CornerLeftUp, Loader2, X } from 'lucide-react';
import { LabelInterface } from '@/types/labels';
import { Priority } from '@/lib/priority-presentations';
import { User } from '@/types/users';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { loadJoinedWorkspaceTeams, WorkspaceTeam } from '@/components/common/teams/team-types';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { loadCurrentUser } from '@/features/identity/current-user';
import { initialAssignee, issueMember } from '@/features/issues/create-defaults';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

// Load the editor engine when the dialog content mounts, keeping it out of the initial sidebar bundle.
// VI: Chỉ tải engine editor khi nội dung dialog mount để không tăng bundle sidebar ban đầu.
const DescriptionEditor = dynamic(
   () => import('@/features/issues/description-editor').then((module) => module.DescriptionEditor),
   { ssr: false }
);

type NativeIssueOptions = {
   statuses: Array<{ id: string; name: string; category: string; color: string }>;
   projects: Array<{ id: string; name: string; teamId: string | null }>;
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
   currentUserId: string;
   workspaceId: string;
   team: WorkspaceTeam | undefined;
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

export function CreateNewIssue() {
   const tx = useMessages(messages);

   const autoAssignSelf = useUiPreferencesStore((state) => state.autoAssignSelf);
   const initializedAssignee = useRef(false);
   const [createMore, setCreateMore] = useState<boolean>(false);
   const { isOpen, defaultStatus, openModal, closeModal } = useCreateIssueStore();
   const { issues, retryIssues } = useIssuesStore();
   const params = useParams<{ teamId?: string | string[]; projectId?: string | string[] }>();
   const teamIdentifier = Array.isArray(params.teamId) ? params.teamId[0] : params.teamId;
   const projectIdFromRoute = Array.isArray(params.projectId)
      ? params.projectId[0]
      : params.projectId;
   const [context, setContext] = useState<IssueContext>();
   const [switchingTeam, setSwitchingTeam] = useState(false);
   const [creating, setCreating] = useState(false);
   const submitting = useRef(false);
   const createdIssueRef = useRef<
      { id: string; identifier: string; workspaceId: string } | undefined
   >(undefined);
   const [createdIssue, setCreatedIssue] = useState<{ id: string; identifier: string }>();
   const [submitError, setSubmitError] = useState<string>();
   const [draftImages, setDraftImages] = useState<DraftIssueImage[]>([]);
   const imagesRef = useRef(draftImages);
   imagesRef.current = draftImages;
   const [parent, setParent] = useState<IssueCandidate>();
   const [pickingParent, setPickingParent] = useState(false);
   const locked = creating || !!createdIssue;
   const [bug, setBug] = useState<BugFields>(emptyBug);

   useEffect(
      () => () => {
         for (const image of imagesRef.current) URL.revokeObjectURL(image.url);
      },
      []
   );

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
      if (!createdIssueRef.current)
         setAddIssueForm((form) => (form.title || form.description ? form : createDefaultData()));
   }, [createDefaultData]);
   useEffect(() => {
      if (!isOpen) initializedAssignee.current = false;
   }, [isOpen]);

   const loadOptions = useCallback(
      async (workspaceId: string, teamId?: string) => {
         const query = new URLSearchParams({
            workspaceId,
            ...(teamId ? { teamId } : { noTeam: 'true' }),
         });
         const response = await authenticatedFetch(`${api}/issues/options?${query}`);
         if (!response.ok) throw new Error(tx('Could not load issue options.'));
         return ((await response.json()) as { data: NativeIssueOptions }).data;
      },
      [tx]
   );

   const loadContext = useCallback(async () => {
      if (!isOpen || submitting.current || createdIssueRef.current) return;
      try {
         const [workspace, joinedTeams, actor] = await Promise.all([
            loadCurrentWorkspace(),
            loadJoinedWorkspaceTeams(),
            loadCurrentUser(),
         ]);
         let team = joinedTeams.teams.find(
            (candidate) =>
               candidate.id === teamIdentifier || candidate.identifier === teamIdentifier
         );
         if (!team && projectIdFromRoute) {
            const response = await authenticatedFetch(
               `${api}/issues/options?${new URLSearchParams({ workspaceId: workspace.id })}`
            );
            if (!response.ok) throw new Error(tx('Could not load issue options.'));
            const allOptions = ((await response.json()) as { data: NativeIssueOptions }).data;
            const project = allOptions.projects.find((item) => item.id === projectIdFromRoute);
            team = joinedTeams.teams.find((item) => item.id === project?.teamId);
         }
         const options = await loadOptions(workspace.id, team?.id);
         setContext({
            currentUserId: actor.id,
            workspaceId: workspace.id,
            team,
            teams: joinedTeams.teams,
            options,
         });
         if (!initializedAssignee.current) {
            initializedAssignee.current = true;
            setAddIssueForm((form) =>
               form.title || form.description || form.assignee
                  ? form
                  : {
                       ...form,
                       assignee: initialAssignee(
                          options.members,
                          actor.id,
                          autoAssignSelf,
                          team?.identifier ?? ''
                       ),
                    }
            );
         }
      } catch (error) {
         setContext(undefined);
         toast.error(error instanceof Error ? error.message : tx('Workspace is not ready yet.'));
      }
   }, [isOpen, loadOptions, teamIdentifier, projectIdFromRoute, autoAssignSelf, tx]);

   /** Members, projects, labels and parent selection are team-scoped; a successful switch resets them.
    * VI: Thành viên, dự án, nhãn và lựa chọn cha theo team; đổi team thành công đặt lại các trường này. */
   const selectTeam = useCallback(
      async (team: WorkspaceTeam | undefined) => {
         if (!context || switchingTeam || locked || team?.id === context.team?.id) return;
         setSwitchingTeam(true);
         try {
            const options = await loadOptions(context.workspaceId, team?.id);
            setContext({ ...context, team, options });
            setParent(undefined);
            setAddIssueForm((form) => ({
               ...form,
               assignee: initialAssignee(
                  options.members,
                  context.currentUserId,
                  autoAssignSelf,
                  team?.identifier ?? ''
               ),
               project: undefined,
               labels: [],
            }));
         } catch (error) {
            toast.error(error instanceof Error ? error.message : tx('Could not switch team.'));
         } finally {
            setSwitchingTeam(false);
         }
      },
      [context, switchingTeam, loadOptions, autoAssignSelf, tx, locked]
   );

   useEffect(() => {
      void loadContext();
   }, [loadContext]);

   const liveUsers = useMemo<User[]>(
      () =>
         (context?.options.members ?? []).map((member) =>
            issueMember(member, context?.team?.identifier ?? '')
         ),
      [context]
   );
   const liveProjects = useMemo<ProjectOption[]>(
      () => (context?.options.projects ?? []).map((project) => ({ ...project, icon: Box })),
      [context]
   );

   // Project routes supply defaults only before an issue has been created for this draft.
   // VI: Route dự án chỉ cấp giá trị mặc định trước khi bản nháp này đã tạo issue.
   useEffect(() => {
      if (!isOpen || !projectIdFromRoute || createdIssueRef.current) return;
      const routeProject = liveProjects.find((project) => project.id === projectIdFromRoute);
      if (!routeProject) return;
      setAddIssueForm((form) => (form.project ? form : { ...form, project: routeProject }));
   }, [isOpen, liveProjects, projectIdFromRoute]);
   const liveStatuses = useMemo<Status[]>(
      () =>
         (context?.options.statuses ?? []).map((item) => ({
            ...(status.find((candidate) => candidate.category === item.category.toLowerCase()) ??
               status[0]),
            ...item,
            category: item.category.toLowerCase() as Status['category'],
         })),
      [context]
   );
   useEffect(() => {
      if (!liveStatuses.length) return;
      setAddIssueForm((form) => ({
         ...form,
         status:
            liveStatuses.find((item) => item.id === form.status.id) ??
            (defaultStatus
               ? liveStatuses.find((item) => item.category === defaultStatus.category)
               : undefined) ??
            liveStatuses.find(
               (item) => item.category === (context?.team ? 'unstarted' : 'backlog')
            ) ??
            liveStatuses[0],
      }));
   }, [liveStatuses, defaultStatus, context?.team]);
   const statusCounts = useMemo(
      () =>
         Object.fromEntries(
            liveStatuses.map((presentation) => [
               presentation.id,
               issues.filter((issue) => issue.status.id === presentation.id).length,
            ])
         ),
      [issues, liveStatuses]
   );

   const createIssue = async () => {
      if (!addIssueForm.title) {
         toast.error(tx('Title is required'));
         return;
      }
      if (!context) {
         toast.error(tx('Workspace is not ready yet.'));
         return;
      }
      if (submitting.current || switchingTeam || pickingParent) return;
      const statusId = context.options.statuses.find(
         (candidate) => candidate.id === addIssueForm.status.id
      )?.id;
      if (!statusId) {
         toast.error(tx('A valid status is required.'));
         return;
      }
      submitting.current = true;
      setCreating(true);
      setSubmitError(undefined);
      try {
         if (!createdIssueRef.current) {
            const response = await authenticatedFetch(`${api}/issues`, {
               method: 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...bug,
                  workspaceId: context.workspaceId,
                  teamId: context.team?.id ?? null,
                  title: addIssueForm.title.trim(),
                  description:
                     draftDescriptionForServer(addIssueForm.description, imagesRef.current) ||
                     undefined,
                  parentIssueId: parent?.id,
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
               throw new Error(payload?.message ?? tx('Could not create issue.'));
            }
            const saved = ((await response.json()) as { data: { id: string; identifier: string } })
               .data;
            createdIssueRef.current = { ...saved, workspaceId: context.workspaceId };
            setCreatedIssue(saved);
         }
         const saved = createdIssueRef.current;
         // Cache each successful upload before the next one, so retry resumes on the existing issue.
         // VI: Lưu từng upload thành công trước upload tiếp theo để retry tiếp tục trên issue đã tạo.
         for (const image of imagesRef.current) {
            if (addIssueForm.description.includes(image.url) && !image.uploaded)
               image.uploaded = await uploadAttachment(
                  saved.workspaceId,
                  'issue',
                  saved.id,
                  image.file
               );
         }
         if (imagesRef.current.length) {
            const response = await authenticatedFetch(
               `${api}/issues/${saved.id}?${new URLSearchParams({ workspaceId: saved.workspaceId })}`,
               {
                  method: 'PATCH',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                     description: draftDescriptionForServer(
                        addIssueForm.description,
                        imagesRef.current
                     ),
                  }),
               }
            );
            if (!response.ok) {
               const payload = (await response.json().catch(() => null)) as {
                  message?: string;
               } | null;
               throw new Error(payload?.message ?? tx('Could not save images.'));
            }
         }
         await retryIssues();
         window.dispatchEvent(new Event('flowie:sub-issues-changed'));
         toast.success(tx('Issue created'));
         for (const image of imagesRef.current) URL.revokeObjectURL(image.url);
         imagesRef.current = [];
         setDraftImages([]);
         createdIssueRef.current = undefined;
         setCreatedIssue(undefined);
         if (!createMore) setParent(undefined);
         if (!createMore) closeModal();
         setAddIssueForm({
            ...createDefaultData(),
            status: addIssueForm.status,
            assignee: createMore
               ? initialAssignee(
                    context.options.members,
                    context.currentUserId,
                    autoAssignSelf,
                    context.team?.identifier ?? ''
                 )
               : null,
         });
         setBug(emptyBug);
      } catch (error) {
         const message = error instanceof Error ? error.message : tx('Could not create issue.');
         setSubmitError(message);
         toast.error(message);
      } finally {
         submitting.current = false;
         setCreating(false);
      }
   };

   const stageImages = (files: File[]) => {
      if (creating || createdIssueRef.current) return [];
      if (files.some((file) => file.size > 10 * 1024 * 1024)) {
         toast.error(tx('Each image must be at most 10 MB.'));
         return [];
      }
      const added = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
      imagesRef.current = [...imagesRef.current, ...added];
      setDraftImages(imagesRef.current);
      return added.map((image) => ({
         url: image.url,
         name: image.file.name.replace(/[\[\]\\]/g, ''),
      }));
   };

   return (
      <Dialog
         open={isOpen}
         onOpenChange={(value) => {
            if (!value && pickingParent) {
               setPickingParent(false);
               return;
            }
            if (value) openModal();
            else if (!creating) closeModal();
         }}
      >
         <DialogContent className="flex w-full sm:max-w-2xl flex-col gap-0 p-0 shadow-xl max-h-svh overflow-hidden rounded-xl">
            <HStack
               gap={3}
               padding={4}
               wrap="wrap"
               align="center"
               className="shrink-0 border-b border-border/60 pr-12"
            >
               <DialogTitle className="text-sm font-medium">{tx('Create issue')}</DialogTitle>
               <DropdownMenu>
                  <DropdownMenuTrigger
                     asChild
                     disabled={!context || locked || switchingTeam || pickingParent}
                  >
                     <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 rounded-md px-2 text-xs shadow-none"
                     >
                        <span>{context?.team?.icon ?? '👥'}</span>
                        <span className="font-medium">
                           {context ? (context.team?.identifier ?? tx('No team')) : tx('Loading…')}
                        </span>
                        <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                     <DropdownMenuItem onClick={() => void selectTeam(undefined)}>
                        {tx('No team')}
                     </DropdownMenuItem>
                     {(context?.teams ?? []).map((team) => (
                        <DropdownMenuItem key={team.id} onClick={() => void selectTeam(team)}>
                           <span>{team.icon ?? '👥'}</span>
                           <span className="truncate">{team.name}</span>
                           <span className="ml-auto text-xs text-muted-foreground">
                              {team?.identifier ?? ''}
                           </span>
                        </DropdownMenuItem>
                     ))}
                  </DropdownMenuContent>
               </DropdownMenu>
            </HStack>

            <VStack gap={5} padding={5} className="min-h-0 overflow-y-auto overscroll-contain">
               {createdIssue && submitError && (
                  <DesignSurface>
                     <VStack gap={2}>
                        <Text role="status">
                           {tx('Issue {identifier} was created. Retry to finish saving images.', {
                              identifier: createdIssue.identifier,
                           })}
                        </Text>
                        <Link
                           href={`/${createdIssueRef.current?.workspaceId}/issue/${createdIssue.identifier}`}
                           target="_blank"
                           rel="noreferrer"
                        >
                           {tx('Open created issue')}
                        </Link>
                     </VStack>
                  </DesignSurface>
               )}
               {pickingParent && context ? (
                  <IssueSearchDialog
                     inline
                     open
                     onOpenChange={setPickingParent}
                     title="Set parent"
                     description={tx('Choose a parent in the same team.')}
                     workspaceId={context.workspaceId}
                     teamId={context.team?.id}
                     excludeIds={[]}
                     onPick={async (issue) => {
                        setParent(issue);
                     }}
                  />
               ) : (
                  <>
                     <DesignSurface>
                        <IssueTypeSelector value={bug} onChange={setBug} disabled={locked} />
                     </DesignSurface>
                     <VStack gap={2}>
                        <Input
                           className="border-none w-full rounded-none shadow-none outline-none text-xl md:text-xl font-semibold px-0 h-auto py-1 focus-visible:ring-0 placeholder:text-muted-foreground/70"
                           aria-label={tx('Issue title')}
                           placeholder={tx('Issue title')}
                           value={addIssueForm.title}
                           disabled={locked}
                           onChange={(e) =>
                              setAddIssueForm({ ...addIssueForm, title: e.target.value })
                           }
                        />

                        <DesignSurface>
                           <DescriptionEditor
                              value={addIssueForm.description}
                              isDisabled={creating}
                              onImages={stageImages}
                              onChange={(description) =>
                                 setAddIssueForm((form) => ({ ...form, description }))
                              }
                           />
                        </DesignSurface>
                        <DesignSurface>
                           <DraftImages
                              value={addIssueForm.description}
                              onChange={(description) =>
                                 setAddIssueForm((form) => ({ ...form, description }))
                              }
                              label={tx('Pasted images')}
                              removeLabel={tx('Remove image')}
                              isDisabled={creating}
                           />
                        </DesignSurface>
                        <DesignSurface>
                           <HStack gap={2} wrap="wrap">
                              <ActionButton
                                 label={
                                    parent
                                       ? `${tx('Parent')}: ${parent.identifier}`
                                       : tx('Set parent')
                                 }
                                 tooltip={parent?.title}
                                 icon={<CornerLeftUp />}
                                 size="sm"
                                 variant="ghost"
                                 isDisabled={!context || locked || switchingTeam}
                                 onClick={() => setPickingParent(true)}
                              />
                              {parent && (
                                 <ActionButton
                                    label={tx('Remove parent')}
                                    icon={<X />}
                                    isIconOnly
                                    size="sm"
                                    variant="ghost"
                                    isDisabled={locked}
                                    onClick={() => setParent(undefined)}
                                 />
                              )}
                           </HStack>
                        </DesignSurface>
                     </VStack>
                     {bug.issueType === 'BUG' && (
                        <VStack
                           padding={4}
                           className="rounded-lg border border-border/60 bg-muted/10"
                        >
                           <BugFieldsForm
                              value={bug}
                              onChange={setBug}
                              disabled={locked}
                              showTypeSelector={false}
                           />
                        </VStack>
                     )}

                     <VStack
                        gap={2}
                        className="border-t border-border/50 pt-4"
                        inert={locked || undefined}
                     >
                        <Text type="supporting" weight="medium">
                           {tx('Properties')}
                        </Text>
                        <HStack gap={2} wrap="wrap" className="min-w-0">
                           <StatusSelector
                              status={addIssueForm.status}
                              options={liveStatuses}
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
                              teamIdentifier={context?.team?.identifier}
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
                        </HStack>
                     </VStack>
                  </>
               )}
               {submitError && (
                  <DesignSurface>
                     <Text role="alert">{submitError}</Text>
                  </DesignSurface>
               )}
            </VStack>
            <HStack
               justify="between"
               align="center"
               gap={3}
               paddingInline={5}
               paddingBlock={3}
               className="shrink-0 border-t border-border/60 bg-muted/20"
            >
               <HStack gap={2} align="center">
                  <Switch
                     id="create-more"
                     checked={createMore}
                     disabled={creating || !!createdIssue || pickingParent}
                     onCheckedChange={setCreateMore}
                  />
                  <Label
                     htmlFor="create-more"
                     className="text-xs font-normal text-muted-foreground"
                  >
                     {tx('Create more')}
                  </Label>
               </HStack>
               <Button
                  size="sm"
                  className="rounded-md px-4 shadow-sm"
                  disabled={creating || switchingTeam || !context || pickingParent}
                  aria-busy={creating}
                  onClick={() => {
                     void createIssue();
                  }}
               >
                  {creating ? (
                     <>
                        <Loader2 className="animate-spin" aria-hidden="true" />
                        {tx('Creating issue…')}
                     </>
                  ) : (
                     tx(createdIssue ? 'Retry saving images' : 'Create issue')
                  )}
               </Button>
            </HStack>
         </DialogContent>
      </Dialog>
   );
}
