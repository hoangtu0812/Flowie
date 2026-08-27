import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

/**
 * Release identity is read from CHANGELOG.md at build time so the running app
 * can name its own version. The changelog is the single source: a release that
 * is not written down there cannot be shown, which is the point — it makes a
 * forgotten changelog entry visible inside the product instead of silent.
 */
type Release = { version: string; releasedAt: string; highlights: string[] };

const RELEASE_HEADING = /^## \[(\d+\.\d+\.\d+)\]\s*[—-]\s*(.+?)\s*$/;

/** One menu line: no markdown ticks, cut on a word boundary. */
function shorten(bullet: string, limit = 72): string {
   const text = bullet
      .replace(/`/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[;,.]$/, '')
      .trim();
   if (text.length <= limit) return text;
   const cut = text.slice(0, limit);
   const boundary = cut.lastIndexOf(' ');
   return `${(boundary > 40 ? cut.slice(0, boundary) : cut).replace(/[;,.]$/, '')}…`;
}

function readRelease(): Release {
   const empty: Release = { version: '', releasedAt: '', highlights: [] };
   let lines: string[];
   try {
      lines = readFileSync(join(process.cwd(), '..', '..', 'CHANGELOG.md'), 'utf8').split(/\r?\n/);
   } catch {
      return empty;
   }

   const start = lines.findIndex((line) => RELEASE_HEADING.test(line));
   if (start === -1) return empty;
   const [, version, releasedAt] = RELEASE_HEADING.exec(lines[start]) as RegExpExecArray;

   // Bullets wrap over several lines, so a bullet is its first line plus every
   // indented line that follows it.
   const bullets: string[] = [];
   for (const line of lines.slice(start + 1)) {
      if (line.startsWith('## ')) break;
      if (line.startsWith('- ')) bullets.push(line.slice(2).trim());
      else if (bullets.length > 0 && /^\s+\S/.test(line))
         bullets[bullets.length - 1] += ` ${line.trim()}`;
   }

   const highlights = bullets.slice(0, 4).map((bullet) => shorten(bullet));
   return { version, releasedAt, highlights };
}

const release = readRelease();

const nextConfig: NextConfig = {
   /* config options here */
   devIndicators: false,
   transpilePackages: ['thinking-orbs'],
   env: {
      NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ?? release.version,
      NEXT_PUBLIC_APP_RELEASED_AT: process.env.NEXT_PUBLIC_APP_RELEASED_AT ?? release.releasedAt,
      NEXT_PUBLIC_APP_HIGHLIGHTS: JSON.stringify(release.highlights),
   },
};

export default nextConfig;
