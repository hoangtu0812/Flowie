'use client';

import { MoreHorizontal, PenLine, X } from 'lucide-react';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMessages } from '@/features/shared/use-messages';
import type { SandboxSession } from '@/lib/sandbox';
import { cn } from '@/lib/utils';
import { messages } from './messages.vi';

const STATE_STYLE: Record<SandboxSession['state'], string> = {
   working: 'bg-amber-500 animate-pulse',
   waiting: 'bg-red-500',
   idle: 'bg-emerald-500',
   shell: 'bg-muted-foreground/40',
};

const STATE_LABEL = {
   working: 'Working',
   waiting: 'Waiting for you',
   idle: 'Idle',
   shell: 'Shell',
} as const;

const AGENT_LABEL = { claude: 'Claude', codex: 'Codex' } as const;

/** `/home/node/work/x` as `~/work/x`. VI: `/home/node/work/x` thành `~/work/x`. */
export function shortDir(dir: string, home: string): string {
   return home && (dir === home || dir.startsWith(`${home}/`)) ? `~${dir.slice(home.length)}` : dir;
}

/**
 * The sandbox's sessions, sessions that need the person first (waiting, then working), each
 * with its agent, state, folder and the last lines of its screen, as in termi's session list.
 * VI: Các phiên của sandbox, phiên cần người dùng lên trước (đang chờ, rồi đang làm), mỗi phiên
 * VI: kèm agent, trạng thái, thư mục và vài dòng cuối màn hình, như danh sách phiên của termi.
 */
export function SessionList({
   sessions,
   current,
   home,
   onSelect,
   onRename,
   onClose,
}: {
   sessions: SandboxSession[];
   current: string;
   home: string;
   onSelect: (name: string) => void;
   onRename: (name: string) => void;
   onClose: (name: string) => void;
}) {
   const tx = useMessages(messages);
   const order = { waiting: 0, working: 1, idle: 2, shell: 3 };
   const sorted = [...sessions].sort((a, b) => order[a.state] - order[b.state]);

   return (
      <ul aria-label={tx('Terminal sessions')} className="flex flex-col gap-1 p-2">
         {sorted.map((session) => (
            <li
               key={session.name}
               className={cn(
                  'group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent',
                  session.name === current && 'bg-accent'
               )}
            >
               <button
                  type="button"
                  aria-current={session.name === current}
                  onClick={() => onSelect(session.name)}
                  className="min-w-0 flex-1 text-left"
               >
                  <span className="flex items-center gap-1.5 text-sm">
                     <span
                        aria-hidden
                        className={cn('size-2 shrink-0 rounded-full', STATE_STYLE[session.state])}
                     />
                     <span className="truncate font-medium">{session.name}</span>
                     {session.agent && (
                        <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                           {AGENT_LABEL[session.agent]}
                        </span>
                     )}
                  </span>
                  <span className="sr-only">{tx(STATE_LABEL[session.state])}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                     {shortDir(session.dir, home)}
                  </span>
                  {session.preview && (
                     <span className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                        {session.preview}
                     </span>
                  )}
               </button>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <button
                        type="button"
                        aria-label={tx('Actions for {name}', { name: session.name })}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                     >
                        <MoreHorizontal className="size-4" />
                     </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                     <DropdownMenuItem onClick={() => onRename(session.name)}>
                        <PenLine className="size-4" /> {tx('Rename')}
                     </DropdownMenuItem>
                     <DropdownMenuItem variant="destructive" onClick={() => onClose(session.name)}>
                        <X className="size-4" /> {tx('Close session')}
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            </li>
         ))}
      </ul>
   );
}
