import type { Locale } from '@/features/shared/locale';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DefaultHome = 'inbox' | 'my-issues';
export type FontSize = 'default' | 'small' | 'large';

interface UiPreferencesState {
   locale: Locale;
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

/** Browser-local UI preferences that have immediate, visible app behavior. */
export const useUiPreferencesStore = create<UiPreferencesState>()(
   persist(
      (set) => ({
         locale: 'en',
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
         version: 2,
         migrate: (persisted) => {
            const preferences = persisted as Partial<UiPreferencesState> | undefined;
            return {
               ...preferences,
               locale: preferences?.locale === 'vi' ? 'vi' : 'en',
               commentSubmitMode:
                  preferences?.commentSubmitMode === 'enter' ? 'enter' : 'modifier-enter',
               defaultHome:
                  preferences?.defaultHome === 'my-issues' ? 'my-issues' : ('inbox' as const),
            } as UiPreferencesState;
         },
         partialize: (state) => {
            const { hasHydrated, ...preferences } = state;
            void hasHydrated;
            return preferences;
         },
         onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
      }
   )
);
