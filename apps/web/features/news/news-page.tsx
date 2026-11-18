'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ExternalLink, Loader2, RefreshCw, Settings2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import { useDateFormatter } from '@/features/shared/account-time';
import { useMessages } from '@/features/shared/use-messages';
import { cn } from '@/lib/utils';
import { loadCurrentWorkspace } from '@/lib/workspaces';
import { messages } from './messages.vi';
import { NewsSourcesDialog } from './news-sources-dialog';
import { newsRequest, RISK_LEVELS, type NewsData, type RiskLevel } from './types';

/**
 * 40px bordered page bar shared by list pages (Views, Projects, Search).
 * VI: Thanh tiêu đề 40px có viền dùng chung với các trang danh sách (Views, Projects, Search).
 */
export function NewsHeader() {
   const tx = useMessages(messages);
   return (
      <div className="w-full flex items-center gap-2 border-b py-1.5 px-6 h-10">
         <SidebarTrigger />
         <span className="text-sm font-medium">{tx('News')}</span>
      </div>
   );
}

const RISK_STYLES: Record<RiskLevel, { label: string; className: string }> = {
   CRITICAL: { label: 'Critical', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
   HIGH: { label: 'High', className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
   MEDIUM: { label: 'Medium', className: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
   LOW: { label: 'Low', className: 'bg-muted text-muted-foreground' },
};

/**
 * Read-only news feed (GET /news): group tabs, newest items first, each opening the original
 * article in a new tab. Titles and summaries arrive as plain text from the API and are rendered
 * as text. Owners/admins also get "Fetch now" and the sources dialog; every change reloads the
 * page data so tabs, items and sources stay consistent.
 * VI: Trang tin chỉ đọc (GET /news): tab theo nhóm, tin mới nhất trước, mỗi tin mở bài gốc ở tab
 * VI: mới. Tiêu đề và tóm tắt từ API là văn bản thuần và được hiển thị như văn bản. Owner/admin có
 * VI: thêm "Lấy tin ngay" và hộp thoại nguồn; mỗi thay đổi tải lại dữ liệu để tab, tin và nguồn
 * VI: luôn khớp nhau.
 *
 * AI fields (risk level, score, Vietnamese summary, category digest) are optional: unlabelled
 * items keep the feed summary and sort last under "Highest risk", so the page works unchanged
 * when the workspace has no AI provider. The risk filter toggles one level at a time.
 * VI: Trường AI (mức rủi ro, điểm, tóm tắt tiếng Việt, bản tin nhóm) là tuỳ chọn: tin chưa có nhãn
 * VI: giữ tóm tắt gốc và nằm cuối khi sắp "Rủi ro cao nhất", nên trang vẫn chạy như cũ khi workspace
 * VI: không có provider AI. Bộ lọc rủi ro bật/tắt từng mức một.
 *
 * The "AI" button beside each item asks POST /news/items/{id}/summary for a Vietnamese summary
 * of the article and shows it under the item; pressing it again hides or shows the same text.
 * VI: Nút "AI" cạnh mỗi tin gọi POST /news/items/{id}/summary để lấy tóm tắt tiếng Việt của bài
 * VI: và hiện dưới tin; bấm lại thì ẩn hoặc hiện lại đúng nội dung đó.
 */
export function NewsFeed() {
   const tx = useMessages(messages);
   const dateLabel = useDateFormatter();
   const { orgId } = useParams<{ orgId: string }>();
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [data, setData] = useState<NewsData>();
   const [error, setError] = useState<string>();
   const [category, setCategory] = useState('');
   const [sortByRisk, setSortByRisk] = useState(false);
   const [risk, setRisk] = useState<RiskLevel>();
   const [manageOpen, setManageOpen] = useState(false);
   const [refreshing, setRefreshing] = useState(false);
   // Per-item AI summaries: undefined = never asked, null = loading. Kept for the visit so
   // hiding and showing again costs no second AI call.
   // VI: Tóm tắt AI theo tin: undefined = chưa hỏi, null = đang tải. Giữ trong lượt xem để ẩn rồi
   // VI: hiện lại không tốn thêm lời gọi AI.
   const [summaries, setSummaries] = useState<Record<string, string | null>>({});
   const [open, setOpen] = useState<Record<string, boolean>>({});

   const load = useCallback(async () => {
      setError(undefined);
      try {
         const workspace = await loadCurrentWorkspace(orgId);
         setWorkspaceId(workspace.id);
         setData(await newsRequest<NewsData>(workspace.id));
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : tx('Could not load news.'));
      }
   }, [orgId, tx]);
   useEffect(() => {
      void load();
   }, [load]);

   const fetchNow = async () => {
      if (!workspaceId) return;
      setRefreshing(true);
      try {
         const result = await newsRequest<{ fetched: number; inserted: number }>(
            workspaceId,
            '/refresh',
            'POST'
         );
         toast.success(tx('Fetched {fetched} source(s), {inserted} new item(s).', result));
         await load();
      } catch (reason) {
         toast.error(reason instanceof Error ? reason.message : tx('Could not load news.'));
      } finally {
         setRefreshing(false);
      }
   };

   const summarize = async (id: string) => {
      if (!workspaceId || summaries[id] === null) return;
      setOpen((current) => ({ ...current, [id]: !current[id] }));
      if (summaries[id] !== undefined) return;
      setSummaries((current) => ({ ...current, [id]: null }));
      try {
         const result = await newsRequest<{ summary: string }>(
            workspaceId,
            `/items/${encodeURIComponent(id)}/summary`,
            'POST'
         );
         setSummaries((current) => ({ ...current, [id]: result.summary }));
      } catch (reason) {
         setSummaries((current) => {
            const rest = { ...current };
            delete rest[id];
            return rest;
         });
         setOpen((current) => ({ ...current, [id]: false }));
         toast.error(
            reason instanceof Error ? reason.message : tx('Could not summarise this item.')
         );
      }
   };

   if (error) return <QueryState message={error} onRetry={() => void load()} />;
   if (!data || !workspaceId)
      return <LoadingState label={tx('Loading news…')} className="min-h-48" />;
   const items = data.items.filter(
      (item) => (!category || item.categoryId === category) && (!risk || item.riskLevel === risk)
   );
   if (sortByRisk) items.sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1));
   const digests = data.categories.filter(
      (tab) => tab.digest && (!category || tab.id === category)
   );
   const tabs = [{ id: '', name: tx('All') }, ...data.categories];
   const chip = (active: boolean) =>
      cn(
         'px-2.5 py-1 rounded-md border text-xs font-medium transition-colors',
         active ? 'bg-accent border-transparent' : 'text-muted-foreground hover:bg-accent/50'
      );
   return (
      <div className="w-full h-full overflow-y-auto">
         <div className="flex flex-wrap items-center gap-1.5 px-6 py-2 border-b">
            {tabs.map((tab) => (
               <button
                  key={tab.id}
                  aria-pressed={category === tab.id}
                  onClick={() => setCategory(tab.id)}
                  className={chip(category === tab.id)}
               >
                  {tab.name}
               </button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            <button
               aria-pressed={!sortByRisk}
               onClick={() => setSortByRisk(false)}
               className={chip(!sortByRisk)}
            >
               {tx('Newest')}
            </button>
            <button
               aria-pressed={sortByRisk}
               onClick={() => setSortByRisk(true)}
               className={chip(sortByRisk)}
            >
               {tx('Highest risk')}
            </button>
            <span className="mx-1 h-4 w-px bg-border" />
            {RISK_LEVELS.map((level) => (
               <button
                  key={level}
                  aria-pressed={risk === level}
                  onClick={() => setRisk(risk === level ? undefined : level)}
                  className={chip(risk === level)}
               >
                  {tx(RISK_STYLES[level].label)}
               </button>
            ))}
            {data.canManage && (
               <div className="ml-auto flex items-center gap-1.5">
                  <Button
                     size="sm"
                     variant="outline"
                     disabled={refreshing}
                     onClick={() => void fetchNow()}
                  >
                     <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
                     {tx('Fetch now')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setManageOpen(true)}>
                     <Settings2 className="size-3.5" />
                     {tx('Manage sources')}
                  </Button>
               </div>
            )}
         </div>
         {digests.map((tab) => (
            <div key={tab.id} className="mx-6 mt-3 rounded-md border bg-sidebar/40 px-4 py-3">
               <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3.5" />
                  {tx('AI digest')} · {tab.name}
                  {tab.digestAt && <span className="font-normal">· {dateLabel(tab.digestAt)}</span>}
               </div>
               <p className="mt-1 text-sm whitespace-pre-line">{tab.digest}</p>
            </div>
         ))}
         {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-16 text-sm text-muted-foreground">
               <span>{tx('No news yet.')}</span>
               <span className="text-xs">
                  {tx('News is fetched every day at 06:30 (Vietnam time).')}
               </span>
            </div>
         ) : (
            <ul>
               {items.map((item) => (
                  <li key={item.id} className="border-b border-border/50">
                     <div className="flex items-start hover:bg-sidebar/50 transition-colors">
                        <a
                           href={item.url}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="flex flex-1 min-w-0 flex-col gap-0.5 pl-6 pr-2 py-2.5"
                        >
                           <span className="flex items-center gap-1.5 text-sm font-medium">
                              {item.riskLevel && (
                                 <span
                                    data-testid="news-risk"
                                    className={cn(
                                       'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                                       RISK_STYLES[item.riskLevel].className
                                    )}
                                 >
                                    {tx(RISK_STYLES[item.riskLevel].label)}
                                 </span>
                              )}
                              <span className="truncate">{item.title}</span>
                              <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                           </span>
                           {(item.aiSummary || item.summary) && (
                              <span className="text-xs text-muted-foreground line-clamp-2">
                                 {item.aiSummary || item.summary}
                              </span>
                           )}
                           <span className="text-xs text-muted-foreground">
                              {item.sourceName} · {dateLabel(item.publishedAt)}
                           </span>
                        </a>
                        <Button
                           size="xs"
                           variant="ghost"
                           className="mt-2 mr-4 shrink-0 text-muted-foreground"
                           aria-expanded={open[item.id] === true}
                           title={tx('Summarise in Vietnamese with AI')}
                           disabled={summaries[item.id] === null}
                           onClick={() => void summarize(item.id)}
                        >
                           {summaries[item.id] === null ? (
                              <Loader2 className="size-3.5 animate-spin" />
                           ) : (
                              <Sparkles className="size-3.5" />
                           )}
                           {tx('AI')}
                        </Button>
                     </div>
                     {open[item.id] && summaries[item.id] && (
                        <div
                           data-testid="news-item-summary"
                           className="mx-6 mb-2.5 rounded-md border bg-sidebar/40 px-3 py-2"
                        >
                           <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <Sparkles className="size-3.5" />
                              {tx('AI summary')}
                           </div>
                           <p className="mt-1 text-sm">{summaries[item.id]}</p>
                        </div>
                     )}
                  </li>
               ))}
            </ul>
         )}
         {data.canManage && (
            <NewsSourcesDialog
               open={manageOpen}
               onOpenChange={setManageOpen}
               workspaceId={workspaceId}
               data={data}
               onChanged={load}
            />
         )}
      </div>
   );
}
