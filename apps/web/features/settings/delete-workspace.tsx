'use client';

import { useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
   AlertDialog,
   AlertDialogTrigger,
   AlertDialogContent,
   AlertDialogHeader,
   AlertDialogTitle,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogCancel,
   AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { authenticatedFetch, type WorkspaceSummary } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { SettingsSection } from './shared';
import { withBasePath } from '@/lib/base-path';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function DeleteWorkspace({ workspace }: { workspace: WorkspaceSummary }) {
   const [open, setOpen] = useState(false);
   const [name, setName] = useState('');
   const [pending, setPending] = useState(false);
   const [error, setError] = useState('');
   const inFlight = useRef(false);
   const matches = name.normalize('NFC') === workspace.name.normalize('NFC');

   async function remove() {
      if (!matches || inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      setError('');
      try {
         const response = await authenticatedFetch(`${api}/workspaces/${workspace.id}`, {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ confirmationName: name }),
         });
         await responseData(response, 'Could not delete workspace. Please try again.');
         // Reload the shell and all workspace stores before selecting a remaining workspace.
         window.location.assign(withBasePath('/'));
      } catch (cause) {
         setError(cause instanceof Error ? cause.message : 'Could not delete workspace.');
         setPending(false);
         inFlight.current = false;
      }
   }

   return (
      <SettingsSection
         title="Delete workspace"
         description="Only the workspace owner can delete this workspace."
      >
         <AlertDialog
            open={open}
            onOpenChange={(value) => {
               if (inFlight.current) return;
               setOpen(value);
               setName('');
               setError('');
            }}
         >
            <VStack gap={3} padding={4} hAlign="start" className="rounded-lg border">
               <p className="text-sm text-muted-foreground">
                  Remove this workspace and its issues, projects, documents, and memberships. This
                  cannot be undone.
               </p>
               <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                     <Trash2 className="size-4" />
                     Delete workspace
                  </Button>
               </AlertDialogTrigger>
            </VStack>
            <AlertDialogContent
               onEscapeKeyDown={(event) => {
                  if (inFlight.current) event.preventDefault();
               }}
            >
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This permanently deletes {workspace.name} and its issues, projects, documents,
                     and memberships for everyone. Your account and other workspaces will remain.
                     This cannot be undone.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <VStack gap={2}>
                  <label htmlFor="delete-workspace-name" className="text-sm font-medium">
                     Workspace name
                  </label>
                  <p
                     id="delete-workspace-hint"
                     className="text-sm text-muted-foreground break-words"
                  >
                     Type <strong>{workspace.name}</strong> exactly to confirm.
                  </p>
                  <Input
                     id="delete-workspace-name"
                     aria-describedby="delete-workspace-hint"
                     autoComplete="off"
                     spellCheck={false}
                     value={name}
                     onChange={(event) => setName(event.target.value)}
                     disabled={pending}
                  />
                  {error && (
                     <p role="alert" className="text-sm text-destructive">
                        {error}
                     </p>
                  )}
               </VStack>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     variant="destructive"
                     disabled={!matches || pending}
                     onClick={(event) => {
                        event.preventDefault();
                        void remove();
                     }}
                  >
                     {pending ? 'Deleting…' : 'Delete workspace permanently'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </SettingsSection>
   );
}
