import type { Locale } from '@/features/shared/locale';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DefaultHome = 'inbox' | 'my-issues';
export type FontSize = 'default' | 'small' | 'large';

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
   setTimezone: (timezone: string | null) => void;
   setWeekStart: (weekStart: 0 | 1 | 6) => void;
   setAutoAssignSelf: (autoAssignSelf: boolean) => void;
   commentSubmitMode: 'modifier-enter' | 'enter';
   setLocale: (locale: Locale) => void;
   setCommentSubmitMode: (mode: 'modifier-enter' | 'enter') => void;
   defaultHome: DefaultHome;
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
         setTimezone: (timezone) => set({ timezone }),
         setWeekStart: (weekStart) => set({ weekStart }),
         setAutoAssignSelf: (autoAssignSelf) => set({ autoAssignSelf }),
         commentSubmitMode: 'modifier-enter',
         setLocale: (locale) => set({ locale }),
         setCommentSubmitMode: (commentSubmitMode) => set({ commentSubmitMode }),
         defaultHome: 'inbox',
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
