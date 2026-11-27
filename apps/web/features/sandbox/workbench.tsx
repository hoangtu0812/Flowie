'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, Folder, GitBranch, List, SquareTerminal, Zap } from 'lucide-react';
import { useMessages } from '@/features/shared/use-messages';
import type { SandboxSession } from '@/lib/sandbox';
import { cn } from '@/lib/utils';
import { messages } from './messages.vi';
import { shortDir } from './session-list';
import { UsageChip } from './usage-chip';

export type SidePanel = 'sessions' | 'files' | 'git' | 'pipelines';
/** A count, or the state of the latest pipeline run as a dot. VI: Một con số, hoặc chấm trạng thái pipeline. */
export type Badge = number | 'failure' | 'running';

const WIDTH_KEY = 'flowie.sandbox.panelWidth';
const OFF_KEY = 'flowie.sandbox.panelOff';
const MIN_WIDTH = 240;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 336;

export const clampWidth = (width: number) =>
   Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));

function stored(key: string): string | null {
   try {
      return localStorage.getItem(key);
   } catch {
      return null;
   }
}

function store(key: string, value: string | null) {
   try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
   } catch {
      // Storage can be blocked; the panel still works until the page reloads.
   }
}

/**
 * The side panel's width and collapsed state, as termi's (public/js/side-panel.mjs): dragged
 * between 240 and 720 px, reset by a double click, collapsed with Ctrl/Cmd+B, both remembered
 * in this browser.
 * VI: Độ rộng và trạng thái thu gọn của panel bên, như termi (public/js/side-panel.mjs): kéo trong
 * VI: khoảng 240–720 px, nhấp đúp để về mặc định, thu gọn bằng Ctrl/Cmd+B, nhớ trong trình duyệt.
 */
export function useSidePanel() {
   const [width, setWidth] = useState(DEFAULT_WIDTH);
   const [collapsed, setCollapsed] = useState(false);
   useEffect(() => {
      setWidth(clampWidth(Number(stored(WIDTH_KEY)) || DEFAULT_WIDTH));
      setCollapsed(stored(OFF_KEY) === '1');
   }, []);
   const toggle = useCallback((collapse?: boolean) => {
      setCollapsed((current) => {
         const next = collapse ?? !current;
         store(OFF_KEY, next ? '1' : null);
         return next;
      });
   }, []);
   const resize = useCallback((next: number | null) => {
      const value = next === null ? DEFAULT_WIDTH : clampWidth(next);
      setWidth(value);
      store(WIDTH_KEY, next === null ? null : String(value));
   }, []);
   return { width, collapsed, toggle, resize };
}

/** The drag handle on the panel's right edge. VI: Tay kéo ở mép phải của panel. */
export function ResizeHandle({
   panel,
   onResize,
}: {
   panel: React.RefObject<HTMLElement | null>;
   onResize: (width: number | null) => void;
}) {
   const tx = useMessages(messages);
   const dragging = useRef(false);
   return (
      <div
         role="separator"
         aria-orientation="vertical"
         aria-label={tx('Resize the side panel')}
         title="Ctrl/Cmd+B"
         className="hidden w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 lg:block"
         onDoubleClick={() => onResize(null)}
         onPointerDown={(event) => {
            if (event.button !== 0 || !panel.current) return;
            event.preventDefault();
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
         }}
         onPointerMove={(event) => {
            if (!dragging.current || !panel.current) return;
            onResize(event.clientX - panel.current.getBoundingClientRect().left);
         }}
         onPointerUp={() => {
            dragging.current = false;
         }}
      />
   );
}

const PANELS: { key: SidePanel; label: keyof typeof messages; icon: ReactNode }[] = [
   { key: 'sessions', label: 'Sessions', icon: <List className="size-5" /> },
   { key: 'files', label: 'Files', icon: <Folder className="size-5" /> },
   { key: 'git', label: 'Git', icon: <GitBranch className="size-5" /> },
   { key: 'pipelines', label: 'Pipelines', icon: <Zap className="size-5" /> },
];

/**
 * termi's activity bar: vertical on the left on desktop, where clicking the active view collapses
 * the side panel; a row on phones, with Terminal as one more view.
 * VI: Thanh hoạt động của termi: dọc bên trái trên desktop, bấm vào màn hình đang chọn để thu gọn
 * VI: panel bên; một hàng trên điện thoại, có thêm Terminal như một màn hình.
 */
export function ActivityBar({
   panel,
   collapsed,
   onPanel,
   terminalShown,
   onTerminal,
   badges,
}: {
   panel: SidePanel;
   collapsed: boolean;
   onPanel: (panel: SidePanel) => void;
   /** On phones: whether the terminal fills the screen instead of a panel. */
   terminalShown: boolean;
   onTerminal: () => void;
   badges: Partial<Record<SidePanel, Badge>>;
}) {
   const tx = useMessages(messages);
   const button = (active: boolean) =>
      cn(
         'relative flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground',
         active && 'text-foreground lg:bg-transparent'
      );
   return (
      <nav
         aria-label={tx('Sandbox views')}
         className="flex shrink-0 gap-1 border-b px-2 py-1 lg:flex-col lg:border-b-0 lg:border-r lg:px-1 lg:py-2"
      >
         {PANELS.map((item) => {
            const active = panel === item.key && !collapsed;
            return (
               <button
                  key={item.key}
                  type="button"
                  aria-label={tx(item.label)}
                  aria-pressed={active}
                  title={`${tx(item.label)} (Alt+${PANELS.indexOf(item) + 1})`}
                  onClick={() => onPanel(item.key)}
                  className={cn(
                     button(active),
                     // On phones the active view is the one shown instead of the terminal.
                     !terminalShown && panel === item.key && 'bg-accent text-foreground',
                     active &&
                        'lg:before:absolute lg:before:inset-y-1 lg:before:-left-1 lg:before:w-0.5 lg:before:bg-foreground'
                  )}
               >
                  {item.icon}
                  {typeof badges[item.key] === 'number' && badges[item.key] ? (
                     <span className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
                        {badges[item.key]}
                     </span>
                  ) : null}
                  {typeof badges[item.key] === 'string' ? (
                     <span
                        data-testid={`badge-${item.key}`}
                        data-state={badges[item.key]}
                        className={cn(
                           'absolute right-1 top-1 size-2 rounded-full',
                           badges[item.key] === 'failure' ? 'bg-red-500' : 'bg-sky-500'
                        )}
                     />
                  ) : null}
               </button>
            );
         })}
         <button
            type="button"
            aria-label={tx('Terminal')}
            aria-pressed={terminalShown}
            onClick={onTerminal}
            className={cn(button(terminalShown), terminalShown && 'bg-accent', 'lg:hidden')}
         >
            <SquareTerminal className="size-5" />
         </button>
      </nav>
   );
}

/**
 * termi's desktop status bar: the sandbox, the session's folder, its branch and uncommitted files
 * (both open Git), and the usage chip.
 * VI: Status bar desktop của termi: sandbox, thư mục của phiên, nhánh và số file chưa commit (bấm
 * VI: mở Git), và chip usage.
 */
export function StatusBar({
   session,
   home,
   onGit,
   ci,
   onPipelines,
}: {
   session: SandboxSession | undefined;
   home: string;
   onGit: () => void;
   /** The latest pipeline run on the session's branch, as termi's status bar shows it. */
   ci: 'failure' | 'running' | 'ok' | null;
   onPipelines: () => void;
}) {
   const tx = useMessages(messages);
   return (
      <footer
         aria-label={tx('Status bar')}
         className="hidden h-7 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground lg:flex"
      >
         <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            {tx('Running')}
         </span>
         {session && (
            <>
               <span className="truncate font-mono">{shortDir(session.dir, home)}</span>
               {session.branch && (
                  <button
                     type="button"
                     onClick={onGit}
                     className="flex items-center gap-1 hover:text-foreground"
                  >
                     <GitBranch className="size-3.5" /> {session.branch}
                  </button>
               )}
               {session.changes ? (
                  <button
                     type="button"
                     onClick={onGit}
                     className="flex items-center gap-1 hover:text-foreground"
                  >
                     <FileText className="size-3.5" />
                     {tx('{count} uncommitted', { count: session.changes })}
                  </button>
               ) : null}
            </>
         )}
         {ci && (
            <button
               type="button"
               onClick={onPipelines}
               className={cn(
                  'flex items-center gap-1 hover:text-foreground',
                  ci === 'failure' && 'text-red-600',
                  ci === 'running' && 'text-sky-600'
               )}
            >
               <Zap className="size-3.5" />
               {ci === 'failure'
                  ? tx('Pipeline failed')
                  : ci === 'running'
                    ? tx('Pipeline running')
                    : tx('Pipeline OK')}
            </button>
         )}
         <span className="ml-auto">
            <UsageChip />
         </span>
      </footer>
   );
}
