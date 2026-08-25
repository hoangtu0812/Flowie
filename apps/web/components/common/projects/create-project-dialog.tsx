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
import { useProjectsData } from '@/features/projects/projects-data';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

const toIdentifier = (value: string) =>
   value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 24);

export function CreateProjectDialog({
   open,
   onOpenChange,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const { createProject, teamGroups } = useProjectsData();
   const [name, setName] = useState('');
   const [identifier, setIdentifier] = useState('');
   const [teamId, setTeamId] = useState('');
   const [description, setDescription] = useState('');
   const [submitting, setSubmitting] = useState(false);

   const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!name.trim() || !identifier.trim()) return;
      setSubmitting(true);
      try {
         await createProject({ name, identifier, teamId: teamId || undefined, description });
         toast.success('Project created.');
         setName('');
         setIdentifier('');
         setDescription('');
         onOpenChange(false);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not create project.');
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-md">
            <DialogHeader>
               <DialogTitle>Create project</DialogTitle>
               <DialogDescription>Start a new project in this workspace.</DialogDescription>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={submit}>
               <label className="grid gap-1.5 text-sm font-medium">
                  Name
                  <Input
                     autoFocus
                     value={name}
                     onChange={(event) => {
                        const value = event.target.value;
                        setName(value);
                        if (!identifier) setIdentifier(toIdentifier(value));
                     }}
                     placeholder="Project name"
                     required
                  />
               </label>
               <label className="grid gap-1.5 text-sm font-medium">
                  Identifier
                  <Input
                     value={identifier}
                     onChange={(event) => setIdentifier(toIdentifier(event.target.value))}
                     placeholder="PROJECT"
                     maxLength={24}
                     required
                  />
               </label>
               <label className="grid gap-1.5 text-sm font-medium">
                  Team
                  <select
                     className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                     value={teamId}
                     onChange={(event) => setTeamId(event.target.value)}
                  >
                     <option value="">No team</option>
                     {teamGroups.map((team) => (
                        <option key={team.id} value={team.id}>
                           {team.name}
                        </option>
                     ))}
                  </select>
               </label>
               <label className="grid gap-1.5 text-sm font-medium">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                  <textarea
                     className="border-input min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     maxLength={2000}
                  />
               </label>
               <DialogFooter>
                  <Button
                     type="button"
                     variant="ghost"
                     onClick={() => onOpenChange(false)}
                     disabled={submitting}
                  >
                     Cancel
                  </Button>
                  <Button type="submit" disabled={submitting || !name.trim() || !identifier.trim()}>
                     {submitting ? 'Creating…' : 'Create project'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}
