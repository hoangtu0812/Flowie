'use client';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { localeTag } from './locale';
import { useCallback } from 'react';
import { formatDate } from './date-format';
export function resolvedTimezone(configured: string | null) {
   return configured ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}
export function useAccountTime() {
   const timezone = useUiPreferencesStore((state) => state.timezone),
      weekStart = useUiPreferencesStore((state) => state.weekStart),
      locale = useUiPreferencesStore((state) => state.locale);
   return { timezone: resolvedTimezone(timezone), weekStart, locale: localeTag(locale) };
}
export function useDateFormatter() {
   const { timezone, locale } = useAccountTime();
   return useCallback(
      (value: string | null) => formatDate(value, locale, timezone),
      [timezone, locale]
   );
}
