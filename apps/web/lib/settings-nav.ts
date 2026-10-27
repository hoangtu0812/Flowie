/** Shape shared by the settings sidebar groups; icons and other fields pass through. */
/** VI: Cấu trúc chung của các nhóm trong sidebar settings; icon và trường khác giữ nguyên. */
export interface SettingsNavEntry {
   label: string;
   items: { name: string; url: string }[];
}

/**
 * Finds the settings group and page for `pathname` so the header can name the page. An exact
 * match wins; otherwise the longest nav URL that prefixes the path (for example a page's
 * sub-route) is used. Returns undefined outside the listed pages, such as team settings.
 * VI: Tìm nhóm và trang settings ứng với `pathname` để header hiển thị tên trang. Khớp chính
 * VI: xác được ưu tiên; nếu không thì dùng URL nav dài nhất là tiền tố của path (ví dụ
 * VI: route con của một trang). Trả về undefined với trang không có trong nav như team.
 */
export function findSettingsPage<G extends SettingsNavEntry>(
   groups: readonly G[],
   orgId: string,
   pathname: string
): { group: G; item: G['items'][number] } | undefined {
   let best: { group: G; item: G['items'][number]; length: number } | undefined;
   for (const group of groups) {
      for (const item of group.items) {
         const href = `/${orgId}${item.url}`;
         const matches = pathname === href || pathname.startsWith(`${href}/`);
         if (matches && (!best || href.length > best.length))
            best = { group, item, length: href.length };
      }
   }
   return best && { group: best.group, item: best.item };
}
