'use client';

import { useEffect, useState } from 'react';
import { Folder, History, Plus, SquareTerminal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@astryxdesign/core/Button';
import { useMessages } from '@/features/shared/use-messages';
import {
   createSandboxSession,
   loadSandboxConversations,
   loadSandboxDirs,
   type SandboxAgent,
   type SandboxConversation,
   type SandboxSession,
} from '@/lib/sandbox';
import { messages } from './messages.vi';
import { sessionName } from './new-session-dialog';
import { shortDir } from './session-list';

const RECENT_PROJECTS = 5;
const AGENTS: { agent: SandboxAgent; label: string }[] = [
   { agent: 'claude', label: 'Claude Code' },
   { agent: 'codex', label: 'Codex' },
];

/** termi's greeting by the hour. VI: Lời chào theo giờ như termi. */
export function greeting(
   hour: number
): 'Good morning' | 'Good noon' | 'Good afternoon' | 'Good evening' {
   if (hour < 11) return 'Good morning';
   if (hour < 14) return 'Good noon';
   if (hour < 18) return 'Good afternoon';
   return 'Good evening';
}

/**
 * termi's start page (public/js/home.mjs), shown when no session is open: continue the latest
 * session, the recent projects with a button per agent and one that resumes the project's last
 * conversation, and a new session in another folder.
 * VI: Trang bắt đầu của termi (public/js/home.mjs), hiện khi chưa mở phiên nào: tiếp tục phiên gần
 * VI: nhất, các dự án gần đây với một nút cho mỗi agent và một nút mở lại hội thoại cuối của dự án,
 * VI: và phiên mới ở thư mục khác.
 */
export function HomePage({
   sessions,
   home,
   onOpen,
   onNewSession,
}: {
   sessions: SandboxSession[];
   home: string;
   onOpen: (name: string) => void;
   onNewSession: () => void;
}) {
   const tx = useMessages(messages);
   const [projects, setProjects] = useState<string[]>([]);
   const [latest, setLatest] = useState<Record<string, SandboxConversation | undefined>>({});
   const [hour, setHour] = useState(12);
   useEffect(() => setHour(new Date().getHours()), []);

   useEffect(() => {
      void loadSandboxDirs().then(
         (dirs) => {
            const recent = dirs.recent.filter((dir) => dir !== dirs.home).slice(0, RECENT_PROJECTS);
            setProjects(recent);
            void loadSandboxConversations('').then(
               (found) =>
                  setLatest(
                     Object.fromEntries(
                        recent.map((dir) => [dir, found.find((c) => c.cwd === dir)])
                     )
                  ),
               () => undefined
            );
         },
         () => undefined
      );
   }, []);

   const start = async (dir: string, agent: SandboxAgent, resume?: string) => {
      try {
         const name = await createSandboxSession({
            name: sessionName(
               dir,
               agent,
               sessions.map((session) => session.name)
            ),
            dir,
            agent,
            ...(resume ? { resume } : {}),
         });
         onOpen(name);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : String(error));
      }
   };

   const continued = [...sessions].sort((a, b) =>
      a.state === 'waiting' ? -1 : b.state === 'waiting' ? 1 : 0
   )[0];

   return (
      <div
         className="flex min-h-0 flex-1 justify-center overflow-y-auto p-6"
         data-testid="sandbox-home"
      >
         <div className="flex w-full max-w-xl flex-col gap-5">
            <div>
               <h2 className="text-lg font-semibold">{tx(greeting(hour))}</h2>
               <p className="text-sm text-muted-foreground">
                  {sessions.length
                     ? tx('Pick a session on the left, or start working in a recent project.')
                     : tx(
                          'Pick a project and an agent to begin. Sessions run in tmux in your sandbox and survive closing this page.'
                       )}
               </p>
            </div>
            <div className="rounded-lg border">
               {continued && (
                  <section className="border-b p-3">
                     <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                        {tx('Continue')}
                     </h3>
                     <button
                        type="button"
                        onClick={() => onOpen(continued.name)}
                        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
                     >
                        <SquareTerminal className="size-5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                           <span className="block truncate text-sm font-medium">
                              {continued.name}
                           </span>
                           <span className="block truncate text-xs text-muted-foreground">
                              {shortDir(continued.dir, home)}
                           </span>
                        </span>
                     </button>
                  </section>
               )}
               <section className="p-3">
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                     {tx('Recent projects')}
                  </h3>
                  {projects.length === 0 && (
                     <p className="px-2 py-2 text-sm text-muted-foreground">
                        {tx('No project yet; press Other folder… to pick one.')}
                     </p>
                  )}
                  <ul aria-label={tx('Recent projects')}>
                     {projects.map((dir) => (
                        <li
                           key={dir}
                           className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50"
                        >
                           <Folder className="size-4 shrink-0 text-sky-600" />
                           <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">{dir.split('/').pop()}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                 {shortDir(dir, home)}
                              </span>
                           </span>
                           {latest[dir] && (
                              <button
                                 type="button"
                                 aria-label={tx('Resume {title}', { title: latest[dir]!.title })}
                                 title={latest[dir]!.title}
                                 onClick={() =>
                                    void start(dir, latest[dir]!.agent, latest[dir]!.id)
                                 }
                                 className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                 <History className="size-4" />
                              </button>
                           )}
                           {AGENTS.map(({ agent, label }) => (
                              <button
                                 key={agent}
                                 type="button"
                                 aria-label={tx('New {agent} session in {folder}', {
                                    agent: label,
                                    folder: dir.split('/').pop() ?? dir,
                                 })}
                                 onClick={() => void start(dir, agent)}
                                 className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
                              >
                                 {label}
                              </button>
                           ))}
                        </li>
                     ))}
                  </ul>
                  <div className="mt-3 flex justify-end gap-2">
                     <Button
                        label={tx('Other folder…')}
                        icon={<Folder className="size-4" />}
                        size="sm"
                        variant="ghost"
                        onClick={onNewSession}
                     />
                     <Button
                        label={tx('New session')}
                        icon={<Plus className="size-4" />}
                        size="sm"
                        onClick={onNewSession}
                     />
                  </div>
               </section>
            </div>
         </div>
      </div>
   );
}
