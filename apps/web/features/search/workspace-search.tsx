'use client';
import { useLocale } from '@/features/shared/use-locale';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Box, CircleDot, FileText, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import { cn } from '@/lib/utils';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseEnvelope } from '@/lib/http';
import { useParams } from 'next/navigation';
type SearchItem = { kind: string; id: string; title: string; subtitle: string; path: string };
type Kind = 'issue' | 'document' | 'project' | 'member';

// Filter tabs and row icons per result kind; '' is the unfiltered "All" tab.
// VI: Tab lọc và icon dòng theo loại kết quả; '' là tab "Tất cả" không lọc.
const KINDS = [
   ['', 'all'],
   ['issue', 'searchKindIssues'],
   ['document', 'searchKindDocuments'],
   ['project', 'searchKindProjects'],
   ['member', 'searchKindMembers'],
] as const;
const ICONS: Record<string, typeof Box> = {
   issue: CircleDot,
   document: FileText,
   project: Box,
   member: User,
};

/**
 * Page header in the 40px bordered bar every list page uses (Views, Projects), so /search keeps
 * the sidebar toggle and title in the same place.
 * VI: Header trang dạng thanh 40px có viền như các trang danh sách (Views, Projects), để /search
 * VI: giữ nút mở sidebar và tiêu đề ở cùng vị trí.
 */
export function SearchHeader() {
   const { t } = useLocale();
   return (
      <div className="w-full flex items-center gap-2 border-b py-1.5 px-6 h-10">
         <SidebarTrigger />
         <span className="text-sm font-medium">{t('searchWorkspace')}</span>
      </div>
   );
}

/**
 * Server-side workspace search (GET /search) laid out with the shared list-page building blocks:
 * Input, Views-style filter tabs, ViewRow-style result rows, LoadingState, QueryState and a
 * centred empty message. The API's subtitle is the issue/project key or a fixed "Document"/"Member"
 * word, so it is shown only when it adds something beyond the kind label.
 * VI: Tìm toàn workspace phía server (GET /search) dựng bằng các khối dùng chung của trang danh
 * VI: sách: Input, tab lọc kiểu Views, dòng kết quả kiểu ViewRow, LoadingState, QueryState và thông
 * VI: báo trống căn giữa. Subtitle của API là mã issue/dự án hoặc chữ cố định "Document"/"Member",
 * VI: nên chỉ hiện khi nó thêm thông tin ngoài nhãn loại.
 */
export function WorkspaceSearch({ initialQuery = '' }: { initialQuery?: string }) {
   const { t } = useLocale();
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
      // Show the loader during the debounce so an unsent query never reads as "no results".
      // VI: Hiện loader trong lúc chờ debounce để truy vấn chưa gửi không bị hiểu là "không có kết quả".
      setLoading(query.trim() !== '');
      if (!query.trim()) return;
      const timer = window.setTimeout(() => void load(), 300);
      return () => {
         window.clearTimeout(timer);
         epoch.current++;
      };
      // Search responses are bound to the query, filter and workspace route.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [query, kind, orgId, retry]);
   const searched = query.trim() !== '';
   return (
      <div className="w-full h-full overflow-y-auto">
         <div className="flex flex-col gap-2 px-6 pt-3 pb-2 border-b">
            <div className="relative">
               <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
               <Input
                  autoFocus
                  type="search"
                  aria-label={t('searchLabel')}
                  placeholder={t('searchLabel')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-8"
               />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
               {KINDS.map(([value, label]) => (
                  <button
                     key={value}
                     aria-pressed={kind === value}
                     onClick={() => setKind(value)}
                     className={cn(
                        'px-2.5 py-1 rounded-md border text-xs font-medium transition-colors',
                        kind === value
                           ? 'bg-accent border-transparent'
                           : 'text-muted-foreground hover:bg-accent/50'
                     )}
                  >
                     {t(label)}
                  </button>
               ))}
            </div>
         </div>
         {error ? (
            <QueryState message={error} onRetry={() => setRetry((value) => value + 1)} />
         ) : loading && items.length === 0 ? (
            <LoadingState label={t('searching')} className="min-h-48" />
         ) : !searched || items.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
               {searched ? t('noSearchResults') : t('searchPrompt')}
            </div>
         ) : (
            <>
               {items.map((item) => {
                  const Icon = ICONS[item.kind] ?? FileText;
                  const kindLabel = t(item.kind as Kind);
                  const key = `${item.kind}:${item.id}`;
                  return (
                     <Link
                        key={key}
                        href={`/${orgId}${item.path}`}
                        aria-labelledby={`search-${key}`}
                        className="flex items-center gap-3 px-6 py-2.5 border-b border-border/50 hover:bg-sidebar/50 transition-colors"
                     >
                        <span className="inline-flex size-6 items-center justify-center rounded bg-muted/50 shrink-0">
                           <Icon className="size-3.5" />
                        </span>
                        <span className="flex flex-col min-w-0 flex-1">
                           <span id={`search-${key}`} className="text-sm font-medium truncate">
                              {item.title}
                           </span>
                           <span className="text-xs text-muted-foreground capitalize">
                              {kindLabel}
                           </span>
                        </span>
                        {item.subtitle.toLowerCase() !== item.kind && (
                           <span className="text-xs text-muted-foreground font-mono shrink-0">
                              {item.subtitle}
                           </span>
                        )}
                     </Link>
                  );
               })}
               {cursor && (
                  <div className="flex justify-center py-3">
                     <Button
                        size="sm"
                        variant="outline"
                        disabled={loading}
                        onClick={() => {
                           if (!busy.current) void load(cursor);
                        }}
                     >
                        {t('moreSearchResults')}
                     </Button>
                  </div>
               )}
            </>
         )}
      </div>
   );
}
