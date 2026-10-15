import { authenticatedFetch } from '@/lib/workspaces';
import { responseEnvelope } from '@/lib/http';

export async function portfolioFetch(url: string): Promise<Response> {
   const target = new URL(url, window.location.origin);
   target.searchParams.set('limit', '100');
   const data: unknown[] = [];
   let cursor: string | null = null;
   const seen = new Set<string>();
   do {
      if (cursor) target.searchParams.set('cursor', cursor);
      const page = await responseEnvelope<unknown[], { nextCursor: string | null }>(
         await authenticatedFetch(target.toString())
      );
      data.push(...page.data);
      cursor = page.meta?.nextCursor ?? null;
      if (cursor && seen.has(cursor))
         throw new Error('Portfolio pagination did not advance. Retry loading.');
      if (cursor) seen.add(cursor);
   } while (cursor);
   return Response.json({ data });
}
