import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { useIssuesStore } from '@/store/issues-store';
import { useIssueActionDialogStore } from '@/store/issue-action-dialog-store';
import { useIssueRelationDialogStore } from '@/store/issue-relation-dialog-store';
import { status } from '@/mock-data/status';
import { priorities } from '@/mock-data/priorities';
import { toast } from 'sonner';
import { useState } from 'react';

interface IssueContextMenuProps {
   issueId?: string;
}

export function IssueContextMenu({ issueId }: IssueContextMenuProps) {
   const {
      updateIssueStatus,
      updateIssuePriority,
      updateIssueAssignee,
      addIssueLabel,
      removeIssueLabel,
      updateIssueProject,
      updateIssueDueDate,
      getIssueById,
      members,
      labels,
      projects,
      updateIssueSubscription,
      updateIssueFavorite,
      setIssueReminder,
      createIssue,
      classifyIssue,
   } = useIssuesStore();
   const openIssueAction = useIssueActionDialogStore((state) => state.openForIssue);
   const openIssueRelation = useIssueRelationDialogStore((state) => state.openForIssue);
   const issue = issueId ? getIssueById(issueId) : undefined;
   const isSubscribed = issue?.isSubscribed ?? false;
   const isFavorite = issue?.isFavorite ?? false;
   const [reminderOpen, setReminderOpen] = useState(false);
   const [reminderValue, setReminderValue] = useState('');
   const [reminderSaving, setReminderSaving] = useState(false);

   const handleStatusChange = (statusId: string) => {
      if (!issueId) return;
      const newStatus = status.find((s) => s.id === statusId);
      if (newStatus) {
         updateIssueStatus(issueId, newStatus);
         toast.success(`Status updated to ${newStatus.name}`);
      }
   };

   const handlePriorityChange = (priorityId: string) => {
      if (!issueId) return;
      const newPriority = priorities.find((p) => p.id === priorityId);
      if (newPriority) {
         updateIssuePriority(issueId, newPriority);
         toast.success(`Priority updated to ${newPriority.name}`);
      }
   };

   const handleAssigneeChange = async (userId: string | null) => {
      if (!issueId) return;
      const newAssignee = userId ? members.find((u) => u.id === userId) || null : null;
      if (await updateIssueAssignee(issueId, newAssignee)) {
         toast.success(newAssignee ? `Assigned to ${newAssignee.name}` : 'Unassigned');
      }
   };

   const handleLabelToggle = async (labelId: string) => {
      if (!issueId) return;
      const issue = getIssueById(issueId);
      const label = labels.find((l) => l.id === labelId);

      if (!issue || !label) return;

      const hasLabel = issue.labels.some((l) => l.id === labelId);

      if (hasLabel) {
         if (await removeIssueLabel(issueId, labelId)) {
            toast.success(`Removed label: ${label.name}`);
         }
      } else if (await addIssueLabel(issueId, label)) {
         toast.success(`Added label: ${label.name}`);
      }
   };

   const handleProjectChange = async (projectId: string | null) => {
      if (!issueId) return;
      const newProject = projectId ? projects.find((p) => p.id === projectId) : undefined;
      if (await updateIssueProject(issueId, newProject)) {
         toast.success(newProject ? `Project set to ${newProject.name}` : 'Project removed');
      }
   };

   const handleSetDueDate = async () => {
      if (!issueId) return;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      if (await updateIssueDueDate(issueId, dueDate.toISOString())) {
         toast.success('Due date set to 7 days from now');
      }
   };

   const handleAddLink = () => {
      if (issueId) openIssueRelation(issueId);
   };

   const handleMakeCopy = async () => {
      if (!issue?.teamId) return;
      try {
         const copy = await createIssue({
            teamId: issue.teamId,
            title: `${issue.title} (copy)`,
            description: issue.description,
            statusId: issue.status.id,
            projectId: issue.project?.id,
            assigneeId: issue.assignee?.id,
            priority:
               issue.priority.id === 'urgent'
                  ? 'URGENT'
                  : issue.priority.id === 'high'
                    ? 'HIGH'
                    : issue.priority.id === 'medium'
                      ? 'MEDIUM'
                      : issue.priority.id === 'low'
                        ? 'LOW'
                        : 'NONE',
            dueDate: issue.dueDate,
            labelIds: issue.labels.map((label) => label.id),
         });
         toast.success(`Created copy ${copy.identifier}`);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not make a copy.');
      }
   };

   const handleCreateRelated = () => {
      if (issueId) openIssueAction(issueId, 'create-related');
   };

   const handleMarkAs = async (type: 'Completed' | 'Duplicate' | "Won't Fix") => {
      if (!issueId) return;
      if (type === 'Duplicate') {
         openIssueAction(issueId, 'duplicate');
         return;
      }
      if (type === "Won't Fix") {
         try {
            await classifyIssue(issueId, 'WONT_FIX');
            toast.success("Marked as won't fix");
         } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not classify issue.');
         }
         return;
      }
      const completed = status.find((candidate) => candidate.category === 'completed');
      if (completed && (await updateIssueStatus(issueId, completed))) {
         toast.success('Marked as completed');
      }
   };

   const handleMove = () => {
      if (issueId) openIssueAction(issueId, 'move');
   };

   const handleSubscribe = async () => {
      if (!issueId) return;
      const subscribed = !isSubscribed;
      if (await updateIssueSubscription(issueId, subscribed)) {
         toast.success(subscribed ? 'Subscribed to issue' : 'Unsubscribed from issue');
      }
   };

   const handleFavorite = async () => {
      if (!issueId) return;
      const favorited = !isFavorite;
      if (await updateIssueFavorite(issueId, favorited)) {
         toast.success(favorited ? 'Added to favorites' : 'Removed from favorites');
      }
   };

   const handleCopy = () => {
      if (!issueId) return;
      const issue = getIssueById(issueId);
      if (issue) {
         navigator.clipboard.writeText(issue.title);
         toast.success('Copied to clipboard');
      }
   };

   const handleRemindMe = () => {
      const existingReminder = issue?.reminderAt ? new Date(issue.reminderAt) : null;
      const date = existingReminder && !Number.isNaN(existingReminder.getTime()) ? existingReminder : new Date(Date.now() + 60 * 60 * 1000);
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      setReminderValue(date.toISOString().slice(0, 16));
      setReminderOpen(true);
   };

   const saveReminder = async () => {
      if (!issueId || !reminderValue) return;
      const remindAt = new Date(reminderValue);
      if (Number.isNaN(remindAt.getTime()) || remindAt.getTime() <= Date.now()) {
         toast.error('Choose a time in the future');
         return;
      }

      setReminderSaving(true);
      try {
         if (await setIssueReminder(issueId, remindAt.toISOString())) {
            toast.success('Reminder saved');
            setReminderOpen(false);
         }
      } finally {
         setReminderSaving(false);
      }
   };

   const clearReminder = async () => {
      if (!issueId) return;
      setReminderSaving(true);
      try {
         if (await setIssueReminder(issueId, undefined)) {
            toast.success('Reminder cleared');
            setReminderOpen(false);
         }
      } finally {
         setReminderSaving(false);
      }
   };

   return (
      <>
      <ContextMenuContent className="w-64">
         <ContextMenuGroup>
            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <CircleCheck className="mr-2 size-4" /> Status
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48">
                  {status.map((s) => {
                     const Icon = s.icon;
                     return (
                        <ContextMenuItem key={s.id} onClick={() => handleStatusChange(s.id)}>
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
                        onClick={() => handlePriorityChange(priority.id)}
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
                  {labels.map((label) => (
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

            <ContextMenuItem onClick={() => void handleSetDueDate()}>
               <CalendarClock className="size-4" /> Set due date...
               <ContextMenuShortcut>D</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuItem onClick={() => issueId && openIssueAction(issueId, 'rename')}>
               <Pencil className="size-4" /> Rename...
               <ContextMenuShortcut>R</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={handleAddLink}>
               <LinkIcon className="size-4" /> Add link...
               <ContextMenuShortcut>Ctrl L</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <Repeat2 className="mr-2 size-4" /> Convert into
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48">
                  <ContextMenuItem>
                     <FileText className="size-4" /> Document
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => issueId && openIssueAction(issueId, 'convert-comment')}>
                     <MessageSquare className="size-4" /> Comment
                  </ContextMenuItem>
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuItem onClick={() => void handleMakeCopy()}>
               <CopyIcon className="size-4" /> Make a copy...
            </ContextMenuItem>
         </ContextMenuGroup>

         <ContextMenuSeparator />

         <ContextMenuItem onClick={handleCreateRelated}>
            <PlusSquare className="size-4" /> Create related
         </ContextMenuItem>

         <ContextMenuSub>
            <ContextMenuSubTrigger>
               <Flag className="mr-2 size-4" /> Mark as
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
               <ContextMenuItem onClick={() => void handleMarkAs('Completed')}>
                  <CheckCircle2 className="size-4" /> Completed
               </ContextMenuItem>
               <ContextMenuItem onClick={() => void handleMarkAs('Duplicate')}>
                  <CopyIcon className="size-4" /> Duplicate
               </ContextMenuItem>
               <ContextMenuItem onClick={() => void handleMarkAs("Won't Fix")}>
                  <Clock className="size-4" /> Won&apos;t Fix
               </ContextMenuItem>
            </ContextMenuSubContent>
         </ContextMenuSub>

         <ContextMenuItem onClick={handleMove}>
            <ArrowRightLeft className="size-4" /> Move
         </ContextMenuItem>

         <ContextMenuSeparator />

         <ContextMenuItem onClick={() => void handleSubscribe()}>
            <Bell className="size-4" /> {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
            <ContextMenuShortcut>S</ContextMenuShortcut>
         </ContextMenuItem>

         <ContextMenuItem onClick={() => void handleFavorite()}>
            <Star className="size-4" /> {isFavorite ? 'Unfavorite' : 'Favorite'}
            <ContextMenuShortcut>F</ContextMenuShortcut>
         </ContextMenuItem>

         <ContextMenuItem onClick={handleCopy}>
            <Clipboard className="size-4" /> Copy
         </ContextMenuItem>

         <ContextMenuItem onClick={handleRemindMe}>
            <AlarmClock className="size-4" /> Remind me
            <ContextMenuShortcut>H</ContextMenuShortcut>
         </ContextMenuItem>

         <ContextMenuSeparator />

         <ContextMenuItem
            variant="destructive"
            onClick={() => issueId && openIssueAction(issueId, 'archive')}
         >
            <Trash2 className="size-4" /> Delete...
            <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
         </ContextMenuItem>
      </ContextMenuContent>
      <Dialog open={reminderOpen} onOpenChange={(open) => !reminderSaving && setReminderOpen(open)}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Set reminder</DialogTitle>
               <DialogDescription>Receive an in-app notification at the selected time.</DialogDescription>
            </DialogHeader>
            <Input
               type="datetime-local"
               value={reminderValue}
               min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
               onChange={(event) => setReminderValue(event.target.value)}
               disabled={reminderSaving}
            />
            <DialogFooter>
               {issue?.reminderAt && (
                  <Button variant="ghost" onClick={() => void clearReminder()} disabled={reminderSaving}>
                     Clear reminder
                  </Button>
               )}
               <Button variant="outline" onClick={() => setReminderOpen(false)} disabled={reminderSaving}>
                  Cancel
               </Button>
               <Button onClick={() => void saveReminder()} disabled={reminderSaving}>
                  {reminderSaving ? 'Saving…' : 'Set reminder'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
      </>
   );
}
