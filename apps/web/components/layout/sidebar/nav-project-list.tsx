'use client';

import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';
import { projectIcon } from '@/features/projects/project-icon';
import { mapStatus } from '@/features/projects/projects-data';
import { SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from '@/components/ui/sidebar';
import { responseData } from '@/lib/http';
import { projectPath } from '@/lib/project-route';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';

type ApiProject = { id: string; slug?: string; name: string; icon?: string | null; status: string };
export type SidebarProject = Omit<ApiProject, 'icon' | 'status'> & {
   icon: ComponentType<{ className?: string }>;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const VISIBLE = 10;

/**
 * Projects shown under a sidebar "Projects" entry. Without `teamId`: the user's starred projects
 * first (any status, as before), then the workspace's current projects (not Completed or Canceled
 * in the Projects page's own status mapping), without duplicates. With `teamId`: that team's
 * current projects. Returns undefined while loading or after an error, so nothing renders instead
 * of a misleading "No project"; reloads when a star changes.
 * shortcut: filters the first API page (100 newest projects) on the client because the API has no
 * status filter; add one if a workspace keeps more than 100 projects and older current ones go missing.
 * VI: Các dự án hiện dưới mục "Projects" ở sidebar. Không có `teamId`: dự án người dùng gắn sao
 * VI: đứng trước (mọi trạng thái, như trước đây), sau đó là dự án hiện tại của workspace (không
 * VI: Completed hay Canceled theo cách map trạng thái của trang Projects), không trùng. Có `teamId`:
 * VI: dự án hiện tại của team đó. Trả undefined khi đang tải hoặc lỗi để không hiện "Chưa có dự án"
 * VI: sai; tải lại khi sao thay đổi.
 * VI: shortcut: lọc trang API đầu (100 dự án mới nhất) phía client vì API chưa có bộ lọc trạng
 * VI: thái; thêm bộ lọc nếu workspace có hơn 100 dự án và dự án hiện tại cũ hơn bị thiếu.
 */
export function useSidebarProjects(teamId?: string): SidebarProject[] | undefined {
   const { orgId } = useParams<{ orgId: string }>();
   const [projects, setProjects] = useState<SidebarProject[]>();

   useEffect(() => {
      let request = 0;
      const load = async () => {
         const current = ++request;
         try {
            const workspace = await loadCurrentWorkspace(orgId);
            const fetchProjects = (extra: Record<string, string>) =>
               authenticatedFetch(
                  `${api}/projects?${new URLSearchParams({ workspaceId: workspace.id, limit: '100', ...extra })}`
               ).then((response) => responseData<ApiProject[]>(response));
            const [starred, page] = await Promise.all([
               teamId ? [] : fetchProjects({ favorite: 'true' }),
               fetchProjects(teamId ? { teamId } : {}),
            ]);
            const open = page.filter(
               (row) => !['completed', 'canceled'].includes(mapStatus(row.status).category)
            );
            const rows = [...starred, ...open].filter(
               (row, index, all) => all.findIndex((other) => other.id === row.id) === index
            );
            if (current === request)
               setProjects(
                  rows.map((row) => ({
                     id: row.id,
                     slug: row.slug,
                     name: row.name,
                     icon: projectIcon(row.icon),
                  }))
               );
         } catch {
            if (current === request) setProjects(undefined);
         }
      };
      void load();
      window.addEventListener('flowie-project-favorites-changed', load);
      return () => {
         request++;
         window.removeEventListener('flowie-project-favorites-changed', load);
      };
   }, [orgId, teamId]);

   return projects;
}

/**
 * True when `pathname` is a page of one of `projects`, so the section holding them can open.
 * VI: True khi `pathname` là trang của một dự án trong `projects`, để khối chứa chúng tự mở.
 */
export function isProjectPage(
   pathname: string,
   orgId: string,
   projects: SidebarProject[] | undefined
): boolean {
   return Boolean(
      projects?.some((project) => pathname.startsWith(projectPath(orgId, project, '')))
   );
}

/**
 * The first ten `projects` as links, a "View all" link to `viewAllHref` when there are more, and a
 * "No project" row when the loaded list is empty. Renders nothing while loading or after an error.
 * VI: Mười dự án đầu dưới dạng link, link "Xem tất cả" tới `viewAllHref` khi còn nữa, và dòng
 * VI: "Chưa có dự án" khi danh sách đã tải mà rỗng. Không render gì khi đang tải hoặc lỗi.
 */
export function NavProjectList({
   projects,
   viewAllHref,
}: {
   projects: SidebarProject[] | undefined;
   viewAllHref: string;
}) {
   const tx = useMessages(messages);
   const { orgId } = useParams<{ orgId: string }>();
   if (!projects) return null;
   return (
      <SidebarMenuSub className="mr-0 pr-0">
         {projects.slice(0, VISIBLE).map((project) => (
            <SidebarMenuSubItem key={project.id}>
               <SidebarMenuSubButton asChild>
                  <Link href={projectPath(orgId, project)} title={project.name}>
                     <project.icon className="size-4 shrink-0" />
                     <span>{project.name}</span>
                  </Link>
               </SidebarMenuSubButton>
            </SidebarMenuSubItem>
         ))}
         {projects.length > VISIBLE && (
            <SidebarMenuSubItem>
               <SidebarMenuSubButton asChild>
                  <Link href={viewAllHref} className="text-muted-foreground">
                     <span>{tx('View all')}</span>
                  </Link>
               </SidebarMenuSubButton>
            </SidebarMenuSubItem>
         )}
         {!projects.length && (
            <SidebarMenuSubItem>
               <span className="text-muted-foreground flex h-7 items-center px-2 text-sm">
                  {tx('No project')}
               </span>
            </SidebarMenuSubItem>
         )}
      </SidebarMenuSub>
   );
}
