'use client';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { localeTag } from './locale';
export function resolvedTimezone(configured: string | null) {
   return configured ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}
export function useAccountTime() {
   const timezone = useUiPreferencesStore((state) => state.timezone),
      weekStart = useUiPreferencesStore((state) => state.weekStart),
      locale = useUiPreferencesStore((state) => state.locale);
   return { timezone: resolvedTimezone(timezone), weekStart, locale: localeTag(locale) };
}
