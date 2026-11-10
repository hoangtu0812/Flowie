import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/**
 * localStorage that never throws: blocked storage (privacy settings, sandboxed frames), private
 * mode or a full quota read as "nothing saved" and drop the write, so the sidebar keeps its
 * defaults and the toggle still works for the current page session.
 * VI: localStorage không bao giờ ném lỗi: storage bị chặn (cài đặt riêng tư, frame sandbox), chế
 * VI: độ ẩn danh hoặc hết quota được coi là "chưa lưu gì" và bỏ qua việc ghi, nên sidebar giữ mặc
 * VI: định và nút thu gọn vẫn hoạt động trong phiên trang hiện tại.
 */
function attempt<T>(run: () => T, fallback: T): T {
   try {
      return run();
   } catch {
      return fallback;
   }
}

const safeLocalStorage: StateStorage = {
   getItem: (name) => attempt(() => localStorage.getItem(name), null),
   setItem: (name, value) => attempt(() => localStorage.setItem(name, value), undefined),
   removeItem: (name) => attempt(() => localStorage.removeItem(name), undefined),
};

interface SidebarCollapseState {
   /**
    * Collapsed sections by key (`workspace`, `workspace-projects`, `team:<id>:cycles`,
    * `team:<id>:projects`); a missing key means open, the default for every section.
    * VI: Các khối đang thu gọn theo khoá; khoá không có nghĩa là đang mở, mặc định của mọi khối.
    */
   collapsed: Record<string, boolean>;
   setCollapsed: (key: string, collapsed: boolean) => void;
}

/**
 * Per-browser collapse state of sidebar sections, kept in localStorage (`sidebar-collapse`) and
 * never synced between browsers or devices.
 * VI: Trạng thái thu gọn các khối sidebar theo trình duyệt, lưu trong localStorage
 * VI: (`sidebar-collapse`), không đồng bộ giữa trình duyệt hay thiết bị.
 */
export const useSidebarCollapseStore = create<SidebarCollapseState>()(
   persist(
      (set) => ({
         collapsed: {},
         setCollapsed: (key, value) =>
            set((state) => {
               const collapsed = { ...state.collapsed };
               if (value) collapsed[key] = true;
               else delete collapsed[key];
               return { collapsed };
            }),
      }),
      { name: 'sidebar-collapse', storage: createJSONStorage(() => safeLocalStorage) }
   )
);

/**
 * Open state of one sidebar section. The first render is always open so it matches the server
 * HTML, which cannot read localStorage; the saved state applies after mount. When the user
 * navigates to a page inside the section (`active`), the section opens and that is saved. The
 * page the browser loaded does not reopen it: almost every page belongs to the Workspace section,
 * so a collapsed section would otherwise never survive a reload.
 * VI: Trạng thái mở của một khối sidebar. Lần render đầu luôn mở để khớp HTML từ server (server
 * VI: không đọc được localStorage); trạng thái đã lưu áp dụng sau khi mount. Khi người dùng điều
 * VI: hướng tới trang nằm trong khối (`active`), khối mở ra và trạng thái đó được lưu. Trang trình
 * VI: duyệt vừa tải không mở lại khối: hầu hết trang đều thuộc khối Workspace, nên nếu không thì
 * VI: khối đã thu gọn sẽ không bao giờ giữ được sau khi tải lại.
 */
export function useSidebarSection(
   key: string,
   active = false
): [open: boolean, setOpen: (open: boolean) => void] {
   const collapsed = useSidebarCollapseStore((state) => Boolean(state.collapsed[key]));
   const setCollapsed = useSidebarCollapseStore((state) => state.setCollapsed);
   const pathname = usePathname();
   const loadedPath = useRef<string | null>(pathname);
   const [mounted, setMounted] = useState(false);
   useEffect(() => setMounted(true), []);
   useEffect(() => {
      if (pathname !== loadedPath.current) loadedPath.current = null;
      if (active && loadedPath.current === null) setCollapsed(key, false);
   }, [active, pathname, key, setCollapsed]);
   return [!mounted || !collapsed, (open) => setCollapsed(key, !open)];
}
