'use client';

import {
   authenticatedFetch,
   loadCurrentWorkspace,
   loadCurrentWorkspaceMembership,
} from '@/lib/workspaces';
import { RESCHEDULE_CONFLICT, useIssuesStore } from '@/store/issues-store';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Saves the dates a timeline bar was dragged to for an issue the issues store does not hold
 * (sub-issue rows, project timeline rows). It sends the version the screen read, so a newer change
 * by someone else is refused (409) instead of overwritten; the caller then reloads its data. `end`
 * null leaves the target end date as it is. Resolves `saved`, `conflict` or `failed`; failures are
 * shown as a toast here.
 * VI: Lưu các ngày mà thanh timeline được kéo tới, cho issue không nằm trong issues store (hàng
 * VI: sub-issue, hàng timeline project). Gửi version màn hình đã đọc để thay đổi mới hơn của người
 * VI: khác bị từ chối (409) thay vì bị ghi đè; nơi gọi khi đó tải lại dữ liệu. `end` null giữ
 * VI: nguyên ngày kết thúc dự kiến. Trả `saved`, `conflict` hoặc `failed`; lỗi hiện toast tại đây.
 */
export async function rescheduleIssue(
   issue: { id: string; version?: number },
   start: string,
   end: string | null
): Promise<'saved' | 'conflict' | 'failed'> {
   try {
      const workspaceId =
         useIssuesStore.getState().workspaceId ?? (await loadCurrentWorkspace()).id;
      const response = await authenticatedFetch(
         `${api}/issues/${issue.id}?${new URLSearchParams({ workspaceId })}`,
         {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               startDate: start,
               ...(end ? { targetDate: end } : {}),
               expectedVersion: issue.version,
            }),
         }
      );
      if (response.ok) return 'saved';
      if (response.status === 409) {
         toast.error(RESCHEDULE_CONFLICT);
         return 'conflict';
      }
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Could not reschedule the issue.');
   } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reschedule the issue.');
   }
   return 'failed';
}

/**
 * Whether the signed-in member may drag timeline bars. Read-only administrators (ADMIN_VIEWER)
 * cannot; the API refuses their writes anyway, this only keeps the bars from looking editable.
 * Starts false so nothing is draggable before the role is known.
 * VI: Thành viên đang đăng nhập có được kéo thanh timeline không. Quản trị chỉ đọc (ADMIN_VIEWER)
 * VI: thì không; API vẫn từ chối thao tác ghi của họ, hook này chỉ để thanh không trông như sửa
 * VI: được. Mặc định false để không thanh nào kéo được trước khi biết role.
 */
export function useCanEditIssues(): boolean {
   const [canEdit, setCanEdit] = useState(false);
   useEffect(() => {
      let active = true;
      void loadCurrentWorkspaceMembership()
         .then((membership) => active && setCanEdit(membership.role !== 'ADMIN_VIEWER'))
         .catch(() => active && setCanEdit(false));
      return () => {
         active = false;
      };
   }, []);
   return canEdit;
}
