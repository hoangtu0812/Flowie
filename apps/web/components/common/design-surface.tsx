'use client';

import { Theme } from '@astryxdesign/core/theme';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { astryxMessages } from '@/features/shared/astryx-messages.vi';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { useTheme } from 'next-themes';
import { useEffect, useState, type ReactNode } from 'react';

/** Keeps updated features on the same tokens without overriding legacy user themes. */
export function DesignSurface({ children }: { children: ReactNode }) {
   const { resolvedTheme } = useTheme();
   // Keep the first client render identical to SSR before applying the browser's saved theme.
   const [mounted, setMounted] = useState(false);
   useEffect(() => setMounted(true), []);
   const locale = useUiPreferencesStore((state) => state.locale);
   return (
      <InternationalizationProvider locale={locale} messages={astryxMessages}>
         <Theme theme={neutralTheme} mode={mounted && resolvedTheme === 'light' ? 'light' : 'dark'}>
            {children}
         </Theme>
      </InternationalizationProvider>
   );
}
