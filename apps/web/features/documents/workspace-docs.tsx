'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';
import { messages as navigation } from '@/features/navigation/messages.vi';
import { useProjectsData } from '@/features/projects/projects-data';
import { ProjectDocs } from './project-docs';

/**
 * Selected project of the workspace Docs page, kept in `?project=` so the view can be shared
 * and survives reloads; without it, or with an id outside the list, the first project is used.
 * VI: Dự án đang chọn của trang Docs chung, lưu trong `?project=` để chia sẻ được và giữ khi
 * VI: tải lại; không có hoặc id không thuộc danh sách thì dùng dự án đầu tiên.
 */
function useSelectedProject() {
   const { allProjects } = useProjectsData();
   const params = useSearchParams();
   const router = useRouter();
   const pathname = usePathname();
   const requested = params.get('project');
   const project = allProjects.find((item) => item.id === requested) ?? allProjects[0];
   const select = (id: string) => router.replace(`${pathname}?project=${encodeURIComponent(id)}`);
   return { allProjects, project, select };
}

/** Header with the project picker. VI: Header kèm bộ chọn dự án. */
export function WorkspaceDocsHeader() {
   const tx = useMessages(navigation);
   const { allProjects, project, select } = useSelectedProject();
   return (
      <div className="flex h-10 w-full items-center gap-2 border-b px-6 py-1.5">
         <SidebarTrigger />
         <span className="text-sm font-medium">{tx('Docs')}</span>
         {project && (
            <Select value={project.id} onValueChange={select}>
               <SelectTrigger className="h-7 w-56 text-xs" aria-label={tx('Projects')}>
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  {allProjects.map((item) => (
                     <SelectItem key={item.id} value={item.id}>
                        {item.name}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         )}
      </div>
   );
}

/**
 * Workspace-wide Docs: the same tree and preview as a project's Docs tab, for the project
 * chosen in the header.
 * VI: Docs chung của workspace: cùng cây và khung xem trước như tab Docs của dự án, cho dự án
 * VI: được chọn ở header.
 */
export function WorkspaceDocs() {
   const tx = useMessages(messages);
   const { project } = useSelectedProject();
   if (!project)
      return <p className="p-6 text-sm text-muted-foreground">{tx('No projects yet.')}</p>;
   return <ProjectDocs key={project.id} projectId={project.id} />;
}
