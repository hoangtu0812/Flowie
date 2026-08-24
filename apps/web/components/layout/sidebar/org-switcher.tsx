'use client';

import * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuGroup,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuPortal,
   DropdownMenuSeparator,
   DropdownMenuShortcut,
   DropdownMenuSub,
   DropdownMenuSubContent,
   DropdownMenuSubTrigger,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import {
   createWorkspace,
   loadWorkspaceMemberships,
   type WorkspaceMembership,
} from '@/lib/workspaces';
import { CreateNewIssue } from './create-new-issue';
import { ThemeToggle } from '../theme-toggle';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const initials = (name: string) =>
   name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'W';

export function OrgSwitcher() {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const [memberships, setMemberships] = React.useState<WorkspaceMembership[]>([]);
   const [user, setUser] = React.useState<{ email: string }>();
   const [createOpen, setCreateOpen] = React.useState(false);
   const [workspaceName, setWorkspaceName] = React.useState('');
   const [createError, setCreateError] = React.useState<string>();
   const [creating, setCreating] = React.useState(false);

   React.useEffect(() => {
      void Promise.all([
         loadWorkspaceMemberships(),
         fetch(`${api}/users/me`, { credentials: 'include' }).then(async (response) => {
            if (!response.ok) throw new Error('Could not load the current user.');
            return ((await response.json()) as { data: { email: string } }).data;
         }),
      ])
         .then(([availableMemberships, currentUser]) => {
            setMemberships(availableMemberships);
            setUser(currentUser);
         })
         .catch(() => {
            setMemberships([]);
            setUser(undefined);
         });
   }, []);

   const current = memberships.find(({ workspace }) => workspace.slug === orgId)?.workspace;
   const currentName = current?.name ?? orgId;
   const logout = async () => {
      await fetch(`${api}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(
         () => null
      );
      router.replace('/auth/login');
      router.refresh();
   };
   const submitWorkspace = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = workspaceName.trim();
      if (name.length < 2 || creating) return;
      setCreating(true);
      setCreateError(undefined);
      try {
         const workspace = await createWorkspace(name);
         setMemberships(await loadWorkspaceMemberships());
         setCreateOpen(false);
         setWorkspaceName('');
         router.push(`/${workspace.slug}`);
         router.refresh();
      } catch (error) {
         setCreateError(error instanceof Error ? error.message : 'Could not create workspace.');
      } finally {
         setCreating(false);
      }
   };

   return (
      <SidebarMenu>
         <SidebarMenuItem>
            <DropdownMenu>
               <div className="w-full flex gap-1 items-center pt-2">
                  <DropdownMenuTrigger asChild>
                     <SidebarMenuButton
                        size="lg"
                        className="h-8 p-1 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                     >
                        <div className="flex aspect-square size-6 items-center justify-center rounded bg-orange-500 text-sidebar-primary-foreground">
                           {initials(currentName)}
                        </div>
                        <div className="grid flex-1 text-left text-sm leading-tight">
                           <span className="truncate font-semibold">{currentName}</span>
                        </div>
                        <ChevronsUpDown className="ml-auto" />
                     </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <ThemeToggle />
                  <CreateNewIssue />
               </div>
               <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-60 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
               >
                  <DropdownMenuGroup>
                     <DropdownMenuItem asChild>
                        <Link href={`/${orgId}/settings`}>
                           Settings
                           <DropdownMenuShortcut>G then S</DropdownMenuShortcut>
                        </Link>
                     </DropdownMenuItem>
                     <DropdownMenuItem asChild>
                        <Link href={`/${orgId}/members`}>Invite and manage members</Link>
                     </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                     <DropdownMenuSubTrigger>Switch Workspace</DropdownMenuSubTrigger>
                     <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                           {user?.email && <DropdownMenuLabel>{user.email}</DropdownMenuLabel>}
                           {user?.email && <DropdownMenuSeparator />}
                           {memberships.map(({ workspace }) => (
                              <DropdownMenuItem key={workspace.id} asChild>
                                 <Link href={`/${workspace.slug}`}>
                                    <div className="flex aspect-square size-6 items-center justify-center rounded bg-orange-500 text-sidebar-primary-foreground">
                                       {initials(workspace.name)}
                                    </div>
                                    {workspace.name}
                                 </Link>
                              </DropdownMenuItem>
                           ))}
                           <DropdownMenuSeparator />
                           <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
                              Create or join workspace
                           </DropdownMenuItem>
                           <DropdownMenuItem disabled>Add an account</DropdownMenuItem>
                        </DropdownMenuSubContent>
                     </DropdownMenuPortal>
                  </DropdownMenuSub>
                  <DropdownMenuItem onSelect={() => void logout()}>
                     Log out
                     <DropdownMenuShortcut>⌥⇧Q</DropdownMenuShortcut>
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
               <DialogContent>
                  <form className="grid gap-4" onSubmit={submitWorkspace}>
                     <DialogHeader>
                        <DialogTitle>Create workspace</DialogTitle>
                        <DialogDescription>
                           Create a new workspace for a separate team or organization.
                        </DialogDescription>
                     </DialogHeader>
                     <Input
                        autoFocus
                        aria-label="Workspace name"
                        placeholder="Workspace name"
                        value={workspaceName}
                        onChange={(event) => setWorkspaceName(event.target.value)}
                        disabled={creating}
                     />
                     {createError && <p className="text-sm text-destructive">{createError}</p>}
                     <DialogFooter>
                        <Button
                           type="button"
                           variant="outline"
                           onClick={() => setCreateOpen(false)}
                           disabled={creating}
                        >
                           Cancel
                        </Button>
                        <Button
                           type="submit"
                           disabled={workspaceName.trim().length < 2 || creating}
                        >
                           {creating ? 'Creating…' : 'Create workspace'}
                        </Button>
                     </DialogFooter>
                  </form>
               </DialogContent>
            </Dialog>
         </SidebarMenuItem>
      </SidebarMenu>
   );
}
