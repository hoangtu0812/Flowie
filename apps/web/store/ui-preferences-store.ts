import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DefaultHome = 'agent' | 'inbox' | 'my-issues';
export type FontSize = 'default' | 'small' | 'large';

interface UiPreferencesState {
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
         defaultHome: 'agent',
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
         partialize: ({ hasHydrated: _hasHydrated, ...preferences }) => preferences,
         onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
      }
   )
);
