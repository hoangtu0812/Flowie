'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ExternalLink, Play, Plus, Square } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useMessages } from '@/features/shared/use-messages';
import { ApiRequestError } from '@/lib/http';
import {
   closeSandboxSession,
   loadSandbox,
   loadSandboxDirs,
   loadSandboxSessions,
   renameSandboxSession,
   sandboxSessionUrl,
   startSandbox,
   stopSandbox,
   type SandboxSession,
   type SandboxState,
} from '@/lib/sandbox';
import { NewSessionDialog } from './new-session-dialog';
import { Composer, KeyRow } from './session-controls';
import { FilesPanel } from './files-panel';
import { GitPanel } from './git-panel';
import { UsageChip } from './usage-chip';
import { cn } from '@/lib/utils';
import { SessionList } from './session-list';
import { messages } from './messages.vi';

// Below the 15-minute access cookie, so the terminal's requests always find a fresh one.
// VI: Ngắn hơn 15 phút của cookie truy cập, để request của terminal luôn gặp cookie còn hạn.
const KEEP_ALIVE_MS = 60_000;
// Agent states change by the second; the list refreshes this often while the sandbox runs.
// VI: Trạng thái agent đổi theo từng giây; danh sách làm mới theo nhịp này khi sandbox chạy.
const SESSIONS_MS = 5_000;
const NAME = /^[A-Za-z0-9_-]{1,40}$/;
const FONT_KEY = 'flowie.sandbox.fontSize';
const FONT_DEFAULT = 14;

function savedFont(): number {
   try {
      return Number(localStorage.getItem(FONT_KEY)) || FONT_DEFAULT;
   } catch {
      return FONT_DEFAULT;
   }
}

type View =
   | { kind: 'loading' }
   | { kind: 'forbidden' }
   | { kind: 'error'; message: string }
   | { kind: 'ready'; state: SandboxState };

export function SandboxPage() {
   const tx = useMessages(messages);
   const [view, setView] = useState<View>({ kind: 'loading' });
   const [busy, setBusy] = useState(false);
   const [sessions, setSessions] = useState<SandboxSession[]>([]);
   const [home, setHome] = useState('');
   const [creating, setCreating] = useState(false);
   const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
   // Starts on the session "Open with Claude/Codex" on an issue asked for, if any.
   // VI: Bắt đầu ở phiên mà "Mở bằng Claude/Codex" trên task yêu cầu, nếu có.
   const [selected, setSelected] = useState<string | null>(useSearchParams().get('session'));
   const current = selected ?? sessions[0]?.name ?? 'main';
   const currentSession = sessions.find((session) => session.name === current);
   const currentAgent = currentSession?.agent ?? null;
   const [pane, setPane] = useState<'terminal' | 'files' | 'git'>('terminal');
   const [draft, setDraft] = useState('');
   // A per-browser convenience, so it lives in localStorage.
   // VI: Tiện ích theo từng trình duyệt nên lưu trong localStorage.
   const [fontSize, setFontSize] = useState(FONT_DEFAULT);
   useEffect(() => setFontSize(savedFont()), []);
   const changeFont = (delta: number) => {
      const next = Math.min(28, Math.max(9, fontSize + delta));
      setFontSize(next);
      try {
         localStorage.setItem(FONT_KEY, String(next));
      } catch {
         // Storage can be blocked; the size still applies until the page reloads.
      }
   };

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
      // Each poll goes through authenticatedFetch, which renews the session cookie the terminal relies on.
      // VI: Mỗi lần hỏi đi qua authenticatedFetch, nên cookie phiên mà terminal cần được gia hạn.
      const timer = setInterval(() => {
         void loadSandbox().then(
            (state) =>
               setView((shown) => (shown.kind === 'ready' ? { kind: 'ready', state } : shown)),
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

   const refreshSessions = useCallback(
      () => loadSandboxSessions().then(setSessions, () => undefined),
      []
   );
   useEffect(() => {
      if (!running) return;
      void refreshSessions();
      loadSandboxDirs().then(
         (dirs) => setHome(dirs.home),
         () => undefined
      );
      const timer = setInterval(() => void refreshSessions(), SESSIONS_MS);
      return () => clearInterval(timer);
   }, [running, refreshSessions]);

   const closeSession = async (name: string) => {
      try {
         await closeSandboxSession(name);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : String(error));
      }
      if (name === current) setSelected(null);
      void refreshSessions();
   };

   const rename = async () => {
      if (!renaming) return;
      try {
         const name = await renameSandboxSession(renaming.from, renaming.to);
         if (renaming.from === current) setSelected(name);
         setRenaming(null);
         void refreshSessions();
      } catch (error) {
         toast.error(error instanceof Error ? error.message : String(error));
      }
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
                     <UsageChip />
                     <Button
                        label={tx('Open in a new tab')}
                        icon={<ExternalLink className="size-4" />}
                        isIconOnly
                        href={sandboxSessionUrl(current, fontSize)}
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
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
               <aside className="flex max-h-56 shrink-0 flex-col border-b lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
                  <div className="px-3 pt-2">
                     <Button
                        label={tx('New session')}
                        icon={<Plus className="size-4" />}
                        size="sm"
                        variant="ghost"
                        onClick={() => setCreating(true)}
                     />
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                     <SessionList
                        sessions={sessions}
                        current={current}
                        home={home}
                        onSelect={setSelected}
                        onRename={(name) => setRenaming({ from: name, to: name })}
                        onClose={(name) => void closeSession(name)}
                     />
                  </div>
               </aside>
               <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div
                     role="tablist"
                     aria-label={tx('Sandbox views')}
                     className="flex shrink-0 gap-1 border-b px-2 py-1"
                  >
                     {(
                        [
                           ['terminal', 'Terminal'],
                           ['files', 'Files'],
                           ['git', 'Git'],
                        ] as const
                     ).map(([key, label]) => (
                        <button
                           key={key}
                           type="button"
                           role="tab"
                           aria-selected={pane === key}
                           onClick={() => setPane(key)}
                           className={cn(
                              'rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent',
                              pane === key && 'bg-accent text-foreground'
                           )}
                        >
                           {tx(label)}
                        </button>
                     ))}
                  </div>
                  {pane === 'files' && (
                     <FilesPanel
                        start={currentSession?.dir || home}
                        home={home}
                        onInsert={(path) => {
                           setDraft((text) => (text ? `${text} ${path}` : path));
                           setPane('terminal');
                        }}
                     />
                  )}
                  {pane === 'git' && <GitPanel dir={currentSession?.dir || home} />}
                  <iframe
                     key={`${current}-${fontSize}`}
                     title={tx('Sandbox terminal')}
                     src={sandboxSessionUrl(current, fontSize)}
                     allow="clipboard-read; clipboard-write"
                     className={cn(
                        'min-h-0 w-full flex-1 border-0',
                        pane !== 'terminal' && 'hidden'
                     )}
                  />
                  {pane === 'terminal' && <KeyRow session={current} onFont={changeFont} />}
                  <Composer
                     session={current}
                     agent={currentAgent}
                     text={draft}
                     setText={setDraft}
                  />
               </div>
            </div>
         )}
         {creating && (
            <NewSessionDialog
               taken={sessions.map((session) => session.name)}
               onCancel={() => setCreating(false)}
               onCreated={(name) => {
                  setCreating(false);
                  setSelected(name);
                  void refreshSessions();
               }}
            />
         )}
         {renaming && (
            <Dialog
               isOpen
               aria-label={tx('Rename session')}
               purpose="form"
               width={420}
               onOpenChange={(open) => !open && setRenaming(null)}
            >
               <Layout
                  height="auto"
                  padding={4}
                  header={
                     <DialogHeader
                        title={tx('Rename session')}
                        onOpenChange={() => setRenaming(null)}
                     />
                  }
                  footer={
                     <LayoutFooter>
                        <HStack gap={2} hAlign="end">
                           <Button
                              label={tx('Cancel')}
                              variant="ghost"
                              onClick={() => setRenaming(null)}
                           />
                           <Button
                              label={tx('Rename')}
                              variant="primary"
                              isDisabled={!NAME.test(renaming.to) || renaming.to === renaming.from}
                              onClick={() => void rename()}
                           />
                        </HStack>
                     </LayoutFooter>
                  }
               >
                  <LayoutContent>
                     <TextInput
                        label={tx('Session name')}
                        value={renaming.to}
                        width="100%"
                        onChange={(to) => setRenaming({ ...renaming, to })}
                     />
                  </LayoutContent>
               </Layout>
            </Dialog>
         )}
      </VStack>
   );
}
