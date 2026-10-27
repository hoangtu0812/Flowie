'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Bot, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@astryxdesign/core/Button';
import { useLocale } from '@/features/shared/use-locale';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';
import { cancelAgentRun, loadAgentRuns, type AgentRun } from '@/lib/agent-runs';
import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useIssuesStore } from '@/store/issues-store';

const ACTIVE = new Set(['PENDING', 'RUNNING']);
// Runners send at most one progress line every ten seconds, so polling faster adds nothing.
// VI: Runner gửi tối đa một dòng tiến độ mỗi mười giây, nên poll nhanh hơn không có ích.
const POLL_MS = 5000;
const STATES: Record<string, { label: keyof typeof messages; tone: string }> = {
   PENDING: { label: 'Waiting for a runner', tone: 'bg-muted text-muted-foreground' },
   RUNNING: { label: 'Running', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
   AWAITING_REVIEW: {
      label: 'Awaiting review',
      tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
   },
   FAILED: { label: 'Failed', tone: 'bg-red-500/15 text-red-700 dark:text-red-300' },
   CANCELED: { label: 'Canceled', tone: 'bg-muted text-muted-foreground' },
};

/**
 * Shows the issue's latest agent run: its state, the runner's latest activity line and when
 * it arrived, the pull request once there is one, and a cancel button for the run's owner
 * while it is active. It polls only while the run is pending or running and renders nothing
 * for an issue no agent has worked on.
 * VI: Hiển thị agent run mới nhất của issue: trạng thái, dòng hoạt động mới nhất của runner
 * VI: và thời điểm nhận, pull request khi đã có, và nút hủy cho chủ run khi run đang chạy.
 * VI: Chỉ poll khi run đang chờ hoặc đang chạy; issue chưa từng có agent làm thì không hiện.
 */
export function IssueAgentRun({ issueId }: { issueId: string }) {
   const tx = useMessages(messages);
   const { locale } = useLocale();
   const workspaceId = useIssuesStore((store) => store.workspaceId);
   const [run, setRun] = useState<AgentRun>();
   const [now, setNow] = useState(() => Date.now());
   const [canceling, setCanceling] = useState(false);
   const active = run !== undefined && ACTIVE.has(run.state);

   const load = useCallback(async () => {
      if (!workspaceId) return undefined;
      return (await loadAgentRuns(workspaceId, { issueId, limit: 1 })).items[0];
   }, [workspaceId, issueId]);

   useEffect(() => {
      let current = true;
      const refresh = () =>
         load()
            .then((latest) => {
               if (current) {
                  setRun(latest);
                  setNow(Date.now());
               }
            })
            .catch(() => undefined);
      void refresh();
      const timer = active ? setInterval(refresh, POLL_MS) : undefined;
      return () => {
         current = false;
         if (timer) clearInterval(timer);
      };
   }, [load, active]);

   if (!run || !workspaceId) return null;
   const state = STATES[run.state];
   const updated = run.progressAt ?? run.startedAt ?? run.createdAt;

   async function cancel() {
      if (!run || !workspaceId) return;
      setCanceling(true);
      try {
         await cancelAgentRun(workspaceId, run.id);
         setRun(await load());
      } catch (reason) {
         toast.error(reason instanceof Error ? reason.message : tx('Could not cancel the run.'));
      } finally {
         setCanceling(false);
      }
   }

   return (
      <section
         aria-live="polite"
         aria-label={tx('Agent run')}
         className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm"
      >
         <div className="flex min-w-0 items-center gap-2">
            <Bot className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{tx('Agent run')}</span>
            <span
               className={cn(
                  'rounded px-1.5 py-0.5 text-xs font-medium',
                  state?.tone ?? 'bg-muted'
               )}
            >
               {state ? tx(state.label) : run.state}
            </span>
            {run.connectionName && (
               <span className="min-w-0 truncate text-muted-foreground">
                  · {run.connectionName}
               </span>
            )}
            <span className="ml-auto" />
            {active && run.ownedByCurrentUser && (
               <Button
                  label={tx('Cancel run')}
                  size="sm"
                  variant="ghost"
                  isLoading={canceling}
                  onClick={() => void cancel()}
               />
            )}
         </div>
         {run.progress && (
            <p className="mt-2 flex min-w-0 items-center gap-2">
               {active && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
               <span className="min-w-0 truncate" title={run.progress}>
                  {run.progress}
               </span>
            </p>
         )}
         <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{tx('Updated {value0}', { value0: relativeTime(updated, now, locale) })}</span>
            {run.pullRequestUrl && (
               <a
                  href={run.pullRequestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 hover:text-foreground"
               >
                  {tx('Pull request')}
                  <ArrowUpRight className="size-3" />
               </a>
            )}
         </div>
      </section>
   );
}
