'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { ExternalLink, Play, Plus, Square, X } from 'lucide-react';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useMessages } from '@/features/shared/use-messages';
import { ApiRequestError } from '@/lib/http';
import { cn } from '@/lib/utils';
import {
   closeSandboxSession,
   loadSandbox,
   loadSandboxSessions,
   sandboxSessionUrl,
   startSandbox,
   stopSandbox,
   type SandboxState,
} from '@/lib/sandbox';
import { messages } from './messages.vi';

// Below the 15-minute access cookie, so the terminal's requests always find a fresh one.
// VI: Ngắn hơn 15 phút của cookie truy cập, để request của terminal luôn gặp cookie còn hạn.
const KEEP_ALIVE_MS = 60_000;

type View =
   | { kind: 'loading' }
   | { kind: 'forbidden' }
   | { kind: 'error'; message: string }
   | { kind: 'ready'; state: SandboxState };

export function SandboxPage() {
   const tx = useMessages(messages);
   const [view, setView] = useState<View>({ kind: 'loading' });
   const [busy, setBusy] = useState(false);
   const [sessions, setSessions] = useState<string[]>([]);
   // Starts on the session "Open with Claude/Codex" on an issue asked for, if any.
   // VI: Bắt đầu ở phiên mà "Mở bằng Claude/Codex" trên task yêu cầu, nếu có.
   const [selected, setSelected] = useState<string | null>(useSearchParams().get('session'));
   const current = selected ?? sessions[0] ?? 'main';
   const tabs = sessions.includes(current) ? sessions : [current, ...sessions];
   const uiUrl = sandboxSessionUrl(current);

   const run = useCallback(async (action: () => Promise<SandboxState>) => {
      try {
         setView({ kind: 'ready', state: await action() });
      } catch (error) {
         setView(
            error instanceof ApiRequestError && error.status === 403
               ? { kind: 'forbidden' }
               : { kind: 'error', message: error instanceof Error ? error.message : String(error) }
         );
      }
   }, []);

   useEffect(() => {
      void run(loadSandbox);
      // Each poll goes through authenticatedFetch, which renews the session cookie termi relies on.
      // VI: Mỗi lần hỏi đi qua authenticatedFetch, nên cookie phiên mà termi cần được gia hạn.
      const timer = setInterval(() => {
         void loadSandbox().then(
            (state) =>
               setView((current) =>
                  current.kind === 'ready' ? { kind: 'ready', state } : current
               ),
            () => undefined
         );
      }, KEEP_ALIVE_MS);
      return () => clearInterval(timer);
   }, [run]);

   const act = async (action: () => Promise<SandboxState>) => {
      setBusy(true);
      await run(action);
      setBusy(false);
   };

   const running = view.kind === 'ready' && view.state === 'running';

   // The session list follows the sandbox state, so it refreshes with every keep-alive poll.
   // VI: Danh sách phiên đi theo trạng thái sandbox, nên làm mới theo mỗi lần hỏi giữ phiên.
   const refreshSessions = useCallback(
      () => loadSandboxSessions().then(setSessions, () => undefined),
      []
   );
   useEffect(() => {
      if (running) void refreshSessions();
   }, [running, view, refreshSessions]);

   const newTerminal = () => setSelected(`term-${Date.now().toString(36).slice(-5)}`);

   const closeCurrent = async () => {
      try {
         await closeSandboxSession(current);
      } catch {
         // A session that was never attached does not exist yet; dropping the tab is enough.
         // VI: Phiên chưa từng gắn thì chưa tồn tại; bỏ tab là đủ.
      }
      setSessions((list) => list.filter((name) => name !== current));
      setSelected(null);
      void refreshSessions();
   };

   return (
      <VStack className="h-full min-h-0 w-full">
         <HStack gap={2} className="h-10 shrink-0 items-center border-b px-4">
            <SidebarTrigger className="inline-flex lg:hidden" />
            <Text type="label">{tx('Sandbox')}</Text>
            {view.kind === 'ready' && (
               <Text type="supporting" data-testid="sandbox-state">
                  {running ? tx('Running') : tx('Stopped')}
               </Text>
            )}
            <HStack gap={2} className="ml-auto items-center">
               {running && (
                  <>
                     <Button
                        label={tx('Open in a new tab')}
                        icon={<ExternalLink className="size-4" />}
                        href={uiUrl}
                        target="_blank"
                        size="sm"
                        variant="ghost"
                     />
                     <Button
                        label={tx('Stop')}
                        icon={<Square className="size-4" />}
                        size="sm"
                        isLoading={busy}
                        onClick={() => act(stopSandbox)}
                     />
                  </>
               )}
            </HStack>
         </HStack>
         {view.kind === 'loading' && <LoadingState />}
         {view.kind === 'forbidden' && (
            <VStack padding={6}>
               <Text type="supporting">
                  {tx('Sandbox is not enabled for your account. Ask an administrator.')}
               </Text>
            </VStack>
         )}
         {view.kind === 'error' && (
            <QueryState message={view.message} onRetry={() => run(loadSandbox)} />
         )}
         {view.kind === 'ready' && !running && (
            <VStack gap={4} padding={6} className="max-w-2xl">
               <Text type="supporting">
                  {tx(
                     'Your own container with Claude Code, Codex, git and gh. Sign in to your own accounts in its terminal; they stay in the sandbox between sessions.'
                  )}
               </Text>
               <Text type="supporting">
                  {tx(
                     'Sign-ins are stored on the Flowie server, where its administrators can read them.'
                  )}
               </Text>
               <div>
                  <Button
                     label={tx('Start sandbox')}
                     icon={<Play className="size-4" />}
                     isLoading={busy}
                     onClick={() => act(startSandbox)}
                  />
               </div>
            </VStack>
         )}
         {running && (
            <HStack
               gap={1}
               className="h-9 shrink-0 items-center overflow-x-auto border-b px-4"
               role="tablist"
               aria-label={tx('Terminal sessions')}
            >
               {tabs.map((name) => (
                  <button
                     key={name}
                     type="button"
                     role="tab"
                     aria-selected={name === current}
                     onClick={() => setSelected(name)}
                     className={cn(
                        'shrink-0 rounded-md px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-accent',
                        name === current && 'bg-accent text-foreground'
                     )}
                  >
                     {name}
                  </button>
               ))}
               <Button
                  label={tx('New terminal')}
                  icon={<Plus className="size-4" />}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onClick={newTerminal}
               />
               <Button
                  label={tx('Close this session')}
                  icon={<X className="size-4" />}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onClick={() => void closeCurrent()}
               />
            </HStack>
         )}
         {running && (
            <iframe
               key={current}
               title={tx('Sandbox terminal')}
               src={uiUrl}
               allow="clipboard-read; clipboard-write"
               className="min-h-0 w-full flex-1 border-0"
            />
         )}
      </VStack>
   );
}
