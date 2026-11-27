'use client';

import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMessages } from '@/features/shared/use-messages';
import { loadSandboxUsage, type SandboxUsage } from '@/lib/sandbox';
import { messages } from './messages.vi';

const USAGE_MS = 30_000;
const GB = 1024 ** 3;

const gigabytes = (bytes: number | null | undefined) =>
   bytes == null ? '—' : `${(bytes / GB).toFixed(1)} GB`;

function resetTime(at: number): string {
   return new Date(at).toLocaleString(undefined, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
   });
}

/**
 * termi's usage chip: the sandbox's CPU and memory and the busiest plan window of Claude and
 * Codex; the popover shows every window with when it resets, and free disk.
 * VI: Chip usage của termi: CPU và bộ nhớ của sandbox cùng khung giới hạn gói dùng nhiều nhất
 * VI: của Claude và Codex; popover hiện mọi khung kèm lúc đặt lại, và ổ còn trống.
 */
export function UsageChip() {
   const tx = useMessages(messages);
   const [usage, setUsage] = useState<SandboxUsage | null>(null);

   useEffect(() => {
      const load = () => loadSandboxUsage().then(setUsage, () => undefined);
      void load();
      const timer = setInterval(() => void load(), USAGE_MS);
      return () => clearInterval(timer);
   }, []);

   if (!usage) return null;
   const windows = [
      [tx('Claude, 5 hours'), usage.claude?.fiveHour],
      [tx('Claude, 7 days'), usage.claude?.sevenDay],
      [tx('Codex, short window'), usage.codex?.primary],
      [tx('Codex, weekly window'), usage.codex?.secondary],
   ] as const;
   const busiest = (a?: { pct: number } | null, b?: { pct: number } | null) =>
      Math.max(a?.pct ?? -1, b?.pct ?? -1);
   const claude = busiest(usage.claude?.fiveHour, usage.claude?.sevenDay);
   const codex = busiest(usage.codex?.primary, usage.codex?.secondary);
   const memory =
      usage.memory.used && usage.memory.limit ? usage.memory.used / usage.memory.limit : null;

   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               type="button"
               aria-label={tx('Sandbox usage')}
               className="flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-accent"
            >
               <Gauge className="size-3.5" />
               <span className="hidden sm:inline">
                  CPU {usage.cpu ?? '—'}% · RAM{' '}
                  {memory == null ? '—' : `${Math.round(memory * 100)}%`}
               </span>
               {claude >= 0 && <span>Claude {claude}%</span>}
               {codex >= 0 && <span>Codex {codex}%</span>}
            </button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-72 text-sm">
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1" data-testid="usage-details">
               <dt className="text-muted-foreground">CPU</dt>
               <dd>{usage.cpu ?? '—'}%</dd>
               <dt className="text-muted-foreground">{tx('Memory')}</dt>
               <dd>
                  {gigabytes(usage.memory.used)} / {gigabytes(usage.memory.limit)}
               </dd>
               <dt className="text-muted-foreground">{tx('Free disk')}</dt>
               <dd>{gigabytes(usage.disk.free)}</dd>
               {windows.map(([label, window]) =>
                  window ? (
                     <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd>
                           {window.pct}% ·{' '}
                           {tx('resets {time}', { time: resetTime(window.resetsAt) })}
                        </dd>
                     </div>
                  ) : null
               )}
            </dl>
            {!usage.claude && !usage.codex && (
               <p className="mt-2 text-xs text-muted-foreground">
                  {tx('Plan limits appear after Claude Code or Codex has answered once.')}
               </p>
            )}
         </PopoverContent>
      </Popover>
   );
}
