type Membership = { workspace: { id: string; slug: string } };

/**
 * The decoded first path segment (the workspace key: id, slug or earlier slug), or undefined
 * when there is none or it is not valid URL encoding.
 * VI: Đoạn path đầu tiên đã giải mã (khoá workspace: id, slug hoặc slug cũ), hoặc undefined khi
 * VI: không có hoặc mã hoá URL không hợp lệ.
 */
export function workspaceKey(pathname: string): string | undefined {
   const segment = pathname.split('/')[1];
   if (!segment) return undefined;
   try {
      return decodeURIComponent(segment);
   } catch {
      return undefined;
   }
}

/**
 * Replaces the workspace segment with `slug`, keeping the rest of the path and the query/hash
 * `suffix`. VI: Thay đoạn workspace bằng `slug`, giữ phần còn lại của path và `suffix` (query/hash).
 */
export function withWorkspaceSegment(pathname: string, slug: string, suffix = ''): string {
   const segment = pathname.split('/')[1] ?? '';
   return `/${encodeURIComponent(slug)}${pathname.slice(segment.length + 1)}${suffix}`;
}

/**
 * Workspace URLs read with the slug: a link that opens a workspace by its id moves to the current
 * slug with the complete destination kept. An id wins over a slug that happens to match it. A URL
 * already using a slug, or a key that matches no membership (an earlier slug, resolved by the API,
 * or an unavailable workspace), returns undefined.
 * VI: URL workspace hiển thị bằng slug: link mở workspace bằng id được chuyển sang slug hiện tại,
 * VI: giữ nguyên đích đầy đủ. Id được ưu tiên hơn slug trùng với nó. URL đã dùng slug, hoặc khoá
 * VI: không khớp membership nào (slug cũ do API phân giải, hoặc workspace không truy cập được), trả
 * VI: undefined.
 */
export function canonicalWorkspacePath(
   pathname: string,
   memberships: Membership[],
   suffix = ''
): string | undefined {
   const key = workspaceKey(pathname);
   if (!key) return undefined;
   const workspace = memberships.find(({ workspace }) => workspace.id === key)?.workspace;
   if (!workspace || workspace.slug === key) return undefined;
   return withWorkspaceSegment(pathname, workspace.slug, suffix);
}
