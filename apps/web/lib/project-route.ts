/**
 * Link to a project page by its readable slug, falling back to the id for records loaded before
 * slugs existed. Both forms open the page: the project route resolves either.
 * VI: Link tới trang dự án bằng slug dễ đọc, dùng id khi bản ghi được tải trước khi có slug. Cả
 * VI: hai dạng đều mở được trang vì route dự án phân giải được cả hai.
 */
export function projectPath(
   orgId: string,
   project: { id: string; slug?: string | null },
   segment = 'overview'
): string {
   return `/${orgId}/project/${encodeURIComponent(project.slug || project.id)}/${segment}`;
}

/**
 * Rewrites a project URL opened by id or by an earlier slug to the current slug, keeping the
 * workspace segment, the rest of the path and the query/hash `suffix`. Returns undefined when the
 * URL already uses the current slug or is not a project URL, so callers only redirect when needed.
 * The path is the router path, without the deployment base path (for example `/flowie`).
 * VI: Đổi URL dự án mở bằng id hoặc slug cũ sang slug hiện tại, giữ đoạn workspace, phần còn lại
 * VI: của path và `suffix` (query/hash). Trả undefined khi URL đã dùng slug hiện tại hoặc không phải
 * VI: URL dự án, để nơi gọi chỉ chuyển hướng khi cần. Path là path của router, không gồm base path
 * VI: của bản triển khai (ví dụ `/flowie`).
 */
export function canonicalProjectPath(
   pathname: string,
   slug: string,
   suffix = ''
): string | undefined {
   const match = /^(\/[^/]+\/project\/)([^/]+)(.*)$/.exec(pathname);
   if (!match) return undefined;
   const [, prefix, key, rest] = match;
   let decoded: string;
   try {
      decoded = decodeURIComponent(key);
   } catch {
      return undefined;
   }
   if (decoded === slug) return undefined;
   return `${prefix}${encodeURIComponent(slug)}${rest}${suffix}`;
}
