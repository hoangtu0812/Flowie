'use client';

import { Theme } from '@astryxdesign/core/theme';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { astryxMessages } from '@/features/shared/astryx-messages.vi';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { useTheme } from 'next-themes';
import type { ReactNode } from 'react';

/** Keeps updated features on the same tokens without overriding legacy user themes. */
export function DesignSurface({ children }: { children: ReactNode }) {
   const { resolvedTheme } = useTheme();
   const locale = useUiPreferencesStore((state) => state.locale);
   return (
      <InternationalizationProvider locale={locale} messages={astryxMessages}>
         <Theme theme={neutralTheme} mode={resolvedTheme === 'light' ? 'light' : 'dark'}>
            {children}
         </Theme>
      </InternationalizationProvider>
   );
}
