import type { Locale } from './locale';
export type MessageParameters = Record<string, string | number>;
export function messageText(
   locale: Locale,
   catalog: Readonly<Record<string, string>>,
   key: string,
   parameters: MessageParameters = {}
) {
   const template = locale === 'vi' ? (catalog[key] ?? key) : key;
   return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name) =>
      Object.hasOwn(parameters, name) ? String(parameters[name]) : match
   );
}
