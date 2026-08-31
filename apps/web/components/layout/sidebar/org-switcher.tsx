'use client';

import * as React from 'react';
import { ChevronsUpDown, ShieldCheck } from 'lucide-react';

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
import { CreateNewIssue } from './create-new-issue';
import { ThemeToggle } from '../theme-toggle';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
   authenticatedFetch,
   createWorkspace,
   loadWorkspaceMemberships,
   type WorkspaceMembership,
   type WorkspaceSummary,
} from '@/lib/workspaces';
import { cn } from '@/lib/utils';
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
import { toast } from 'sonner';

const WORKSPACE_MARK_COLORS = ['#5e6ad2', '#26b5ce', '#4cb782', '#f2994a', '#eb5757', '#8b5cf6'];

const workspaceMark = (workspace?: { name: string; icon?: string | null }) =>
   workspace?.icon?.trim() || workspace?.name.slice(0, 2).toUpperCase() || 'FL';

/**
 * An emoji sits on the same neutral tile every other icon in the app uses.
 * Initials have nothing to stand on, so they take a colour derived from the
 * workspace id: stable for one workspace and different between two, which a
 * fixed orange square could never be.
 */
function WorkspaceMark({ workspace }: { workspace?: WorkspaceSummary }) {
   const icon = workspace?.icon?.trim();
   const seed = [...(workspace?.id ?? '')].reduce(
      (total, character) => total + character.charCodeAt(0),
      0
   );
   return (
      <div
         className={cn(
            'flex aspect-square size-6 items-center justify-center rounded text-xs font-medium shrink-0',
            icon ? 'bg-muted/50' : 'text-white'
         )}
         style={
            icon
               ? undefined
               : {
                    backgroundColor: WORKSPACE_MARK_COLORS[seed % WORKSPACE_MARK_COLORS.length],
                 }
         }
      >
         {workspaceMark(workspace)}
      </div>
   );
}

export function OrgSwitcher() {
   const { orgId } = useParams<{ orgId: string }>();
   const pathname = usePathname();
   const router = useRouter();
   const [memberships, setMemberships] = React.useState<WorkspaceMembership[]>([]);
   const [invitationCount, setInvitationCount] = React.useState(0);
   const [loading, setLoading] = React.useState(true);
   const [createOpen, setCreateOpen] = React.useState(false);
   const [workspaceName, setWorkspaceName] = React.useState('');
   const [creating, setCreating] = React.useState(false);
   const [workspaceVersion, setWorkspaceVersion] = React.useState(0);
   const [isPlatformAdmin, setIsPlatformAdmin] = React.useState(false);

   React.useEffect(() => {
      const onWorkspaceUpdated = () => setWorkspaceVersion((version) => version + 1);
      window.addEventListener('flowie:workspace-updated', onWorkspaceUpdated);
      return () => window.removeEventListener('flowie:workspace-updated', onWorkspaceUpdated);
   }, []);

   React.useEffect(() => {
      let current = true;
      void Promise.all([
         loadWorkspaceMemberships(),
         authenticatedFetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/workspaces/invitations`
         ),
         authenticatedFetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/users/me`
         ),
      ])
         .then(async ([nextMemberships, invitationsResponse, profileResponse]) => {
            if (!current) return;
            setMemberships(nextMemberships);
            if (invitationsResponse.ok) {
               const invitations = (await invitationsResponse.json()) as { data: unknown[] };
               if (current) setInvitationCount(invitations.data.length);
            }
            if (profileResponse.ok) {
               const profile = (await profileResponse.json()) as {
                  data?: { isPlatformAdmin?: boolean };
               };
               if (current) setIsPlatformAdmin(Boolean(profile.data?.isPlatformAdmin));
            } else if (current) {
               setIsPlatformAdmin(false);
            }
            const matched = nextMemberships.some(
               ({ workspace }) => workspace.slug === orgId || workspace.id === orgId
            );
            if (!matched && nextMemberships[0]) {
               const rest = pathname.split('/').slice(2).join('/');
               router.replace(`/${nextMemberships[0].workspace.slug}${rest ? `/${rest}` : ''}`);
            }
         })
         .catch(() => {
            if (current)
               toast.error('Your workspace session is not available. Please sign in again.');
         })
         .finally(() => {
            if (current) setLoading(false);
         });
      return () => {
         current = false;
      };
   }, [orgId, pathname, router, workspaceVersion]);

   const currentWorkspace = memberships.find(
      ({ workspace }) => workspace.slug === orgId || workspace.id === orgId
   )?.workspace;
   const workspaceHref = (slug: string) => {
      const rest = pathname.split('/').slice(2).join('/');
      return `/${slug}${rest ? `/${rest}` : ''}`;
   };
   const signOut = async () => {
      await fetch(
         `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/auth/logout`,
         {
            method: 'POST',
            credentials: 'include',
         }
      );
      router.replace('/auth/login');
      router.refresh();
   };
   const submitWorkspace = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (workspaceName.trim().length < 2) return;
      setCreating(true);
      try {
         const workspace = await createWorkspace(workspaceName);
         setCreateOpen(false);
         setWorkspaceName('');
         router.push(`/${workspace.slug}/teams`);
         router.refresh();
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not create workspace.');
      } finally {
         setCreating(false);
      }
   };
   return (
      <>
         <SidebarMenu>
            <SidebarMenuItem>
               <DropdownMenu>
                  <div className="w-full flex gap-1 items-center pt-2">
                     <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                           size="lg"
                           className="h-8 p-1 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                           <WorkspaceMark workspace={currentWorkspace} />
                           <div className="grid flex-1 text-left text-sm leading-tight">
                              <span className="truncate font-semibold">
                                 {currentWorkspace?.name ??
                                    (loading
                                       ? 'Loading…'
                                       : memberships.length === 0
                                         ? 'No workspace'
                                         : 'Workspace')}
                              </span>
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
                        {currentWorkspace ? (
                           <>
                              <DropdownMenuItem asChild>
                                 <Link href={`/${currentWorkspace.slug}/settings`}>
                                    Settings
                                    <DropdownMenuShortcut>G then S</DropdownMenuShortcut>
                                 </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                 <Link href={`/${currentWorkspace.slug}/members`}>
                                    Invite and manage members
                                 </Link>
                              </DropdownMenuItem>
                              {isPlatformAdmin && (
                                 <DropdownMenuItem asChild>
                                    <Link href="/admin">
                                       <ShieldCheck className="text-muted-foreground" />
                                       Go to admin panel
                                    </Link>
                                 </DropdownMenuItem>
                              )}
                           </>
                        ) : (
                           <>
                              <DropdownMenuItem disabled>
                                 Settings
                                 <DropdownMenuShortcut>G then S</DropdownMenuShortcut>
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled>
                                 Invite and manage members
                              </DropdownMenuItem>
                           </>
                        )}
                     </DropdownMenuGroup>
                     <DropdownMenuSeparator />
                     <DropdownMenuGroup>
                        <DropdownMenuItem disabled>Download desktop app</DropdownMenuItem>
                     </DropdownMenuGroup>
                     <DropdownMenuSeparator />
                     <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Switch Workspace</DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                           <DropdownMenuSubContent>
                              <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {memberships.map(({ workspace }) => (
                                 <DropdownMenuItem key={workspace.id} asChild>
                                    <Link href={workspaceHref(workspace.slug)}>
                                       <WorkspaceMark workspace={workspace} />
                                       {workspace.name}
                                    </Link>
                                 </DropdownMenuItem>
                              ))}
                              {memberships.length === 0 && (
                                 <DropdownMenuItem disabled>
                                    No workspace available
                                 </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                 <Link href="/invitations">
                                    Workspace invitations
                                    {invitationCount > 0 && ` (${invitationCount})`}
                                 </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
                                 Create workspace
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled>Add an account</DropdownMenuItem>
                           </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                     </DropdownMenuSub>
                     <DropdownMenuItem onSelect={() => void signOut()}>
                        Log out
                        <DropdownMenuShortcut>⌥⇧Q</DropdownMenuShortcut>
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            </SidebarMenuItem>
         </SidebarMenu>
         <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="sm:max-w-md">
               <DialogHeader>
                  <DialogTitle>Create workspace</DialogTitle>
                  <DialogDescription>
                     Start a separate workspace for another team or organization.
                  </DialogDescription>
               </DialogHeader>
               <form className="grid gap-4" onSubmit={submitWorkspace}>
                  <label className="grid gap-1.5 text-sm font-medium">
                     Workspace name
                     <Input
                        autoFocus
                        value={workspaceName}
                        onChange={(event) => setWorkspaceName(event.target.value)}
                        minLength={2}
                        maxLength={120}
                        required
                     />
                  </label>
                  <DialogFooter>
                     <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setCreateOpen(false)}
                        disabled={creating}
                     >
                        Cancel
                     </Button>
                     <Button type="submit" disabled={creating || workspaceName.trim().length < 2}>
                        {creating ? 'Creating…' : 'Create workspace'}
                     </Button>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>
      </>
   );
}
