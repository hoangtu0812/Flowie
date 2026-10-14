'use client';

import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { useTheme } from 'next-themes';
import type { ReactNode } from 'react';

/** Keeps updated features on the same tokens without overriding legacy user themes. */
export function DesignSurface({ children }: { children: ReactNode }) {
   const { resolvedTheme } = useTheme();
   return (
      <Theme theme={neutralTheme} mode={resolvedTheme === 'light' ? 'light' : 'dark'}>
         {children}
      </Theme>
   );
}
