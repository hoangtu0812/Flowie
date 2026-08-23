'use client';

import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { useEffect } from 'react';

const FONT_SIZES = { small: '14px', default: '', large: '18px' } as const;

/** Applies persisted, browser-local preference settings to the current app. */
export function UiPreferencesApplier() {
   const { fontSize, pointerCursors, underlineLinks } = useUiPreferencesStore();

   useEffect(() => {
      const root = document.documentElement;
      root.style.fontSize = FONT_SIZES[fontSize];
      root.dataset.pointerCursors = String(pointerCursors);
      root.dataset.underlineLinks = String(underlineLinks);
   }, [fontSize, pointerCursors, underlineLinks]);

   return null;
}
