'use client';

import { useIssuesStore } from '@/store/issues-store';

/**
 * Whether the signed-in person is a VIEWER of the team: they read its issues but every edit is
 * refused by the API (403), so the UI hides or disables the controls instead of failing on save.
 * Unknown team or account (still loading) counts as not view-only, so nothing flickers locked.
 * VI: Người đang đăng nhập có phải VIEWER của team hay không: họ đọc được issue nhưng mọi thao tác
 * VI: sửa bị API từ chối (403), nên UI ẩn hoặc khoá control thay vì lỗi lúc lưu. Team hoặc tài
 * VI: khoản chưa biết (đang tải) được coi là không chỉ xem, để giao diện không nháy trạng thái khoá.
 */
export function useTeamViewOnly(teamId?: string | null): boolean {
   return useIssuesStore((state) => {
      if (!teamId || !state.accountId) return false;
      const team = state.teams.find((candidate) => candidate.id === teamId);
      return team?.members.find((member) => member.id === state.accountId)?.role === 'VIEWER';
   });
}
