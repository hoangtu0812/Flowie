// Deployment sub-path such as '/flowie', or '' when Flowie owns the host root.
// Next's Link, router and redirect() add it automatically; browser APIs
// (window.location, Notification clicks, copied links, manifest URLs) do not.
// VI: Đường dẫn con khi triển khai, ví dụ '/flowie', hoặc '' khi Flowie chạy ở
// gốc domain. Link, router và redirect() của Next tự thêm; các API trình duyệt
// (window.location, click thông báo, link sao chép, URL manifest) thì không.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Turns an app path ('/x/inbox') into a browser path ('/flowie/x/inbox').
// VI: Chuyển đường dẫn trong app ('/x/inbox') thành đường dẫn trình duyệt ('/flowie/x/inbox').
export function withBasePath(path: string): string {
   return `${basePath}${path}`;
}

// window.location.pathname without the sub-path, so the first segment is the
// workspace slug just like usePathname().
// VI: window.location.pathname đã bỏ đường dẫn con, để đoạn đầu tiên là slug
// workspace giống usePathname().
export function appPathname(): string {
   const { pathname } = window.location;
   if (!basePath || !pathname.startsWith(basePath)) return pathname;
   return pathname.slice(basePath.length) || '/';
}
