import type { Locale } from '@/features/shared/locale';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DefaultHome = 'inbox' | 'my-issues';
export type FontSize = 'default' | 'small' | 'large';

/**
 * Issue list columns as the account stored them: visibility per display
 * property, column order and pixel widths keyed by column. Keys are strings
 * because a document written by another release may name columns this bundle
 * does not know; `resolveIssueColumns` drops those and fills in defaults.
 * VI: Cột danh sách issue như tài khoản đã lưu: ẩn/hiện theo thuộc tính hiển
 * thị, thứ tự cột và độ rộng px theo cột. Khoá là chuỗi vì document do bản
 * phát hành khác ghi có thể chứa cột bundle này không biết; `resolveIssueColumns`
 * bỏ các khoá đó và bổ sung giá trị mặc định.
 */
export interface StoredIssueColumns {
   visible: Record<string, boolean>;
   order: string[];
   widths: Record<string, number>;
}

interface UiPreferencesState {
   accountId?: string;
   syncStatus: 'loading' | 'saved' | 'saving' | 'pending' | 'error';
   syncError?: string;
   syncReload: number;
   reloadAccountPreferences: () => void;
   locale: Locale;
   timezone: string | null;
   weekStart: 0 | 1 | 6;
   autoAssignSelf: boolean;
   /** Null until the account configures its issue columns. VI: Null cho tới khi tài khoản cấu hình cột issue. */
   issueColumns: StoredIssueColumns | null;
   setIssueColumns: (issueColumns: StoredIssueColumns) => void;
   setTimezone: (timezone: string | null) => void;
   setWeekStart: (weekStart: 0 | 1 | 6) => void;
   setAutoAssignSelf: (autoAssignSelf: boolean) => void;
   commentSubmitMode: 'modifier-enter' | 'enter';
   setLocale: (locale: Locale) => void;
   setCommentSubmitMode: (mode: 'modifier-enter' | 'enter') => void;
   /**
    * Release this account has already been told about, as the version string
    * the bundle carries from CHANGELOG.md. Null means no release has ever been
    * announced to it. PreferenceSync keeps it on the server, so dismissing the
    * announcement silences it on every browser the person signs in from; the
    * browser copy only spares the next page load a flash before the sync lands.
    * VI: Bản phát hành mà tài khoản này đã được thông báo, theo chuỗi phiên bản
    * bundle mang từ CHANGELOG.md. Null nghĩa là chưa từng thông báo bản nào.
    * PreferenceSync giữ giá trị này ở server, nên đóng thông báo là tắt nó trên
    * mọi trình duyệt người dùng đăng nhập; bản lưu ở trình duyệt chỉ giúp lần
    * tải trang sau không nhá lên trước khi sync xong.
    */
   lastSeenReleaseVersion: string | null;
   setLastSeenReleaseVersion: (version: string) => void;
   defaultHome: DefaultHome;
   defaultWorkspaceId: string | null;
   fontSize: FontSize;
   pointerCursors: boolean;
   underlineLinks: boolean;
   hasHydrated: boolean;
   setHasHydrated: (hasHydrated: boolean) => void;
   setDefaultHome: (defaultHome: DefaultHome) => void;
   setFontSize: (fontSize: FontSize) => void;
   setPointerCursors: (pointerCursors: boolean) => void;
   setUnderlineLinks: (underlineLinks: boolean) => void;
}

/** Browser cache provides immediate preferences; PreferenceSync reconciles owned account values. */
export const useUiPreferencesStore = create<UiPreferencesState>()(
   persist(
      (set) => ({
         syncStatus: 'loading',
         syncReload: 0,
         reloadAccountPreferences: () => set((state) => ({ syncReload: state.syncReload + 1 })),
         locale: 'en',
         timezone: null,
         weekStart: 1,
         autoAssignSelf: false,
         issueColumns: null,
         setIssueColumns: (issueColumns) => set({ issueColumns }),
         setTimezone: (timezone) => set({ timezone }),
         setWeekStart: (weekStart) => set({ weekStart }),
         setAutoAssignSelf: (autoAssignSelf) => set({ autoAssignSelf }),
         commentSubmitMode: 'modifier-enter',
         setLocale: (locale) => set({ locale }),
         setCommentSubmitMode: (commentSubmitMode) => set({ commentSubmitMode }),
         lastSeenReleaseVersion: null,
         setLastSeenReleaseVersion: (lastSeenReleaseVersion) => set({ lastSeenReleaseVersion }),
         defaultHome: 'inbox',
         defaultWorkspaceId: null,
         fontSize: 'default',
         pointerCursors: true,
         underlineLinks: false,
         hasHydrated: false,
         setHasHydrated: (hasHydrated) => set({ hasHydrated }),
         setDefaultHome: (defaultHome) => set({ defaultHome }),
         setFontSize: (fontSize) => set({ fontSize }),
         setPointerCursors: (pointerCursors) => set({ pointerCursors }),
         setUnderlineLinks: (underlineLinks) => set({ underlineLinks }),
      }),
      {
         name: 'ui-preferences',
         version: 3,
         migrate: (persisted) => {
            const preferences = persisted as Partial<UiPreferencesState> | undefined;
            return {
               ...preferences,
               locale: preferences?.locale === 'vi' ? 'vi' : 'en',
               timezone: preferences?.timezone ?? null,
               weekStart: [0, 1, 6].includes(preferences?.weekStart ?? -1)
                  ? preferences!.weekStart
                  : 1,
               autoAssignSelf: preferences?.autoAssignSelf === true,
               commentSubmitMode:
                  preferences?.commentSubmitMode === 'enter' ? 'enter' : 'modifier-enter',
               defaultHome:
                  preferences?.defaultHome === 'my-issues' ? 'my-issues' : ('inbox' as const),
            } as UiPreferencesState;
         },
         partialize: (state) => {
            const { hasHydrated, syncStatus, syncError, syncReload, ...preferences } = state;
            void hasHydrated;
            void syncStatus;
            void syncError;
            void syncReload;
            return preferences;
         },
         onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
      }
   )
);
