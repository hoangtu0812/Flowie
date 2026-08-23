'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider, ThemeProviderProps } from 'next-themes';
import { ThemeApplier } from '@/components/layout/theme-applier';
import { UiPreferencesApplier } from '@/components/layout/ui-preferences-applier';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
   return (
      <NextThemesProvider {...props} enableSystem enableColorScheme disableTransitionOnChange>
         <ThemeApplier />
         <UiPreferencesApplier />
         {children}
      </NextThemesProvider>
   );
}
