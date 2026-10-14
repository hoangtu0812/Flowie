'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseEnvelope } from '@/lib/http';
import { useParams } from 'next/navigation';
type SearchItem = { kind: string; id: string; title: string; subtitle: string; path: string };

export function WorkspaceSearch({ initialQuery = '' }: { initialQuery?: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [query, setQuery] = useState(initialQuery),
      [kind, setKind] = useState('');
   const [items, setItems] = useState<SearchItem[]>([]),
      [cursor, setCursor] = useState<string | null>();
   const [error, setError] = useState<string>(),
      [loading, setLoading] = useState(false),
      [retry, setRetry] = useState(0);
   const epoch = useRef(0),
      busy = useRef(false);
   const load = async (next?: string) => {
      const current = ++epoch.current;
      busy.current = true;
      setLoading(true);
      setError(undefined);
      try {
         const workspace = await loadCurrentWorkspace();
         const params = new URLSearchParams({
            workspaceId: workspace.id,
            query: query.trim(),
            limit: '25',
         });
         if (kind) params.set('kind', kind);
         if (next) params.set('cursor', next);
         const page = await responseEnvelope<SearchItem[], { nextCursor: string | null }>(
            await authenticatedFetch(
               `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/search?${params}`
            )
         );
         if (current !== epoch.current) return;
         setItems((previous) =>
            next
               ? [
                    ...new Map(
                       [...previous, ...page.data].map((item) => [`${item.kind}:${item.id}`, item])
                    ).values(),
                 ]
               : page.data
         );
         setCursor(page.meta?.nextCursor);
      } catch (reason) {
         if (current === epoch.current)
            setError(reason instanceof Error ? reason.message : 'Could not search workspace.');
      } finally {
         if (current === epoch.current) {
            busy.current = false;
            setLoading(false);
         }
      }
   };
   useEffect(() => {
      epoch.current++;
      setItems([]);
      setCursor(undefined);
      setError(undefined);
      if (!query.trim()) {
         setLoading(false);
         return;
      }
      const timer = window.setTimeout(() => void load(), 300);
      return () => {
         window.clearTimeout(timer);
         epoch.current++;
      };
      // Search responses are bound to the query, filter and workspace route.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [query, kind, orgId, retry]);
   return (
      <DesignSurface>
         <VStack gap={4} padding={6} isScrollable height="100%">
            <Heading level={1}>Search workspace</Heading>
            <TextInput
               label="Search issues, documents, projects and members"
               value={query}
               onChange={setQuery}
            />
            <HStack gap={2} wrap="wrap">
               {['', 'issue', 'document', 'project', 'member'].map((value) => (
                  <Button
                     key={value}
                     label={value || 'All'}
                     aria-pressed={kind === value}
                     onClick={() => setKind(value)}
                  />
               ))}
            </HStack>
            {loading && <Text role="status">Searching…</Text>}
            {error && (
               <>
                  <Text role="alert">{error}</Text>
                  <Button label="Retry" onClick={() => setRetry((value) => value + 1)} />
               </>
            )}
            {!loading && !error && query.trim() && items.length === 0 && (
               <Text>No accessible results.</Text>
            )}
            {items.map((item) => (
               <VStack key={`${item.kind}:${item.id}`} gap={1}>
                  <Link href={`/${orgId}${item.path}`}>{item.title}</Link>
                  <Text type="supporting">
                     {item.kind} · {item.subtitle}
                  </Text>
               </VStack>
            ))}
            {cursor && (
               <Button
                  label="Load more results"
                  isLoading={loading}
                  onClick={() => {
                     if (!busy.current) void load(cursor);
                  }}
               />
            )}
         </VStack>
      </DesignSurface>
   );
}
