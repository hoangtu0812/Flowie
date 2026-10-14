'use client';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { translate, localeTag, type MessageKey } from './locale';
export function useLocale() {
   const locale = useUiPreferencesStore((state) => state.locale);
   return { locale, tag: localeTag(locale), t: (key: MessageKey) => translate(locale, key) };
}
