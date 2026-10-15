'use client';
import { useCallback } from 'react';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { messageText, type MessageParameters } from './messages';
export function useMessages<T extends Readonly<Record<string, string>>>(catalog: T) {
   const locale = useUiPreferencesStore((state) => state.locale);
   return useCallback(
      (key: keyof T & string, parameters?: MessageParameters) =>
         messageText(locale, catalog, key, parameters),
      [locale, catalog]
   );
}
