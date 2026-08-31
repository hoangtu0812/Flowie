'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, FolderKanban, ShieldCheck, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
} from '@/components/ui/table';

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

function formatDate(value: string | null): string {
   return value
      ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value))
      : 'Chưa đăng nhập';
}

function statusVariant(
   status: User['status']
): 'default' | 'secondary' | 'destructive' | 'outline' {
   if (status === 'ACTIVE') return 'default';
   if (status === 'SUSPENDED' || status === 'DISABLED') return 'destructive';
   return 'secondary';
}

export default function AdminPage() {
   const router = useRouter();
   const [overview, setOverview] = useState<Overview | null>(null);
   const [users, setUsers] = useState<User[]>([]);
   const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
   const [query, setQuery] = useState('');
   const [error, setError] = useState<string | null>(null);
   const [loading, setLoading] = useState(true);
   const [savingUserId, setSavingUserId] = useState<string | null>(null);

   const load = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
         const [overviewResponse, usersResponse, workspacesResponse] = await Promise.all([
            fetch(`${api}/admin/overview`, { credentials: 'include' }),
            fetch(`${api}/admin/users`, { credentials: 'include' }),
            fetch(`${api}/admin/workspaces`, { credentials: 'include' }),
         ]);
         if (overviewResponse.status === 401) {
            router.replace('/auth/login');
            return;
         }
         if (overviewResponse.status === 403) {
            throw new Error('Tài khoản này không có quyền quản trị hệ thống.');
         }
         if (!overviewResponse.ok || !usersResponse.ok || !workspacesResponse.ok) {
            throw new Error('Không thể tải dữ liệu quản trị.');
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
         setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu quản trị.');
      } finally {
         setLoading(false);
      }
   }, [router]);

   useEffect(() => {
      void load();
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
         const response = await fetch(`${api}/admin/users/${user.id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
         });
         const payload = (await response.json()) as { data?: User; message?: string | string[] };
         if (!response.ok || !payload.data) {
            throw new Error(
               Array.isArray(payload.message)
                  ? payload.message[0]
                  : (payload.message ?? 'Không thể cập nhật tài khoản.')
            );
         }
         setUsers((current) => current.map((item) => (item.id === user.id ? payload.data! : item)));
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Không thể cập nhật tài khoản.');
      } finally {
         setSavingUserId(null);
      }
   }

   async function logout(event: FormEvent) {
      event.preventDefault();
      await fetch(`${api}/auth/logout`, { method: 'POST', credentials: 'include' });
      router.replace('/auth/login');
   }

   const cards = overview
      ? [
           {
              label: 'Người dùng',
              value: overview.users,
              note: `${overview.activeUsers} đang hoạt động`,
              icon: Users,
           },
           {
              label: 'Tổ chức',
              value: overview.organizations,
              note: `${overview.workspaces} workspace`,
              icon: Building2,
           },
           {
              label: 'Công việc',
              value: overview.issues,
              note: `${overview.projects} dự án`,
              icon: FolderKanban,
           },
        ]
      : [];

   return (
      <main className="min-h-svh bg-muted/30 px-4 py-6 sm:px-6 lg:px-10">
         <div className="mx-auto max-w-7xl space-y-7">
            <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
               <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary p-2.5 text-primary-foreground">
                     <ShieldCheck className="size-6" />
                  </div>
                  <div>
                     <p className="text-sm font-medium text-primary">Flowie Control Center</p>
                     <h1 className="text-2xl font-semibold tracking-tight">Quản trị hệ thống</h1>
                     <p className="mt-1 text-sm text-muted-foreground">
                        Quản lý người dùng và toàn bộ workspace trên nền tảng.
                     </p>
                  </div>
               </div>
               <div className="flex gap-2">
                  <Button variant="outline" onClick={() => router.back()}>
                     <ArrowLeft className="mr-2 size-4" /> Quay lại
                  </Button>
                  <form onSubmit={logout}>
                     <Button type="submit" variant="outline">
                        Đăng xuất
                     </Button>
                  </form>
               </div>
            </header>

            {error && (
               <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
               >
                  {error}
               </p>
            )}

            <section className="grid gap-4 md:grid-cols-3">
               {cards.map(({ label, value, note, icon: Icon }) => (
                  <Card key={label}>
                     <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{label}</CardTitle>
                        <Icon className="size-4 text-muted-foreground" />
                     </CardHeader>
                     <CardContent>
                        <div className="text-2xl font-bold">{value}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                     </CardContent>
                  </Card>
               ))}
            </section>

            <Card>
               <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                     <CardTitle>Người dùng</CardTitle>
                     <CardDescription>
                        Khóa hoặc mở khóa tài khoản. Platform admin được xác định duy nhất bởi biến
                        môi trường ADMIN_EMAIL.
                     </CardDescription>
                  </div>
                  <Input
                     value={query}
                     onChange={(event) => setQuery(event.target.value)}
                     placeholder="Tìm tên hoặc email"
                     className="sm:max-w-xs"
                  />
               </CardHeader>
               <CardContent>
                  <Table>
                     <TableHeader>
                        <TableRow>
                           <TableHead>Người dùng</TableHead>
                           <TableHead>Trạng thái</TableHead>
                           <TableHead>Phạm vi</TableHead>
                           <TableHead>Đăng nhập gần nhất</TableHead>
                           <TableHead className="text-right">Thao tác</TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {filteredUsers.map((user) => {
                           const saving = savingUserId === user.id;
                           return (
                              <TableRow key={user.id}>
                                 <TableCell>
                                    <div className="flex items-center gap-2 font-medium">
                                       {user.name}
                                       {user.isPlatformAdmin && (
                                          <Badge variant="outline">ADMIN_EMAIL</Badge>
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
                                    {user._count.memberships} workspace ·{' '}
                                    {user._count.organizations} tổ chức
                                 </TableCell>
                                 <TableCell className="text-muted-foreground">
                                    {formatDate(user.lastLoginAt)}
                                 </TableCell>
                                 <TableCell>
                                    <div className="flex justify-end gap-2">
                                       <Button
                                          size="sm"
                                          variant={
                                             user.status === 'ACTIVE' ? 'destructive' : 'outline'
                                          }
                                          disabled={saving || user.isPlatformAdmin}
                                          title={
                                             user.isPlatformAdmin
                                                ? 'Thay đổi ADMIN_EMAIL trong môi trường triển khai để chuyển quyền quản trị.'
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
                                          {user.status === 'ACTIVE' ? 'Tạm khóa' : 'Kích hoạt'}
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
                                 className="py-8 text-center text-muted-foreground"
                              >
                                 Không tìm thấy người dùng.
                              </TableCell>
                           </TableRow>
                        )}
                     </TableBody>
                  </Table>
               </CardContent>
            </Card>

            <Card>
               <CardHeader>
                  <CardTitle>Workspace</CardTitle>
                  <CardDescription>Toàn bộ workspace hiện có trên hệ thống.</CardDescription>
               </CardHeader>
               <CardContent>
                  <Table>
                     <TableHeader>
                        <TableRow>
                           <TableHead>Workspace</TableHead>
                           <TableHead>Chủ sở hữu</TableHead>
                           <TableHead>Thành viên</TableHead>
                           <TableHead>Dữ liệu</TableHead>
                           <TableHead>Tạo lúc</TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {workspaces.map((workspace) => (
                           <TableRow key={workspace.id}>
                              <TableCell>
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
                                 {workspace._count.teams} team · {workspace._count.projects} dự án ·{' '}
                                 {workspace._count.issues} việc
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                 {formatDate(workspace.createdAt)}
                              </TableCell>
                           </TableRow>
                        ))}
                        {!loading && workspaces.length === 0 && (
                           <TableRow>
                              <TableCell
                                 colSpan={5}
                                 className="py-8 text-center text-muted-foreground"
                              >
                                 Chưa có workspace.
                              </TableCell>
                           </TableRow>
                        )}
                     </TableBody>
                  </Table>
               </CardContent>
            </Card>
         </div>
      </main>
   );
}
