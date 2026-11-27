'use client';

import { useCallback, useEffect, useState } from 'react';
import {
   CircleCheck,
   CircleDashed,
   CircleSlash,
   CircleX,
   ExternalLink,
   FileText,
   Loader,
   RefreshCw,
   RotateCcw,
   Square,
   TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { useMessages } from '@/features/shared/use-messages';
import {
   loadSandboxCi,
   loadSandboxCiLog,
   runSandboxCiAction,
   type SandboxCi,
   type SandboxRun,
} from '@/lib/sandbox';
import { cn } from '@/lib/utils';
import { messages } from './messages.vi';

function RunIcon({ run }: { run: Pick<SandboxRun, 'status' | 'result'> }) {
   if (run.status === 'running') return <Loader className="size-4 animate-spin text-sky-600" />;
   if (run.status === 'queued') return <CircleDashed className="size-4 text-muted-foreground" />;
   if (run.result === 'success') return <CircleCheck className="size-4 text-emerald-600" />;
   if (run.result === 'failure') return <CircleX className="size-4 text-red-600" />;
   if (run.result === 'warning') return <TriangleAlert className="size-4 text-amber-600" />;
   return <CircleSlash className="size-4 text-muted-foreground" />;
}

const DOT: Record<string, string> = {
   success: 'bg-emerald-500',
   failure: 'bg-red-500',
   warning: 'bg-amber-500',
   running: 'bg-sky-500',
   queued: 'bg-muted-foreground/40',
};

function ago(at: number | null, now: number): string {
   if (!at) return '';
   const minutes = Math.max(0, Math.round((now - at) / 60_000));
   if (minutes < 60) return `${minutes}m`;
   if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
   return `${Math.round(minutes / 60 / 24)}d`;
}

/**
 * termi's Pipelines (src/ci, public/js/pipelines*.mjs): the runs of the session's repository on
 * GitHub Actions or Azure Pipelines, filtered by pipeline and branch; a run opens on the web, can
 * be rerun (only its failed jobs on GitHub) or cancelled, and shows the log of its failed steps.
 * VI: Pipelines của termi: các lần chạy của repository chứa phiên trên GitHub Actions hoặc Azure
 * VI: Pipelines, lọc theo pipeline và nhánh; mỗi lần chạy mở được trên web, chạy lại được (GitHub
 * VI: chỉ job lỗi) hoặc huỷ, và xem được log các bước lỗi.
 */
export function PipelinesPanel({ dir }: { dir: string }) {
   const tx = useMessages(messages);
   const [ci, setCi] = useState<SandboxCi | null>(null);
   const [error, setError] = useState('');
   const [pipeline, setPipeline] = useState<string>('');
   const [allBranches, setAllBranches] = useState(false);
   const [log, setLog] = useState<{ title: string; text: string } | null>(null);
   const [busy, setBusy] = useState('');
   const [now, setNow] = useState(0);

   const load = useCallback(
      (fresh = false) => {
         setNow(Date.now());
         return loadSandboxCi(dir, fresh).then(
            (found) => {
               setCi(found);
               setError('');
            },
            (failure: Error) => setError(failure.message)
         );
      },
      [dir]
   );
   useEffect(() => {
      void load();
   }, [load]);

   const act = async (run: SandboxRun, action: 'rerun' | 'cancel') => {
      setBusy(`${run.id}-${action}`);
      try {
         await runSandboxCiAction(dir, run.id, action);
         toast.success(action === 'rerun' ? tx('Run started again') : tx('Run cancelled'));
      } catch (failure) {
         toast.error(failure instanceof Error ? failure.message : String(failure));
      } finally {
         setBusy('');
         void load(true);
      }
   };

   const showLog = (run: SandboxRun) =>
      void loadSandboxCiLog(dir, run.id).then(
         (text) => setLog({ title: `${run.pipeline} ${run.number}`, text }),
         (failure: Error) => toast.error(failure.message)
      );

   if (error) {
      return (
         <Text type="supporting" role="alert" className="p-4">
            {error}
         </Text>
      );
   }
   if (!ci) return null;
   if (!ci.provider) {
      return (
         <Text type="supporting" className="p-4">
            {tx('This repository is not on GitHub or Azure DevOps.')}
         </Text>
      );
   }

   const runs = ci.runs.filter(
      (run) =>
         (!pipeline || run.pipelineId === pipeline) &&
         (allBranches || !ci.branch || run.branch === ci.branch)
   );

   return (
      <div className="flex min-h-0 flex-1 flex-col">
         <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate font-mono" data-testid="ci-repo">
               {ci.repo}
            </span>
            <a
               href={ci.page}
               target="_blank"
               rel="noreferrer"
               aria-label={tx('Open the pipelines on the web')}
               className="rounded p-1 hover:bg-accent"
            >
               <ExternalLink className="size-3.5" />
            </a>
            <button
               type="button"
               aria-label={tx('Refresh')}
               onClick={() => void load(true)}
               className="rounded p-1 hover:bg-accent"
            >
               <RefreshCw className="size-3.5" />
            </button>
         </div>
         {/* The filter row wraps, so every pipeline stays visible (termi v1.12.1). */}
         <div
            role="group"
            aria-label={tx('Pipelines')}
            className="flex shrink-0 flex-wrap gap-1 border-b px-3 py-2"
         >
            {[{ id: '', name: tx('All pipelines'), recent: [] as string[] }, ...ci.pipelines].map(
               (item) => (
                  <button
                     key={item.id || 'all'}
                     type="button"
                     aria-pressed={pipeline === item.id}
                     onClick={() => setPipeline(item.id)}
                     className={cn(
                        'flex max-w-full items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-accent',
                        pipeline === item.id && 'bg-accent'
                     )}
                  >
                     <span className="truncate">{item.name}</span>
                     {item.recent.map((state, index) => (
                        <span
                           key={index}
                           className={cn('size-1.5 rounded-full', DOT[state] ?? 'bg-muted')}
                        />
                     ))}
                  </button>
               )
            )}
            {ci.branch && (
               <button
                  type="button"
                  aria-pressed={allBranches}
                  onClick={() => setAllBranches(!allBranches)}
                  className="ml-auto max-w-[50%] truncate rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
               >
                  {allBranches ? tx('All branches') : ci.branch}
               </button>
            )}
         </div>
         <ul aria-label={tx('Runs')} className="min-h-0 flex-1 overflow-y-auto py-1">
            {runs.length === 0 && (
               <li className="px-3 py-2 text-sm text-muted-foreground">{tx('No runs yet.')}</li>
            )}
            {runs.map((run) => (
               <li
                  key={run.id}
                  className="flex items-start gap-2 px-3 py-1.5 text-sm hover:bg-accent/50"
               >
                  <span className="pt-0.5">
                     <RunIcon run={run} />
                  </span>
                  <span className="min-w-0 flex-1">
                     <a
                        href={run.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate hover:underline"
                     >
                        {run.title}
                     </a>
                     <span className="block truncate text-xs text-muted-foreground">
                        {run.pipeline} {run.number} · {run.branch}
                        {run.actor ? ` · ${run.actor}` : ''} · {ago(run.queuedAt, now)}
                     </span>
                  </span>
                  {run.result === 'failure' && (
                     <button
                        type="button"
                        aria-label={tx('Log of {run}', { run: run.number })}
                        onClick={() => showLog(run)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                     >
                        <FileText className="size-3.5" />
                     </button>
                  )}
                  {run.status === 'completed' ? (
                     <button
                        type="button"
                        aria-label={tx('Rerun {run}', { run: run.number })}
                        disabled={Boolean(busy)}
                        onClick={() => void act(run, 'rerun')}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                     >
                        <RotateCcw className="size-3.5" />
                     </button>
                  ) : (
                     <button
                        type="button"
                        aria-label={tx('Cancel {run}', { run: run.number })}
                        disabled={Boolean(busy)}
                        onClick={() => void act(run, 'cancel')}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                     >
                        <Square className="size-3.5" />
                     </button>
                  )}
               </li>
            ))}
         </ul>
         {log && (
            <Dialog
               isOpen
               aria-label={log.title}
               width={960}
               onOpenChange={(isOpen) => !isOpen && setLog(null)}
            >
               <Layout
                  height="auto"
                  padding={4}
                  header={<DialogHeader title={log.title} onOpenChange={() => setLog(null)} />}
               >
                  <LayoutContent>
                     <pre
                        data-testid="ci-log"
                        className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 font-mono text-xs"
                     >
                        {log.text}
                     </pre>
                  </LayoutContent>
               </Layout>
            </Dialog>
         )}
      </div>
   );
}
