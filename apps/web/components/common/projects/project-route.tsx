'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import ProjectActivity from '@/components/common/projects/details/project-activity';
import ProjectIssues from '@/components/common/projects/details/project-issues';
import ProjectOverview from '@/components/common/projects/details/project-overview';
import ProjectTimeline from '@/components/common/projects/details/project-timeline';
import {
   LiveProjectProvider,
   useLiveProjectData,
} from '@/components/common/projects/details/use-live-project';
import { usePageEntity } from '@/features/shared/document-title';
import Header from '@/components/layout/headers/project/header';
import MainLayout from '@/components/layout/main-layout';
import { ProjectDocs } from '@/features/documents/project-docs';
import { responseData } from '@/lib/http';
import { canonicalProjectPath } from '@/lib/project-route';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const VIEWS = {
   overview: ProjectOverview,
   activity: ProjectActivity,
   issues: ProjectIssues,
   timeline: ProjectTimeline,
   docs: ProjectDocs,
} as const;

type Resolved = { id: string; slug: string };

// Keys already resolved in this tab, so the redirect from an id to the slug does not ask again.
// VI: Các khoá đã phân giải trong tab này, để lần chuyển từ id sang slug không phải hỏi lại.
const resolvedKeys = new Map<string, Resolved>();

/**
 * Records a project's new slug after a rename so the current tab maps every known key of that
 * project to it. VI: Ghi slug mới của dự án sau khi đổi để tab hiện tại ánh xạ mọi khoá đã biết của
 * VI: dự án đó sang slug mới.
 */
export function rememberProjectSlug(id: string, slug: string) {
   for (const [key, value] of resolvedKeys)
      if (value.id === id) resolvedKeys.set(key, { id, slug });
   resolvedKeys.set(slug, { id, slug });
   resolvedKeys.set(id, { id, slug });
}

/**
 * A project page opened as /project/<key>/<view>, where the key is the project id, its current
 * slug or an earlier slug. The key is resolved by the API (which checks access), the address bar
 * is replaced with the current slug while keeping the rest of the path, the query and the hash,
 * and the page renders with the real id. When the key cannot be resolved the page renders with
 * the key itself, so the views show their usual not-found or no-access state.
 * VI: Trang dự án mở bằng /project/<key>/<view>, với khoá là id, slug hiện tại hoặc slug cũ. Khoá
 * VI: được API phân giải (có kiểm tra quyền), thanh địa chỉ được thay bằng slug hiện tại nhưng giữ
 * VI: phần còn lại của path, query và hash, và trang render với id thật. Khi không phân giải được,
 * VI: trang render với chính khoá đó để các view hiện trạng thái không tìm thấy hoặc không có quyền.
 */
export function ProjectRoute({
   projectKey,
   view,
}: {
   projectKey: string;
   view: keyof typeof VIEWS;
}) {
   const router = useRouter();
   const pathname = usePathname();
   const [resolved, setResolved] = useState<Resolved | null | undefined>(() =>
      resolvedKeys.get(projectKey)
   );

   useEffect(() => {
      const known = resolvedKeys.get(projectKey);
      if (known) {
         setResolved(known);
         return;
      }
      let current = true;
      setResolved(undefined);
      void loadCurrentWorkspace()
         .then(async (workspace) => {
            const query = new URLSearchParams({ workspaceId: workspace.id, key: projectKey });
            return responseData<Resolved>(
               await authenticatedFetch(`${api}/projects/resolve?${query}`)
            );
         })
         .then((value) => {
            resolvedKeys.set(projectKey, value);
            resolvedKeys.set(value.slug, value);
            if (current) setResolved(value);
         })
         .catch(() => current && setResolved(null));
      return () => {
         current = false;
      };
   }, [projectKey]);

   useEffect(() => {
      if (!resolved) return;
      const target = canonicalProjectPath(
         pathname,
         resolved.slug,
         `${window.location.search}${window.location.hash}`
      );
      if (target) router.replace(target);
   }, [resolved, pathname, router]);

   if (resolved === undefined) return null;
   const projectId = resolved?.id ?? projectKey;
   const View = VIEWS[view];
   return (
      <LiveProjectProvider projectId={projectId}>
         <ProjectTitle />
         <MainLayout header={<Header projectId={projectId} />}>
            <View projectId={projectId} />
         </MainLayout>
      </LiveProjectProvider>
   );
}

/** Names the open project in the tab title. VI: Đặt tên dự án đang mở vào title tab. */
function ProjectTitle() {
   usePageEntity(useLiveProjectData().project?.name);
   return null;
}
