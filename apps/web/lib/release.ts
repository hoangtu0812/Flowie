/**
 * Release identity of this bundle, baked in from CHANGELOG.md by next.config.
 * Every value can be empty when the app is built outside the repository, so
 * callers must render nothing rather than a misleading placeholder version.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '';

/** Printed verbatim, exactly as the changelog heading states it. */
export const APP_RELEASED_AT = process.env.NEXT_PUBLIC_APP_RELEASED_AT ?? '';

export const CHANGELOG_URL = 'https://github.com/hoangtu0812/Flowie/blob/main/CHANGELOG.md';

function parseHighlights(): string[] {
   try {
      const parsed: unknown = JSON.parse(process.env.NEXT_PUBLIC_APP_HIGHLIGHTS ?? '[]');
      return Array.isArray(parsed)
         ? parsed.filter((item): item is string => typeof item === 'string')
         : [];
   } catch {
      return [];
   }
}

/** First entries of the current release, used by the Help menu's "What's new". */
export const APP_HIGHLIGHTS = parseHighlights();

/** "v0.2.0 · 2026-08-26 19:41 +07", or just the half that is known. */
export function releaseLabel(): string {
   const version = APP_VERSION ? `v${APP_VERSION}` : '';
   return [version, APP_RELEASED_AT].filter(Boolean).join(' · ');
}
