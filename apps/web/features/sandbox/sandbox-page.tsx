'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ExternalLink, Play, Plus, Square } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
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
   ciBadge,
   createSandboxSession,
   loadSandboxCi,
   type SandboxAgent,
   type SandboxFile,
   type SandboxSession,
   type SandboxState,
} from '@/lib/sandbox';
import { NewSessionDialog, sessionName } from './new-session-dialog';
import { Composer, KeyRow } from './session-controls';
import { FilesPanel, FileViewer } from './files-panel';
import { HomePage } from './home-page';
import { ConversationViewer, SessionChat } from './chat-view';
import { ActivityBar, ResizeHandle, StatusBar, useSidePanel, type SidePanel } from './workbench';
import { GitPanel } from './git-panel';
import { PipelinesPanel } from './pipelines-panel';
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
   const current = selected;
   const currentSession = sessions.find((session) => session.name === current);
   const currentAgent = currentSession?.agent ?? null;
   const [panel, setPanel] = useState<SidePanel>('sessions');
   const side = useSidePanel();
   const sideRef = useRef<HTMLElement>(null);
   const isMobile = useIsMobile();
   // On phones one view fills the screen: a panel, or the session's terminal.
   // VI: Trên điện thoại một màn hình chiếm toàn bộ: một panel, hoặc terminal của phiên.
   const [terminalShown, setTerminalShown] = useState(Boolean(selected));
   const [openFile, setOpenFile] = useState<SandboxFile | null>(null);
   // Chat or Terminal, remembered per session as termi does. VI: Chat hay Terminal, nhớ theo phiên như termi.
   const [mainTabs, setMainTabs] = useState<Record<string, 'chat' | 'terminal'>>({});
   const mainTab = (current && currentAgent && mainTabs[current]) || 'terminal';
   const [viewing, setViewing] = useState<{
      agent: SandboxAgent;
      id: string;
      title: string;
      dir: string;
   } | null>(null);
   const [draft, setDraft] = useState('');
   // termi checks the branch's latest pipeline run every minute for the badge and status bar.
   // VI: termi kiểm tra lần chạy pipeline mới nhất của nhánh mỗi phút cho badge và status bar.
   const [ciState, setCiState] = useState<'failure' | 'running' | 'ok' | null>(null);

   const openSession = (name: string | null) => {
      setSelected(name);
      setOpenFile(null);
      setViewing(null);
      setTerminalShown(Boolean(name));
   };

   const choosePanel = useCallback(
      (next: SidePanel) => {
         if (isMobile) {
            setPanel(next);
            setTerminalShown(false);
            return;
         }
         if (next === panel && !side.collapsed) side.toggle(true);
         else {
            setPanel(next);
            side.toggle(false);
         }
      },
      [isMobile, panel, side]
   );

   // termi's shortcuts: Ctrl/Cmd+B collapses the side panel, Alt+1/2/3 open Sessions, Files, Git.
   // VI: Phím tắt của termi: Ctrl/Cmd+B thu gọn panel bên, Alt+1/2/3 mở Phiên, File, Git.
   const onKey = useCallback(
      (event: KeyboardEvent) => {
         if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'b') {
            event.preventDefault();
            side.toggle();
         } else if (event.altKey && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)) {
            event.preventDefault();
            choosePanel(
               (['sessions', 'files', 'git', 'pipelines'] as const)[
                  Number(event.code.slice(-1)) - 1
               ]
            );
         }
      },
      [choosePanel, side]
   );
   useEffect(() => {
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
   }, [onKey]);
   // A per-browser convenience, so it lives in localStorage.
   // VI: Tiện ích theo từng trình duyệt nên lưu trong localStorage.
   const [fontSize, setFontSize] = useState(FONT_DEFAULT);
   useEffect(() => {
      setFontSize(savedFont());
   }, []);
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

   const ciDir = currentSession?.branch ? currentSession.dir : '';
   useEffect(() => {
      setCiState(null);
      if (!running || !ciDir) return;
      const check = () =>
         loadSandboxCi(ciDir).then(
            (found) => setCiState(ciBadge(found)),
            () => setCiState(null)
         );
      void check();
      const timer = setInterval(() => void check(), 60_000);
      return () => clearInterval(timer);
   }, [running, ciDir]);

   const closeSession = async (name: string) => {
      try {
         await closeSandboxSession(name);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : String(error));
      }
      if (name === current) openSession(null);
      void refreshSessions();
   };

   const rename = async () => {
      if (!renaming) return;
      try {
         const name = await renameSandboxSession(renaming.from, renaming.to);
         if (renaming.from === current) openSession(name);
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
                     {isMobile && <UsageChip />}
                     {current && (
                        <Button
                           label={tx('Open in a new tab')}
                           icon={<ExternalLink className="size-4" />}
                           isIconOnly
                           href={sandboxSessionUrl(current, fontSize)}
                           target="_blank"
                           size="sm"
                           variant="ghost"
                        />
                     )}
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
               <ActivityBar
                  panel={panel}
                  collapsed={!isMobile && side.collapsed}
                  onPanel={choosePanel}
                  terminalShown={terminalShown}
                  onTerminal={() => setTerminalShown(true)}
                  badges={{
                     sessions: sessions.filter((session) => session.state === 'waiting').length,
                     git: currentSession?.changes ?? 0,
                     ...(ciState === 'failure' || ciState === 'running'
                        ? { pipelines: ciState }
                        : {}),
                  }}
               />
               <aside
                  ref={sideRef}
                  aria-label={tx('Side panel')}
                  style={isMobile ? undefined : { width: side.width }}
                  className={cn(
                     'min-h-0 min-w-0 flex-1 flex-col lg:flex-none lg:border-r',
                     isMobile
                        ? terminalShown
                           ? 'hidden'
                           : 'flex'
                        : side.collapsed
                          ? 'hidden'
                          : 'flex'
                  )}
               >
                  {panel === 'sessions' && (
                     <>
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
                              current={current ?? ''}
                              home={home}
                              onSelect={openSession}
                              onRename={(name) => setRenaming({ from: name, to: name })}
                              onClose={(name) => void closeSession(name)}
                           />
                        </div>
                     </>
                  )}
                  {panel === 'files' && (
                     <FilesPanel
                        start={currentSession?.dir || home}
                        home={home}
                        onOpen={(file) => {
                           setOpenFile(file);
                           setTerminalShown(true);
                        }}
                     />
                  )}
                  {panel === 'git' && <GitPanel dir={currentSession?.dir || home} />}
                  {panel === 'pipelines' && <PipelinesPanel dir={currentSession?.dir || home} />}
               </aside>
               {!side.collapsed && <ResizeHandle panel={sideRef} onResize={side.resize} />}
               <main
                  aria-label={tx('Session')}
                  className={cn(
                     'min-h-0 min-w-0 flex-1 flex-col',
                     isMobile && !terminalShown ? 'hidden' : 'flex'
                  )}
               >
                  {openFile && (
                     <FileViewer
                        file={openFile}
                        home={home}
                        onClose={() => setOpenFile(null)}
                        onInsert={(path) => {
                           setDraft((text) => (text ? `${text} ${path}` : path));
                           setOpenFile(null);
                        }}
                     />
                  )}
                  {viewing && !openFile && (
                     <ConversationViewer
                        agent={viewing.agent}
                        id={viewing.id}
                        title={viewing.title}
                        onClose={() => setViewing(null)}
                        onOpenFile={setOpenFile}
                        onResume={() =>
                           void createSandboxSession({
                              name: sessionName(
                                 viewing.dir,
                                 viewing.agent,
                                 sessions.map((session) => session.name)
                              ),
                              dir: viewing.dir,
                              agent: viewing.agent,
                              resume: viewing.id,
                           }).then(
                              (name) => {
                                 openSession(name);
                                 void refreshSessions();
                              },
                              (error: Error) => toast.error(error.message)
                           )
                        }
                     />
                  )}
                  {!current && !openFile && !viewing && (
                     <HomePage
                        sessions={sessions}
                        home={home}
                        onOpen={(name) => {
                           openSession(name);
                           void refreshSessions();
                        }}
                        onNewSession={() => setCreating(true)}
                        onView={setViewing}
                     />
                  )}
                  {current && currentAgent && !openFile && (
                     <div
                        role="tablist"
                        aria-label={tx('Session views')}
                        className="flex shrink-0 gap-1 border-b px-2 py-1"
                     >
                        {(['chat', 'terminal'] as const).map((tab) => (
                           <button
                              key={tab}
                              type="button"
                              role="tab"
                              aria-selected={mainTab === tab}
                              onClick={() => setMainTabs((tabs) => ({ ...tabs, [current]: tab }))}
                              className={cn(
                                 'rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent',
                                 mainTab === tab && 'bg-accent text-foreground'
                              )}
                           >
                              {tx(tab === 'chat' ? 'Chat' : 'Terminal')}
                           </button>
                        ))}
                     </div>
                  )}
                  {current && mainTab === 'chat' && !openFile && (
                     <SessionChat session={current} onOpenFile={setOpenFile} />
                  )}
                  {current && (
                     <>
                        <iframe
                           key={`${current}-${fontSize}`}
                           title={tx('Sandbox terminal')}
                           src={sandboxSessionUrl(current, fontSize)}
                           allow="clipboard-read; clipboard-write"
                           className={cn(
                              'min-h-0 w-full flex-1 border-0',
                              (openFile || mainTab === 'chat') && 'hidden'
                           )}
                           onLoad={(event) => {
                              // The terminal is same-origin, so the shortcuts work while it has focus.
                              // VI: Terminal cùng origin, nên phím tắt vẫn chạy khi terminal đang focus.
                              try {
                                 event.currentTarget.contentWindow?.document.addEventListener(
                                    'keydown',
                                    onKey,
                                    true
                                 );
                              } catch {
                                 // A cross-origin terminal (local development) keeps its own keys.
                              }
                           }}
                        />
                        {mainTab === 'terminal' && <KeyRow session={current} onFont={changeFont} />}
                        <Composer
                           session={current}
                           agent={currentAgent}
                           dir={currentSession?.dir ?? ''}
                           text={draft}
                           setText={setDraft}
                        />
                     </>
                  )}
               </main>
            </div>
         )}
         {running && (
            <StatusBar
               session={currentSession}
               home={home}
               onGit={() => choosePanel('git')}
               ci={ciState}
               onPipelines={() => choosePanel('pipelines')}
            />
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
