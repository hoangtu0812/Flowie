import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
   ContextMenuContent,
   ContextMenuGroup,
   ContextMenuItem,
   ContextMenuSeparator,
   ContextMenuShortcut,
   ContextMenuSub,
   ContextMenuSubContent,
   ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
   CircleCheck,
   User,
   BarChart3,
   Tag,
   Folder,
   CalendarClock,
   Pencil,
   Link as LinkIcon,
   Repeat2,
   Copy as CopyIcon,
   PlusSquare,
   Flag,
   ArrowRightLeft,
   Bell,
   Star,
   AlarmClock,
   Trash2,
   CheckCircle2,
   Clock,
   FileText,
   MessageSquare,
   Clipboard,
} from 'lucide-react';
import React from 'react';
import { useIssuesStore } from '@/store/issues-store';
import { useIssueRelationDialogStore } from '@/store/issue-relation-dialog-store';
import { useIssueActionDialogStore } from '@/store/issue-action-dialog-store';
import { priorities } from '@/lib/priority-presentations';
import { toast } from 'sonner';

interface IssueContextMenuProps {
   issueId?: string;
}

export function IssueContextMenu({ issueId }: IssueContextMenuProps) {
   const { openForIssue } = useIssueRelationDialogStore();
   const { openForIssue: openAction } = useIssueActionDialogStore();
   const {
      updateIssueStatus,
      updateIssuePriority,
      updateIssueAssignee,
      addIssueLabel,
      removeIssueLabel,
      updateIssueProject,
      createIssue,
      getIssueById,
      setIssueSubscription,
      setIssueFavorite,
      classifyIssue,
      statuses,
      members,
      projects,
      labels: workspaceLabels,
      workspaceId,
   } = useIssuesStore();

   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

   const handleStatusChange = async (statusId: string) => {
      if (!issueId) return;
      const newStatus = statuses.find((s) => s.id === statusId);
      if (newStatus) {
         try {
            await updateIssueStatus(issueId, newStatus);
            toast.success(`Status updated to ${newStatus.name}`);
         } catch {
            toast.error('Could not update status');
         }
      }
   };

   const handlePriorityChange = async (priorityId: string) => {
      if (!issueId) return;
      const newPriority = priorities.find((p) => p.id === priorityId);
      if (newPriority) {
         try {
            await updateIssuePriority(issueId, newPriority);
            toast.success(`Priority updated to ${newPriority.name}`);
         } catch {
            toast.error('Could not update priority');
         }
      }
   };

   const handleAssigneeChange = async (userId: string | null) => {
      if (!issueId) return;
      const newAssignee = userId ? members.find((u) => u.id === userId) || null : null;
      try {
         await updateIssueAssignee(issueId, newAssignee);
         toast.success(newAssignee ? `Assigned to ${newAssignee.name}` : 'Unassigned');
      } catch {
         toast.error('Could not update assignee');
      }
   };

   const handleLabelToggle = async (labelId: string) => {
      if (!issueId) return;
      const issue = getIssueById(issueId);
      const label = workspaceLabels.find((l) => l.id === labelId);

      if (!issue || !label) return;

      const hasLabel = issue.labels.some((l) => l.id === labelId);

      try {
         if (hasLabel) {
            await removeIssueLabel(issueId, labelId);
            toast.success(`Removed label: ${label.name}`);
         } else {
            await addIssueLabel(issueId, label);
            toast.success(`Added label: ${label.name}`);
         }
      } catch {
         toast.error('Could not update labels');
      }
   };

   const handleProjectChange = async (projectId: string | null) => {
      if (!issueId) return;
      const newProject = projectId ? projects.find((p) => p.id === projectId) : undefined;
      try {
         await updateIssueProject(issueId, newProject);
         toast.success(newProject ? `Project set to ${newProject.name}` : 'Project removed');
      } catch {
         toast.error('Could not update project');
      }
   };

   const handleSubscribe = async () => {
      if (!issueId) return;
      const issue = getIssueById(issueId);
      if (!issue) return;
      try {
         await setIssueSubscription(issueId, !issue.isSubscribed);
         toast.success(issue.isSubscribed ? 'Unsubscribed from issue' : 'Subscribed to issue');
      } catch {
         toast.error('Could not update subscription');
      }
   };

   const handleFavorite = async () => {
      if (!issueId) return;
      const issue = getIssueById(issueId);
      if (!issue) return;
      try {
         await setIssueFavorite(issueId, !issue.isFavorite);
         toast.success(issue.isFavorite ? 'Removed from favorites' : 'Added to favorites');
      } catch {
         toast.error('Could not update favorite');
      }
   };

   const handleClassification = async (resolution: 'DUPLICATE' | 'WONT_FIX') => {
      if (!issueId) return;
      if (resolution === 'DUPLICATE') return openAction(issueId, 'duplicate');
      try {
         await classifyIssue(issueId, resolution);
         toast.success("Marked as won't fix");
      } catch {
         toast.error('Could not classify issue');
      }
   };

   const handleMakeCopy = async () => {
      if (!issueId) return;
      const issue = getIssueById(issueId);
      if (!issue?.team) return;
      try {
         const copied = await createIssue({
            teamId: issue.team.id,
            title: `${issue.title} (copy)`,
            description: issue.description,
            statusId: issue.status.id,
            priority: issue.priority.id,
            assigneeId: issue.assignee?.id,
            projectId: issue.project?.id,
            labelIds: issue.labels.map((label) => label.id),
         });
         toast.success(`Created ${copied.identifier}`);
      } catch {
         toast.error('Could not copy issue');
      }
   };

   const handleConvertToDocument = async () => {
      if (!issueId || !workspaceId) return;
      const issue = getIssueById(issueId);
      if (!issue?.team) return;
      try {
         const response = await fetch(`${api}/documents`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               teamId: issue.team.id,
               title: issue.title,
               content: issue.description,
            }),
         });
         if (!response.ok) throw new Error('Could not create document.');
         toast.success('Document created from issue');
      } catch {
         toast.error('Could not convert issue to document');
      }
   };

   const handleMarkCompleted = async () => {
      if (!issueId) return;
      const completed = statuses.find((status) => status.category === 'completed');
      if (!completed) {
         toast.error('No completed status is configured');
         return;
      }
      await handleStatusChange(completed.id);
   };

   const handleCopy = () => {
      if (!issueId) return;
      const issue = getIssueById(issueId);
      if (issue) {
         navigator.clipboard.writeText(issue.title);
         toast.success('Copied to clipboard');
      }
   };

   return (
      <ContextMenuContent className="w-64">
         <ContextMenuGroup>
            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <CircleCheck className="mr-2 size-4" /> Status
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48">
                  {statuses.map((s) => {
                     const Icon = s.icon;
                     return (
                        <ContextMenuItem key={s.id} onClick={() => void handleStatusChange(s.id)}>
                           <Icon /> {s.name}
                        </ContextMenuItem>
                     );
                  })}
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <User className="mr-2 size-4" /> Assignee
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48">
                  <ContextMenuItem onClick={() => void handleAssigneeChange(null)}>
                     <User className="size-4" /> Unassigned
                  </ContextMenuItem>
                  {members.map((user) => (
                     <ContextMenuItem
                        key={user.id}
                        onClick={() => void handleAssigneeChange(user.id)}
                     >
                        <Avatar className="size-4">
                           <AvatarImage src={user.avatarUrl} alt={user.name} />
                           <AvatarFallback>{user.name[0]}</AvatarFallback>
                        </Avatar>
                        {user.name}
                     </ContextMenuItem>
                  ))}
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <BarChart3 className="mr-2 size-4" /> Priority
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48">
                  {priorities.map((priority) => (
                     <ContextMenuItem
                        key={priority.id}
                        onClick={() => void handlePriorityChange(priority.id)}
                     >
                        <priority.icon className="size-4" /> {priority.name}
                     </ContextMenuItem>
                  ))}
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <Tag className="mr-2 size-4" /> Labels
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48">
                  {workspaceLabels.map((label) => (
                     <ContextMenuItem
                        key={label.id}
                        onClick={() => void handleLabelToggle(label.id)}
                     >
                        <span
                           className="inline-block size-3 rounded-full"
                           style={{ backgroundColor: label.color }}
                           aria-hidden="true"
                        />
                        {label.name}
                     </ContextMenuItem>
                  ))}
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <Folder className="mr-2 size-4" /> Project
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-64">
                  <ContextMenuItem onClick={() => void handleProjectChange(null)}>
                     <Folder className="size-4" /> No Project
                  </ContextMenuItem>
                  {projects.slice(0, 5).map((project) => (
                     <ContextMenuItem
                        key={project.id}
                        onClick={() => void handleProjectChange(project.id)}
                     >
                        <project.icon className="size-4" /> {project.name}
                     </ContextMenuItem>
                  ))}
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuItem onClick={() => issueId && openAction(issueId, 'due-date')}>
               <CalendarClock className="size-4" /> Set due date...
               <ContextMenuShortcut>D</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuItem onClick={() => issueId && openAction(issueId, 'rename')}>
               <Pencil className="size-4" /> Rename...
               <ContextMenuShortcut>R</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={() => issueId && openForIssue(issueId)}>
               <LinkIcon className="size-4" /> Add link...
               <ContextMenuShortcut>Ctrl L</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <Repeat2 className="mr-2 size-4" /> Convert into
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48">
                  <ContextMenuItem onClick={() => void handleConvertToDocument()}>
                     <FileText className="size-4" /> Document
                  </ContextMenuItem>
                  <ContextMenuItem
                     onClick={() => issueId && openAction(issueId, 'convert-comment')}
                  >
                     <MessageSquare className="size-4" /> Comment
                  </ContextMenuItem>
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuItem onClick={() => void handleMakeCopy()}>
               <CopyIcon className="size-4" /> Make a copy...
            </ContextMenuItem>
         </ContextMenuGroup>

         <ContextMenuSeparator />

         <ContextMenuItem onClick={() => issueId && openAction(issueId, 'create-related')}>
            <PlusSquare className="size-4" /> Create related
         </ContextMenuItem>

         <ContextMenuSub>
            <ContextMenuSubTrigger>
               <Flag className="mr-2 size-4" /> Mark as
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
               <ContextMenuItem onClick={() => void handleMarkCompleted()}>
                  <CheckCircle2 className="size-4" /> Completed
               </ContextMenuItem>
               <ContextMenuItem onClick={() => void handleClassification('DUPLICATE')}>
                  <CopyIcon className="size-4" /> Duplicate
               </ContextMenuItem>
               <ContextMenuItem onClick={() => void handleClassification('WONT_FIX')}>
                  <Clock className="size-4" /> Won&apos;t Fix
               </ContextMenuItem>
            </ContextMenuSubContent>
         </ContextMenuSub>

         <ContextMenuItem onClick={() => issueId && openAction(issueId, 'move')}>
            <ArrowRightLeft className="size-4" /> Move
         </ContextMenuItem>

         <ContextMenuSeparator />

         <ContextMenuItem onClick={handleSubscribe}>
            <Bell className="size-4" />
            {getIssueById(issueId ?? '')?.isSubscribed ? 'Unsubscribe' : 'Subscribe'}
            <ContextMenuShortcut>S</ContextMenuShortcut>
         </ContextMenuItem>

         <ContextMenuItem onClick={() => void handleFavorite()}>
            <Star className="size-4" />
            {getIssueById(issueId ?? '')?.isFavorite ? 'Unfavorite' : 'Favorite'}
            <ContextMenuShortcut>F</ContextMenuShortcut>
         </ContextMenuItem>

         <ContextMenuItem onClick={handleCopy}>
            <Clipboard className="size-4" /> Copy
         </ContextMenuItem>

         <ContextMenuItem onClick={() => issueId && openAction(issueId, 'reminder')}>
            <AlarmClock className="size-4" />
            {getIssueById(issueId ?? '')?.reminderAt ? 'Change reminder' : 'Remind me'}
            <ContextMenuShortcut>H</ContextMenuShortcut>
         </ContextMenuItem>

         <ContextMenuSeparator />

         <ContextMenuItem
            variant="destructive"
            onClick={() => issueId && openAction(issueId, 'archive')}
         >
            <Trash2 className="size-4" /> Archive
            <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
         </ContextMenuItem>
      </ContextMenuContent>
   );
}
