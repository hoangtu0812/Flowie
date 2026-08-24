import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Heart } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RiEditLine } from '@remixicon/react';
import { useState, useEffect, useCallback } from 'react';
import { priorities } from '@/mock-data/priorities';
import { Status } from '@/mock-data/status';
import { User } from '@/mock-data/users';
import { Project } from '@/mock-data/projects';
import { LabelInterface } from '@/mock-data/labels';
import { useIssuesStore } from '@/store/issues-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { toast } from 'sonner';
import { StatusSelector } from './status-selector';
import { PrioritySelector } from './priority-selector';
import { AssigneeSelector } from './assignee-selector';
import { ProjectSelector } from './project-selector';
import { LabelSelector } from './label-selector';
import { DialogTitle } from '@radix-ui/react-dialog';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';

interface IssueDraft {
   title: string;
   description: string;
   status: Status | null;
   priority: (typeof priorities)[number];
   assignee: User | null;
   project: Project | undefined;
   labels: LabelInterface[];
}

export function CreateNewIssue() {
   const [createMore, setCreateMore] = useState<boolean>(false);
   const { isOpen, defaultStatus, openModal, closeModal } = useCreateIssueStore();
   const {
      createIssue: createIssueRecord,
      statuses,
      templates,
      members,
      projects,
      labels,
   } = useIssuesStore();

   const createDefaultData = useCallback(() => {
      return {
         title: '',
         description: '',
         status:
            defaultStatus ||
            statuses.find((item) => item.category === 'unstarted') ||
            statuses[0] ||
            null,
         assignee: null,
         priority: priorities.find((p) => p.id === 'no-priority')!,
         labels: [],
         project: undefined,
      };
   }, [defaultStatus, statuses]);

   const [addIssueForm, setAddIssueForm] = useState<IssueDraft>(createDefaultData());

   const applyTemplate = (templateId: string) => {
      const template = templates.find((candidate) => candidate.id === templateId);
      if (!template) return;
      setAddIssueForm({
         title: template.title,
         description: template.issueDescription ?? '',
         status:
            statuses.find((candidate) => candidate.id === template.statusId) ??
            createDefaultData().status,
         priority:
            priorities.find(
               (candidate) =>
                  candidate.id ===
                  (template.priority === 'NONE' ? 'no-priority' : template.priority.toLowerCase())
            ) ?? priorities[0],
         assignee: members.find((candidate) => candidate.id === template.assigneeId) ?? null,
         project: projects.find((candidate) => candidate.id === template.projectId),
         labels: labels.filter((candidate) => template.labelIds.includes(candidate.id)),
      });
   };

   useEffect(() => {
      setAddIssueForm(createDefaultData());
   }, [createDefaultData]);

   const createIssue = async () => {
      if (!addIssueForm.title) {
         toast.error('Title is required');
         return;
      }
      if (!addIssueForm.status) {
         toast.error('A status is required');
         return;
      }
      try {
         await createIssueRecord({
            title: addIssueForm.title,
            description: addIssueForm.description || undefined,
            statusId: addIssueForm.status.id,
            priority: addIssueForm.priority.id,
            assigneeId: addIssueForm.assignee?.id,
            projectId: addIssueForm.project?.id,
            labelIds: addIssueForm.labels.map((label) => label.id),
         });
         toast.success('Issue created');
         if (!createMore) {
            closeModal();
         }
         setAddIssueForm(createDefaultData());
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not create issue');
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
                     <Button size="sm" variant="outline" className="gap-1.5">
                        <Heart className="size-4 text-orange-500 fill-orange-500" />
                        <span className="font-medium">CORE</span>
                     </Button>
                     {templates.length > 0 && (
                        <Select onValueChange={applyTemplate}>
                           <SelectTrigger className="h-9 w-48">
                              <SelectValue placeholder="Use template…" />
                           </SelectTrigger>
                           <SelectContent>
                              {templates.map((template) => (
                                 <SelectItem key={template.id} value={template.id}>
                                    {template.name}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     )}
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
                  {addIssueForm.status && (
                     <StatusSelector
                        status={addIssueForm.status}
                        onChange={(newStatus) =>
                           setAddIssueForm({ ...addIssueForm, status: newStatus })
                        }
                     />
                  )}
                  <PrioritySelector
                     priority={addIssueForm.priority}
                     onChange={(newPriority) =>
                        setAddIssueForm({ ...addIssueForm, priority: newPriority })
                     }
                  />
                  <AssigneeSelector
                     assignee={addIssueForm.assignee}
                     onChange={(newAssignee) =>
                        setAddIssueForm({ ...addIssueForm, assignee: newAssignee })
                     }
                  />
                  <ProjectSelector
                     project={addIssueForm.project}
                     onChange={(newProject) =>
                        setAddIssueForm({ ...addIssueForm, project: newProject })
                     }
                  />
                  <LabelSelector
                     selectedLabels={addIssueForm.labels}
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
               <Button size="sm" onClick={() => void createIssue()}>
                  Create issue
               </Button>
            </div>
         </DialogContent>
      </Dialog>
   );
}
