import { responseData } from '@/lib/http';
import { authenticatedFetch } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type Worklog = {
   id: string;
   issueId: string;
   user: { id: string; name: string | null; avatarUrl: string | null };
   /** Calendar day `YYYY-MM-DD`, not an instant. VI: Ngày lịch `YYYY-MM-DD`, không phải thời điểm. */
   workDate: string;
   hours: number;
   note: string | null;
   canEdit: boolean;
};

/**
 * An issue's worklogs with their total hours and the actual effort (man-days) the server derived
 * from them; every write returns this whole shape so the caller just replaces its copy.
 * VI: Worklog của một issue kèm tổng giờ và actual effort (man-day) server tính từ chúng; mọi thao
 * VI: tác ghi trả về nguyên dạng này để nơi gọi chỉ cần thay bản sao của mình.
 */
export type IssueWorklogs = {
   items: Worklog[];
   totalHours: number;
   actualEffort: number | null;
};

export type WorklogDraft = { workDate: string; hours: number; note?: string };

export type Timesheet = {
   weekStart: string;
   days: string[];
   people: {
      user: { id: string; name: string | null; avatarUrl: string | null };
      hours: number[];
      total: number;
   }[];
   totals: number[];
   total: number;
};

export type TimesheetFilter = { weekStart: string; teamId?: string; projectId?: string };

const issueUrl = (issueId: string, worklogId?: string) =>
   `${api}/issues/${encodeURIComponent(issueId)}/worklogs${worklogId ? `/${encodeURIComponent(worklogId)}` : ''}`;

export async function loadWorklogs(workspaceId: string, issueId: string) {
   const search = new URLSearchParams({ workspaceId });
   return responseData<IssueWorklogs>(await authenticatedFetch(`${issueUrl(issueId)}?${search}`));
}

export async function saveWorklog(
   workspaceId: string,
   issueId: string,
   draft: WorklogDraft,
   worklogId?: string
) {
   const response = await authenticatedFetch(issueUrl(issueId, worklogId), {
      method: worklogId ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, ...draft }),
   });
   return responseData<IssueWorklogs>(response, 'Could not save the worklog.');
}

export async function deleteWorklog(workspaceId: string, issueId: string, worklogId: string) {
   const search = new URLSearchParams({ workspaceId });
   const response = await authenticatedFetch(`${issueUrl(issueId, worklogId)}?${search}`, {
      method: 'DELETE',
   });
   return responseData<IssueWorklogs>(response, 'Could not delete the worklog.');
}

function timesheetSearch(workspaceId: string, filter: TimesheetFilter) {
   return new URLSearchParams({
      workspaceId,
      weekStart: filter.weekStart,
      ...(filter.teamId ? { teamId: filter.teamId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
   });
}

export async function loadTimesheet(workspaceId: string, filter: TimesheetFilter) {
   return responseData<Timesheet>(
      await authenticatedFetch(`${api}/timesheet?${timesheetSearch(workspaceId, filter)}`)
   );
}

/**
 * Downloads the week's worklogs as CSV or XLSX; a failed export throws the API message.
 * VI: Tải worklog của tuần dạng CSV hoặc XLSX; xuất lỗi thì ném thông điệp từ API.
 */
export async function exportTimesheet(
   workspaceId: string,
   filter: TimesheetFilter,
   format: 'csv' | 'xlsx'
) {
   const search = timesheetSearch(workspaceId, filter);
   search.set('format', format);
   const response = await authenticatedFetch(`${api}/timesheet/export?${search}`);
   if (!response.ok) await responseData(response, 'Could not export the timesheet.');
   return response.blob();
}
