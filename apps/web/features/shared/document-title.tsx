'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { documentTitle, pageTitle } from '@/lib/page-title';
import { workspaceKey } from '@/lib/workspace-route';
import { loadCurrentWorkspace } from '@/lib/workspaces';
import { useIssuesStore } from '@/store/issues-store';

type PageEntity = { path: string; name: string };

// The object name the current page registered, tied to the path that registered it.
// VI: Tên đối tượng trang hiện tại đã đăng ký, gắn với path đã đăng ký nó.
let current: PageEntity | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
   listeners.add(listener);
   return () => listeners.delete(listener);
};

/**
 * Names the object the page shows (issue, project, document…) in the tab title. Call it with the
 * name once the page's own data has loaded; the name only applies while the same path is open,
 * so a late answer of a previous page never renames the next one.
 * VI: Đặt tên đối tượng trang đang hiển thị (issue, dự án, tài liệu…) vào title tab. Gọi với tên khi
 * VI: dữ liệu của chính trang đã tải; tên chỉ có hiệu lực khi đúng path đó còn mở, nên câu trả lời
 * VI: muộn của trang trước không bao giờ đổi tên trang sau.
 */
export function usePageEntity(name: string | undefined) {
   const pathname = usePathname();
   useEffect(() => {
      if (!name) return;
      const entity = { path: pathname, name };
      current = entity;
      notify();
      return () => {
         if (current === entity) {
            current = undefined;
            notify();
         }
      };
   }, [pathname, name]);
}

const PUBLIC_SEGMENTS = new Set(['auth', 'admin', 'invitations']);
const workspaceNames = new Map<string, Promise<string | undefined>>();

/**
 * Keeps the browser tab title in step with the page (`lib/page-title`). The workspace name is
 * loaded once per workspace key and team names come from the loaded teams, so only pages that
 * show one object need `usePageEntity`. The title is plain text set through document.title.
 * VI: Giữ title tab trình duyệt khớp với trang (`lib/page-title`). Tên workspace được tải một lần
 * VI: cho mỗi khoá workspace và tên team lấy từ danh sách team đã tải, nên chỉ trang hiển thị một
 * VI: đối tượng mới cần `usePageEntity`. Title là văn bản thuần, đặt qua document.title.
 */
export function DocumentTitle() {
   const pathname = usePathname() ?? '/';
   const entity = useSyncExternalStore(
      subscribe,
      () => current,
      () => undefined
   );
   const teams = useIssuesStore((state) => state.teams);
   const [workspace, setWorkspace] = useState<{ key: string; name?: string }>();
   const key = workspaceKey(pathname);
   const inWorkspace = Boolean(key && !PUBLIC_SEGMENTS.has(key));

   useEffect(() => {
      if (!key || !inWorkspace) return;
      let active = true;
      let pending = workspaceNames.get(key);
      if (!pending) {
         pending = loadCurrentWorkspace(key)
            .then((summary) => summary.name)
            .catch(() => {
               workspaceNames.delete(key);
               return undefined;
            });
         workspaceNames.set(key, pending);
      }
      void pending.then((name) => active && setWorkspace({ key, name }));
      return () => {
         active = false;
      };
   }, [key, inWorkspace]);

   const segments = pathname.split('/').filter(Boolean);
   const teamKey =
      segments[1] === 'team'
         ? segments[2]
         : segments[1] === 'settings' && segments[2] === 'teams'
           ? segments[3]
           : undefined;
   const team = teamKey
      ? teams.find((item) => item.identifier === teamKey || item.id === teamKey)?.name
      : undefined;
   const title = documentTitle(
      pageTitle(pathname, {
         workspace: workspace?.key === key ? workspace?.name : undefined,
         entity: entity?.path === pathname ? entity.name : team,
      })
   );

   useEffect(() => {
      document.title = title;
   }, [title]);
   return null;
}
