import { responseData } from '@/lib/http';
import { authenticatedFetch, type WorkspaceMembership } from '@/lib/workspaces';
import { api } from './service-desk-api';

/**
 * A plain member in no team, who only needs Service Desk. Owners and admins stay in the app even
 * without a team, because they run the workspace. This shapes navigation only: the API limits data.
 * VI: Thành viên thường không thuộc team nào, chỉ cần Service Desk. Owner và admin vẫn ở trong app
 * VI: dù không có team vì họ quản lý workspace. Hàm này chỉ định hướng; API mới giới hạn dữ liệu.
 */
export async function isRequester({ role, workspace }: WorkspaceMembership) {
   if (role !== 'MEMBER') return false;
   const teams = await responseData<{ joined: boolean }[]>(
      await authenticatedFetch(`${api}/teams?workspaceId=${workspace.id}`),
      'Could not load teams.'
   );
   return !teams.some((team) => team.joined);
}
