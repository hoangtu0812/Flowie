/**
 * Query marker on an issue URL that records it was opened from a project page,
 * so the issue breadcrumb leads back to that project's issue list instead of
 * the team. It lives in the URL so a reload or copied link keeps the same
 * breadcrumb; links opened anywhere else carry no marker and keep the team.
 * VI: Dấu query trên URL issue cho biết issue được mở từ trang dự án, để
 * breadcrumb quay về danh sách issue của dự án đó thay vì team. Dấu nằm trên
 * URL nên tải lại trang hoặc link đã sao chép vẫn giữ breadcrumb này; link mở
 * từ nơi khác không có dấu và vẫn hiển thị team.
 */

/**
 * True for any project route (`/<org>/project/<id>/...`), the pages whose
 * issue links should return to the project.
 * VI: Đúng với mọi route dự án (`/<org>/project/<id>/...`), tức các trang mà
 * link issue cần quay về dự án.
 */
export function isProjectPath(pathname: string | null | undefined): boolean {
   return /^\/[^/]+\/project\/[^/]+(\/|$)/.test(pathname ?? '');
}

/**
 * Builds an issue page URL, adding the project marker when `fromProject`.
 * VI: Tạo URL trang issue, thêm dấu dự án khi `fromProject` đúng.
 */
export function issueHref(orgId: string, identifier: string, fromProject = false): string {
   return `/${orgId}/issue/${identifier}${fromProject ? '?from=project' : ''}`;
}

/**
 * Reads the marker from the issue page's search params.
 * VI: Đọc dấu dự án từ search params của trang issue.
 */
export function isOpenedFromProject(searchParams: { get(name: string): string | null } | null) {
   return searchParams?.get('from') === 'project';
}
