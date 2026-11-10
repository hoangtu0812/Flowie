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
import { useTeamsData } from '@/features/teams/teams-data';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

const toIdentifier = (value: string) =>
   value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 12);

export function CreateTeamDialog({
   open,
   onOpenChange,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const { createTeam, workspaceId, workspaceLoading } = useTeamsData();
   const [name, setName] = useState('');
   const [identifier, setIdentifier] = useState('');
   const [description, setDescription] = useState('');
   const [submitting, setSubmitting] = useState(false);

   const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!name.trim() || !identifier.trim()) return;
      setSubmitting(true);
      try {
         await createTeam({ name, identifier, description });
         toast.success('Team created.');
         setName('');
         setIdentifier('');
         setDescription('');
         onOpenChange(false);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not create team.');
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-md">
            <DialogHeader>
               <DialogTitle>Create team</DialogTitle>
               <DialogDescription>Organize people and work in this workspace.</DialogDescription>
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
                     placeholder="Team name"
                     required
                  />
               </label>
               <label className="grid gap-1.5 text-sm font-medium">
                  Identifier
                  <Input
                     value={identifier}
                     onChange={(event) => setIdentifier(toIdentifier(event.target.value))}
                     placeholder="TEAM"
                     maxLength={12}
                     required
                  />
               </label>
               <label className="grid gap-1.5 text-sm font-medium">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                  <textarea
                     className="border-input min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     maxLength={500}
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
                  <Button
                     type="submit"
                     disabled={
                        submitting ||
                        workspaceLoading ||
                        !workspaceId ||
                        !name.trim() ||
                        !identifier.trim()
                     }
                  >
                     {submitting
                        ? 'Creating…'
                        : workspaceLoading
                          ? 'Loading workspace…'
                          : 'Create team'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}
