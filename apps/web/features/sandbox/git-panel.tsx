'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useMessages } from '@/features/shared/use-messages';
import {
   loadSandboxDiff,
   loadSandboxGit,
   runSandboxGit,
   type SandboxDiff,
   type SandboxGit,
   type SandboxGitOp,
} from '@/lib/sandbox';
import { cn } from '@/lib/utils';
import { messages } from './messages.vi';

const ROW = 28;
const LANE = 14;
const LANE_COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

/** One row of termi's commit graph: lane segments and the commit's dot. */
/** VI: Một hàng của đồ thị commit kiểu termi: các đoạn làn và chấm của commit. */
function GraphCell({ width, row }: { width: number; row: SandboxGit['graph']['rows'][number] }) {
   const x = (lane: number) => 8 + lane * LANE;
   const y = (position: number) => (position * ROW) / 2;
   return (
      <svg width={8 + width * LANE} height={ROW} aria-hidden className="shrink-0">
         {row.seg.map(([fromLane, fromPos, toLane, toPos], index) => {
            const [x1, y1, x2, y2] = [x(fromLane), y(fromPos), x(toLane), y(toPos)];
            const middle = (y1 + y2) / 2;
            return (
               <path
                  key={index}
                  d={`M${x1},${y1} C${x1},${middle} ${x2},${middle} ${x2},${y2}`}
                  fill="none"
                  strokeWidth={2}
                  stroke={
                     LANE_COLORS[(fromLane === row.col ? toLane : fromLane) % LANE_COLORS.length]
                  }
               />
            );
         })}
         <circle
            cx={x(row.col)}
            cy={ROW / 2}
            r={4}
            fill={LANE_COLORS[row.col % LANE_COLORS.length]}
         />
      </svg>
   );
}

/** A unified diff with added, removed and hunk lines coloured. */
/** VI: Diff dạng unified, tô màu dòng thêm, dòng xoá và dòng hunk. */
function DiffText({ text }: { text: string }) {
   return (
      <pre className="whitespace-pre-wrap break-all font-mono text-xs" data-testid="diff-text">
         {text.split('\n').map((line, index) => (
            <span
               key={index}
               className={cn(
                  'block',
                  line.startsWith('+') &&
                     !line.startsWith('+++') &&
                     'bg-emerald-500/10 text-emerald-700',
                  line.startsWith('-') && !line.startsWith('---') && 'bg-red-500/10 text-red-700',
                  line.startsWith('@@') && 'text-sky-700'
               )}
            >
               {line || ' '}
            </span>
         ))}
      </pre>
   );
}

/**
 * termi's git view for the repository of the current session's folder: branch and switching,
 * fetch, pull and push, changes with stage, unstage and per-file diffs, commit, and the commit
 * graph whose rows open that commit's diff.
 * VI: Màn hình git của termi cho repository chứa thư mục của phiên đang chọn: nhánh và đổi
 * VI: nhánh, fetch, pull, push, thay đổi với stage, unstage và diff từng file, commit, và đồ thị
 * VI: commit mà mỗi hàng mở diff của commit đó.
 */
export function GitPanel({ dir }: { dir: string }) {
   const tx = useMessages(messages);
   const [git, setGit] = useState<SandboxGit | null>(null);
   const [error, setError] = useState('');
   const [busy, setBusy] = useState('');
   const [message, setMessage] = useState('');
   const [diff, setDiff] = useState<{ title: string; diff: SandboxDiff } | null>(null);

   const reload = useCallback(
      () =>
         loadSandboxGit(dir).then(
            (found) => {
               setGit(found);
               setError('');
            },
            (failure: Error) => {
               setGit(null);
               setError(failure.message);
            }
         ),
      [dir]
   );
   useEffect(() => void reload(), [reload]);

   const run = async (op: SandboxGitOp, label: string) => {
      if (!git) return;
      setBusy(label);
      try {
         const output = await runSandboxGit(git.dir, op);
         if (output) toast.success(output.split('\n').slice(-1)[0]);
         if (op.op === 'commit') setMessage('');
      } catch (failure) {
         toast.error(failure instanceof Error ? failure.message : String(failure));
      } finally {
         setBusy('');
         void reload();
      }
   };

   const showDiff = (title: string, options: { rev?: string; file?: string; staged?: boolean }) =>
      git &&
      void loadSandboxDiff(git.dir, options).then(
         (found) => setDiff({ title, diff: found }),
         (failure: Error) => toast.error(failure.message)
      );

   if (error) {
      return (
         <Text type="supporting" role="alert" className="p-4">
            {error}
         </Text>
      );
   }
   if (!git) return null;

   const staged = git.files.filter((file) => file.x !== ' ' && file.x !== '?');
   const changed = git.files.filter((file) => file.y !== ' ' || file.x === '?');
   const branch = git.head.split('...')[0];

   return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
         <div className="flex shrink-0 flex-wrap items-end gap-2 border-b px-3 py-2">
            <Selector
               label={tx('Branch')}
               width={220}
               value={branch}
               options={[
                  ...(git.branches.includes(branch) ? [] : [{ value: branch, label: branch }]),
                  ...git.branches.map((name) => ({ value: name, label: name })),
               ]}
               onChange={(value) =>
                  value !== branch && void run({ op: 'switch', branch: value }, 'switch')
               }
            />
            <Text type="supporting" className="pb-2 text-xs" data-testid="git-head">
               {git.head}
            </Text>
            <div className="ml-auto flex gap-1">
               <Button
                  label={tx('Fetch')}
                  icon={<RefreshCw className="size-4" />}
                  size="sm"
                  variant="ghost"
                  isLoading={busy === 'fetch'}
                  onClick={() => void run({ op: 'fetch' }, 'fetch')}
               />
               <Button
                  label={tx('Pull')}
                  icon={<ArrowDown className="size-4" />}
                  size="sm"
                  variant="ghost"
                  isLoading={busy === 'pull'}
                  onClick={() => void run({ op: 'pull' }, 'pull')}
               />
               <Button
                  label={tx('Push')}
                  icon={<ArrowUp className="size-4" />}
                  size="sm"
                  variant="ghost"
                  isLoading={busy === 'push'}
                  onClick={() => void run({ op: 'push' }, 'push')}
               />
            </div>
         </div>

         {[
            { title: tx('Staged'), files: staged, stagedList: true },
            { title: tx('Changes'), files: changed, stagedList: false },
         ].map(
            (group) =>
               group.files.length > 0 && (
                  <section key={group.title} className="border-b px-3 py-2">
                     <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                        {group.title} ({group.files.length})
                     </h3>
                     <ul aria-label={group.title}>
                        {group.files.map((file) => (
                           <li key={file.path} className="flex items-center gap-2 text-sm">
                              <span className="w-3 font-mono text-xs text-amber-600">
                                 {group.stagedList ? file.x : file.x === '?' ? 'U' : file.y}
                              </span>
                              <button
                                 type="button"
                                 className="min-w-0 flex-1 truncate text-left hover:underline"
                                 onClick={() =>
                                    showDiff(file.path, {
                                       file: file.path,
                                       staged: group.stagedList,
                                    })
                                 }
                              >
                                 {file.path}
                              </button>
                              <button
                                 type="button"
                                 disabled={Boolean(busy)}
                                 className="shrink-0 rounded px-2 text-xs hover:bg-accent"
                                 onClick={() =>
                                    void run(
                                       {
                                          op: group.stagedList ? 'unstage' : 'stage',
                                          paths: [file.path],
                                       },
                                       'stage'
                                    )
                                 }
                              >
                                 {group.stagedList ? tx('Unstage') : tx('Stage')}
                              </button>
                           </li>
                        ))}
                     </ul>
                  </section>
               )
         )}

         <div className="flex shrink-0 items-end gap-2 border-b px-3 py-2">
            <TextInput
               label={tx('Commit message')}
               value={message}
               width="100%"
               onChange={setMessage}
            />
            <Button
               label={tx('Commit')}
               size="sm"
               isLoading={busy === 'commit'}
               isDisabled={!message.trim() || !staged.length}
               onClick={() => void run({ op: 'commit', message }, 'commit')}
            />
         </div>

         <ul aria-label={tx('Commits')} className="py-1">
            {git.commits.map((commit, index) => (
               <li key={commit.h}>
                  <button
                     type="button"
                     onClick={() => showDiff(commit.s, { rev: commit.h })}
                     className="flex h-7 w-full items-center gap-2 pr-3 text-left text-sm hover:bg-accent"
                  >
                     {git.graph.rows[index] && (
                        <GraphCell width={git.graph.width} row={git.graph.rows[index]} />
                     )}
                     {commit.refs.map((ref) => (
                        <span
                           key={ref}
                           className="shrink-0 rounded bg-sky-500/15 px-1 text-[10px] text-sky-700"
                        >
                           {ref.replace(/^HEAD -> /, '')}
                        </span>
                     ))}
                     <span className="min-w-0 flex-1 truncate">{commit.s}</span>
                     <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {commit.h.slice(0, 7)}
                     </span>
                  </button>
               </li>
            ))}
         </ul>

         {diff && (
            <Dialog
               isOpen
               aria-label={diff.title}
               width={960}
               onOpenChange={(isOpen) => !isOpen && setDiff(null)}
            >
               <Layout
                  height="auto"
                  padding={4}
                  header={<DialogHeader title={diff.title} onOpenChange={() => setDiff(null)} />}
               >
                  <LayoutContent>
                     {diff.diff.commit && (
                        <Text type="supporting" className="mb-2 block text-xs">
                           {diff.diff.commit.author} · {diff.diff.commit.hash.slice(0, 12)} ·{' '}
                           {new Date(diff.diff.commit.t).toLocaleString()}
                        </Text>
                     )}
                     {diff.diff.files && diff.diff.files.length > 0 && (
                        <ul className="mb-2 text-xs">
                           {diff.diff.files.map((file) => (
                              <li key={file.path} className="font-mono">
                                 <span className="text-emerald-700">+{file.add ?? '?'}</span>{' '}
                                 <span className="text-red-700">−{file.del ?? '?'}</span>{' '}
                                 {file.path}
                              </li>
                           ))}
                        </ul>
                     )}
                     <div className="max-h-[60vh] overflow-auto rounded bg-muted p-2">
                        <DiffText text={diff.diff.text} />
                     </div>
                  </LayoutContent>
               </Layout>
            </Dialog>
         )}
      </div>
   );
}
