'use client';

import { projectIcon } from '@/features/projects/project-icon';
import { SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from '@/components/ui/sidebar';
import { responseData } from '@/lib/http';
import { projectPath } from '@/lib/project-route';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';

type ApiFavoriteProject = { id: string; slug?: string; name: string; icon?: string | null };
type FavoriteProject = Omit<ApiFavoriteProject, 'icon'> & {
   icon: ComponentType<{ className?: string }>;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Lists the signed-in user's starred projects under the Projects sidebar entry and reloads when a
 * star changes. Renders nothing while empty or when loading fails: the sidebar is a shortcut, and
 * the Projects page stays reachable either way.
 * shortcut: shows the first API page (100 projects); add paging if one user stars more than that.
 * VI: Liệt kê dự án người dùng đã gắn sao dưới mục Projects ở sidebar và tải lại khi sao thay đổi.
 * VI: Không hiển thị gì khi rỗng hoặc tải lỗi: sidebar chỉ là lối tắt, trang Projects vẫn mở được.
 * VI: shortcut: chỉ hiện trang API đầu (100 dự án); thêm phân trang nếu một người gắn sao nhiều hơn.
 */
export function NavFavoriteProjects() {
   const { orgId } = useParams<{ orgId: string }>();
   const [projects, setProjects] = useState<FavoriteProject[]>([]);

   useEffect(() => {
      let request = 0;
      const load = async () => {
         const current = ++request;
         try {
            const workspace = await loadCurrentWorkspace(orgId);
            const query = new URLSearchParams({
               workspaceId: workspace.id,
               favorite: 'true',
               limit: '100',
            });
            const rows = await responseData<ApiFavoriteProject[]>(
               await authenticatedFetch(`${api}/projects?${query}`)
            );
            if (current === request)
               setProjects(rows.map((row) => ({ ...row, icon: projectIcon(row.icon) })));
         } catch {
            if (current === request) setProjects([]);
         }
      };
      void load();
      window.addEventListener('flowie-project-favorites-changed', load);
      return () => {
         request++;
         window.removeEventListener('flowie-project-favorites-changed', load);
      };
   }, [orgId]);

   if (!projects.length) return null;
   return (
      <SidebarMenuSub>
         {projects.map((project) => (
            <SidebarMenuSubItem key={project.id}>
               <SidebarMenuSubButton asChild>
                  <Link href={projectPath(orgId, project)} title={project.name}>
                     <project.icon className="size-4 shrink-0" />
                     <span>{project.name}</span>
                  </Link>
               </SidebarMenuSubButton>
            </SidebarMenuSubItem>
         ))}
      </SidebarMenuSub>
   );
}
