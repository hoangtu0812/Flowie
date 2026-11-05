'use client';

import { usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { withBasePath } from '@/lib/base-path';

/**
 * The ticket being read, kept in the URL at `{root}/{ticketId}` so a reload, a shared link and the
 * Back button all work. `pushState` avoids `router.push`, which would rebuild the page for a new
 * route parameter and lose its loaded data; it syncs `usePathname` but not `useParams`, so the
 * ticket is read from the path. `root` excludes the base path, which `usePathname` removes too.
 * The query stays because `?workspace=` picks the workspace on the requester's page.
 * VI: Ticket đang đọc, giữ trên URL tại `{root}/{ticketId}` để tải lại trang, gửi link và nút Back
 * VI: đều hoạt động. `pushState` thay cho `router.push`, vốn dựng lại trang khi tham số route đổi
 * VI: và làm mất dữ liệu đã tải; nó đồng bộ `usePathname` nhưng không đồng bộ `useParams`, nên
 * VI: ticket được đọc từ đường dẫn. `root` không gồm base path, `usePathname` cũng bỏ phần này.
 * VI: Query được giữ vì `?workspace=` chọn workspace trên trang người yêu cầu.
 */
export function useSelectedTicket(root: string) {
   const pathname = usePathname();
   const selected = pathname.startsWith(`${root}/`)
      ? pathname.slice(root.length + 1).split('/')[0]
      : undefined;
   const select = useCallback(
      (ticketId?: string) => {
         const path = ticketId ? `${root}/${ticketId}` : root;
         window.history.pushState(null, '', `${withBasePath(path)}${window.location.search}`);
      },
      [root]
   );
   return [selected, select] as const;
}
