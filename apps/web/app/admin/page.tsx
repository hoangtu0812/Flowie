'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
   Building2,
   FolderKanban,
   LayoutDashboard,
   RefreshCw,
   ShieldCheck,
   Users,
} from 'lucide-react';

import { AdminSidebar, type AdminSection } from '@/components/admin/admin-sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
} from '@/components/ui/table';
import { authenticatedFetch, loadWorkspaceMemberships } from '@/lib/workspaces';
import { cn } from '@/lib/utils';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type Overview = {
   users: number;
   activeUsers: number;
   organizations: number;
   workspaces: number;
   projects: number;
   issues: number;
};

type User = {
   id: string;
   name: string;
   email: string;
   status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'DISABLED';
   isPlatformAdmin: boolean;
   createdAt: string;
   lastLoginAt: string | null;
   _count: { memberships: number; organizations: number };
};

type Workspace = {
   id: string;
   name: string;
   slug: string;
   createdAt: string;
   organization: { name: string; slug: string; owner: { name: string; email: string } };
   _count: { members: number; teams: number; projects: number; issues: number };
};

const sectionCopy: Record<AdminSection, { title: string; description: string }> = {
   overview: {
      title: 'Platform overview',
      description: 'A high-level view of Flowie usage and platform resources.',
   },
   users: {
      title: 'Users',
      description: 'Review platform access and suspend or reactivate user accounts.',
   },
   workspaces: {
      title: 'Workspaces',
      description: 'Inspect every organization workspace and its current usage.',
   },
};

function formatDate(value: string | null): string {
   return value
      ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
      : 'Never';
}

function countLabel(count: number, singular: string): string {
   return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function statusVariant(
   status: User['status']
): 'default' | 'secondary' | 'destructive' | 'outline' {
   if (status === 'ACTIVE') return 'default';
   if (status === 'SUSPENDED' || status === 'DISABLED') return 'destructive';
   return 'secondary';
}

function MetricCard({
   label,
   value,
   hint,
   icon: Icon,
   tone = 'default',
}: {
   label: string;
   value: number;
   hint: string;
   icon: typeof Users;
   tone?: 'default' | 'success' | 'warning';
}) {
   const toneClass = {
      default: 'bg-primary/10 text-primary',
      success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
   }[tone];

   return (
      <Card className="gap-0 py-0 shadow-none">
         <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
               <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
               </div>
               <span
                  className={cn('flex size-8 items-center justify-center rounded-lg', toneClass)}
               >
                  <Icon className="size-4" />
               </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
         </CardContent>
      </Card>
   );
}

function LoadingOverview() {
   return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading overview">
         {Array.from({ length: 4 }, (_, index) => (
            <Card key={index} className="gap-0 py-0 shadow-none">
               <CardContent className="space-y-3 p-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-14" />
                  <Skeleton className="h-3 w-36" />
               </CardContent>
            </Card>
         ))}
      </div>
   );
}

export default function AdminPage() {
   const router = useRouter();
   const [section, setSection] = useState<AdminSection>('overview');
   const [overview, setOverview] = useState<Overview | null>(null);
   const [users, setUsers] = useState<User[]>([]);
   const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
   const [appHref, setAppHref] = useState('/invitations');
   const [query, setQuery] = useState('');
   const [error, setError] = useState<string | null>(null);
   const [loading, setLoading] = useState(true);
   const [savingUserId, setSavingUserId] = useState<string | null>(null);

   const load = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
         const [overviewResponse, usersResponse, workspacesResponse] = await Promise.all([
            authenticatedFetch(`${api}/admin/overview`),
            authenticatedFetch(`${api}/admin/users`),
            authenticatedFetch(`${api}/admin/workspaces`),
         ]);
         if (overviewResponse.status === 401) {
            router.replace('/auth/login');
            return;
         }
         if (overviewResponse.status === 403) {
            throw new Error('This account does not have platform administrator access.');
         }
         if (!overviewResponse.ok || !usersResponse.ok || !workspacesResponse.ok) {
            throw new Error('Could not load administration data.');
         }
         const [overviewPayload, usersPayload, workspacesPayload] = await Promise.all([
            overviewResponse.json(),
            usersResponse.json(),
            workspacesResponse.json(),
         ]);
         setOverview(overviewPayload.data as Overview);
         setUsers(usersPayload.data as User[]);
         setWorkspaces(workspacesPayload.data as Workspace[]);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not load administration data.');
      } finally {
         setLoading(false);
      }
   }, [router]);

   useEffect(() => {
      void load();
      void loadWorkspaceMemberships()
         .then((memberships) => {
            if (memberships[0]) setAppHref(`/${memberships[0].workspace.slug}/inbox`);
         })
         .catch(() => undefined);
   }, [load]);

   const filteredUsers = useMemo(() => {
      const normalized = query.trim().toLocaleLowerCase();
      return normalized
         ? users.filter((user) =>
              `${user.name} ${user.email}`.toLocaleLowerCase().includes(normalized)
           )
         : users;
   }, [query, users]);

   async function updateUser(user: User, data: Pick<User, 'status'>) {
      setSavingUserId(user.id);
      setError(null);
      try {
         const response = await authenticatedFetch(`${api}/admin/users/${user.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
         });
         const payload = (await response.json()) as { data?: User; message?: string | string[] };
         if (!response.ok || !payload.data) {
            throw new Error(
               Array.isArray(payload.message)
                  ? payload.message[0]
                  : (payload.message ?? 'Could not update this account.')
            );
         }
         setUsers((current) => current.map((item) => (item.id === user.id ? payload.data! : item)));
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not update this account.');
      } finally {
         setSavingUserId(null);
      }
   }

   async function logout() {
      await fetch(`${api}/auth/logout`, { method: 'POST', credentials: 'include' });
      router.replace('/auth/login');
      router.refresh();
   }

   const copy = sectionCopy[section];

   return (
      <SidebarProvider>
         <AdminSidebar
            activeSection={section}
            appHref={appHref}
            onNavigate={setSection}
            onLogout={() => void logout()}
         />
         <div className="h-svh w-full overflow-hidden lg:p-2">
            <div className="flex h-full w-full flex-col items-center justify-start overflow-hidden bg-container lg:rounded-md lg:border">
               <header className="flex h-10 w-full shrink-0 items-center justify-between border-b px-4 md:px-6">
                  <div className="flex items-center gap-2">
                     <SidebarTrigger />
                     <div className="flex items-center gap-1.5">
                        <ShieldCheck className="size-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Administration</span>
                     </div>
                  </div>
                  <Button
                     size="xs"
                     variant="secondary"
                     disabled={loading}
                     onClick={() => void load()}
                  >
                     <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                     Refresh
                  </Button>
               </header>

               <main className="h-[calc(100svh-40px)] w-full overflow-auto lg:h-[calc(100svh-56px)]">
                  <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
                     <div>
                        <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
                     </div>

                     {error && (
                        <div
                           role="alert"
                           className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
                        >
                           <p className="font-medium">Administration data could not be loaded.</p>
                           <p className="mt-1 text-muted-foreground">{error}</p>
                           <Button
                              className="mt-3"
                              size="sm"
                              variant="outline"
                              onClick={() => void load()}
                           >
                              Try again
                           </Button>
                        </div>
                     )}

                     {section === 'overview' && (
                        <>
                           {loading && !overview ? (
                              <LoadingOverview />
                           ) : overview ? (
                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                 <MetricCard
                                    label="Users"
                                    value={overview.users}
                                    icon={Users}
                                    tone="success"
                                    hint={`${overview.activeUsers} active accounts`}
                                 />
                                 <MetricCard
                                    label="Workspaces"
                                    value={overview.workspaces}
                                    icon={Building2}
                                    hint={`Across ${countLabel(overview.organizations, 'organization')}`}
                                 />
                                 <MetricCard
                                    label="Projects"
                                    value={overview.projects}
                                    icon={FolderKanban}
                                    hint="Projects across the platform"
                                 />
                                 <MetricCard
                                    label="Issues"
                                    value={overview.issues}
                                    icon={LayoutDashboard}
                                    tone="warning"
                                    hint="Total work items created"
                                 />
                              </div>
                           ) : null}

                           <Card className="gap-0 py-0 shadow-none">
                              <CardHeader className="border-b px-5 py-4">
                                 <CardTitle className="text-sm">Administrator access</CardTitle>
                                 <CardDescription className="text-xs">
                                    Platform administration is intentionally separate from workspace
                                    roles.
                                 </CardDescription>
                              </CardHeader>
                              <CardContent className="grid gap-4 p-5 text-sm md:grid-cols-2">
                                 <div>
                                    <p className="font-medium">Environment managed</p>
                                    <p className="mt-1 text-muted-foreground">
                                       The administrator is selected by the production ADMIN_EMAIL
                                       setting.
                                    </p>
                                 </div>
                                 <div>
                                    <p className="font-medium">Protected account</p>
                                    <p className="mt-1 text-muted-foreground">
                                       The configured administrator cannot be suspended from this
                                       panel.
                                    </p>
                                 </div>
                              </CardContent>
                           </Card>
                        </>
                     )}

                     {section === 'users' && (
                        <Card className="gap-0 py-0 shadow-none">
                           <CardHeader className="gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                 <CardTitle className="text-sm">All users</CardTitle>
                                 <CardDescription className="mt-1 text-xs">
                                    {users.length} accounts across the platform
                                 </CardDescription>
                              </div>
                              <Input
                                 value={query}
                                 onChange={(event) => setQuery(event.target.value)}
                                 placeholder="Search by name or email"
                                 aria-label="Search users"
                                 className="w-full sm:max-w-xs"
                              />
                           </CardHeader>
                           <CardContent className="overflow-x-auto p-0">
                              <Table className="min-w-[850px]">
                                 <TableHeader>
                                    <TableRow>
                                       <TableHead className="pl-5">User</TableHead>
                                       <TableHead>Status</TableHead>
                                       <TableHead>Scope</TableHead>
                                       <TableHead>Last login</TableHead>
                                       <TableHead className="pr-5 text-right">Action</TableHead>
                                    </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                    {filteredUsers.map((user) => {
                                       const saving = savingUserId === user.id;
                                       return (
                                          <TableRow key={user.id}>
                                             <TableCell className="pl-5">
                                                <div className="flex items-center gap-2 font-medium">
                                                   {user.name}
                                                   {user.isPlatformAdmin && (
                                                      <Badge variant="outline">Admin</Badge>
                                                   )}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                   {user.email}
                                                </div>
                                             </TableCell>
                                             <TableCell>
                                                <Badge variant={statusVariant(user.status)}>
                                                   {user.status}
                                                </Badge>
                                             </TableCell>
                                             <TableCell className="text-muted-foreground">
                                                {countLabel(user._count.memberships, 'workspace')} ·{' '}
                                                {countLabel(
                                                   user._count.organizations,
                                                   'organization'
                                                )}
                                             </TableCell>
                                             <TableCell className="text-muted-foreground">
                                                {formatDate(user.lastLoginAt)}
                                             </TableCell>
                                             <TableCell className="pr-5">
                                                <div className="flex justify-end">
                                                   <Button
                                                      size="sm"
                                                      variant={
                                                         user.status === 'ACTIVE'
                                                            ? 'destructive'
                                                            : 'outline'
                                                      }
                                                      disabled={saving || user.isPlatformAdmin}
                                                      title={
                                                         user.isPlatformAdmin
                                                            ? 'Change ADMIN_EMAIL in the deployment environment to transfer administrator access.'
                                                            : undefined
                                                      }
                                                      onClick={() =>
                                                         void updateUser(user, {
                                                            status:
                                                               user.status === 'ACTIVE'
                                                                  ? 'SUSPENDED'
                                                                  : 'ACTIVE',
                                                         })
                                                      }
                                                   >
                                                      {saving
                                                         ? 'Saving…'
                                                         : user.status === 'ACTIVE'
                                                           ? 'Suspend'
                                                           : 'Activate'}
                                                   </Button>
                                                </div>
                                             </TableCell>
                                          </TableRow>
                                       );
                                    })}
                                    {!loading && filteredUsers.length === 0 && (
                                       <TableRow>
                                          <TableCell
                                             colSpan={5}
                                             className="py-10 text-center text-muted-foreground"
                                          >
                                             No users match this search.
                                          </TableCell>
                                       </TableRow>
                                    )}
                                 </TableBody>
                              </Table>
                           </CardContent>
                        </Card>
                     )}

                     {section === 'workspaces' && (
                        <Card className="gap-0 py-0 shadow-none">
                           <CardHeader className="border-b px-5 py-4">
                              <CardTitle className="text-sm">All workspaces</CardTitle>
                              <CardDescription className="mt-1 text-xs">
                                 {workspaces.length} workspaces across the platform
                              </CardDescription>
                           </CardHeader>
                           <CardContent className="overflow-x-auto p-0">
                              <Table className="min-w-[850px]">
                                 <TableHeader>
                                    <TableRow>
                                       <TableHead className="pl-5">Workspace</TableHead>
                                       <TableHead>Owner</TableHead>
                                       <TableHead>Members</TableHead>
                                       <TableHead>Usage</TableHead>
                                       <TableHead className="pr-5">Created</TableHead>
                                    </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                    {workspaces.map((workspace) => (
                                       <TableRow key={workspace.id}>
                                          <TableCell className="pl-5">
                                             <div className="font-medium">{workspace.name}</div>
                                             <div className="text-xs text-muted-foreground">
                                                {workspace.organization.name} · {workspace.slug}
                                             </div>
                                          </TableCell>
                                          <TableCell>
                                             <div>{workspace.organization.owner.name}</div>
                                             <div className="text-xs text-muted-foreground">
                                                {workspace.organization.owner.email}
                                             </div>
                                          </TableCell>
                                          <TableCell>{workspace._count.members}</TableCell>
                                          <TableCell className="text-muted-foreground">
                                             {countLabel(workspace._count.teams, 'team')} ·{' '}
                                             {countLabel(workspace._count.projects, 'project')} ·{' '}
                                             {countLabel(workspace._count.issues, 'issue')}
                                          </TableCell>
                                          <TableCell className="pr-5 text-muted-foreground">
                                             {formatDate(workspace.createdAt)}
                                          </TableCell>
                                       </TableRow>
                                    ))}
                                    {!loading && workspaces.length === 0 && (
                                       <TableRow>
                                          <TableCell
                                             colSpan={5}
                                             className="py-10 text-center text-muted-foreground"
                                          >
                                             No workspaces have been created yet.
                                          </TableCell>
                                       </TableRow>
                                    )}
                                 </TableBody>
                              </Table>
                           </CardContent>
                        </Card>
                     )}
                  </div>
               </main>
            </div>
         </div>
      </SidebarProvider>
   );
}
