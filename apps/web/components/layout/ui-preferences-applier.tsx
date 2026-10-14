'use client';

import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { useEffect } from 'react';

const FONT_SIZES = { small: '87.5%', default: '', large: '112.5%' } as const;

/** Applies persisted, browser-local preference settings to the current app. */
export function UiPreferencesApplier() {
   const { fontSize, pointerCursors, underlineLinks, locale } = useUiPreferencesStore();

   useEffect(() => {
      const root = document.documentElement;
      root.lang = locale;
      root.style.fontSize = FONT_SIZES[fontSize];
      root.dataset.pointerCursors = String(pointerCursors);
      root.dataset.underlineLinks = String(underlineLinks);
   }, [fontSize, pointerCursors, underlineLinks, locale]);

   return null;
}
