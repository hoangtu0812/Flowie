'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FilePen, FilePlus, History, X } from 'lucide-react';
import { toast } from 'sonner';
import { Text } from '@astryxdesign/core/Text';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { useMessages } from '@/features/shared/use-messages';
import {
   loadSandboxChat,
   loadSandboxConversation,
   loadSandboxDiff,
   loadSandboxFile,
   type SandboxAgent,
   type SandboxChat,
   type SandboxChatStep,
   type SandboxDiff,
   type SandboxFile,
} from '@/lib/sandbox';
import { cn } from '@/lib/utils';
import { DiffDialog } from './git-panel';
import { messages } from './messages.vi';

const CHAT_MS = 3_000;
const AGENT_NAMES = { claude: 'Claude Code', codex: 'Codex' } as const;

/** Files a group of steps edited or created; a file created once stays "created".
 *  VI: Các file mà một nhóm bước đã sửa hoặc tạo; file đã tạo một lần vẫn là "tạo". */
export function changedFiles(
   steps: SandboxChatStep[]
): { file: string; change: 'edit' | 'create' }[] {
   const byFile = new Map<string, 'edit' | 'create'>();
   for (const step of steps) {
      const changes =
         step.file && step.change ? [{ file: step.file, change: step.change }] : (step.files ?? []);
      for (const { file, change } of changes) {
         byFile.set(file, byFile.get(file) === 'create' ? 'create' : change);
      }
   }
   return [...byFile].map(([file, change]) => ({ file, change }));
}

function Steps({
   steps,
   onFile,
}: {
   steps: SandboxChatStep[];
   onFile: (file: string, change: 'edit' | 'create') => void;
}) {
   const tx = useMessages(messages);
   const [open, setOpen] = useState(false);
   const files = changedFiles(steps);
   return (
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
         <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="flex w-full items-center gap-1 text-left text-xs text-muted-foreground"
         >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {tx('{count} steps', { count: steps.length })}
            {!open && steps.length > 0 && (
               <span className="ml-1 truncate">
                  · {tx(steps[steps.length - 1].verb as keyof typeof messages)}{' '}
                  {steps[steps.length - 1].detail}
               </span>
            )}
         </button>
         {open && (
            <ol className="mt-1 space-y-0.5 text-xs">
               {steps.map((step, index) => (
                  <li key={index} className="flex gap-2">
                     <span className="shrink-0 font-medium">
                        {tx(step.verb as keyof typeof messages)}
                     </span>
                     <span className="min-w-0 truncate font-mono text-muted-foreground">
                        {step.detail}
                     </span>
                  </li>
               ))}
            </ol>
         )}
         {files.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
               <span className="text-muted-foreground">{tx('See changes:')}</span>
               {files.map(({ file, change }) => (
                  <button
                     key={file}
                     type="button"
                     title={file}
                     onClick={() => onFile(file, change)}
                     className={cn(
                        'flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-accent',
                        change === 'create' ? 'text-emerald-700' : 'text-amber-700'
                     )}
                  >
                     {change === 'create' ? (
                        <FilePlus className="size-3" />
                     ) : (
                        <FilePen className="size-3" />
                     )}
                     {file.split('/').pop()}
                  </button>
               ))}
            </div>
         )}
      </div>
   );
}

/**
 * termi's chat: what you asked, what the agent answered (rendered as Markdown) and, between them,
 * its tool calls folded into one "N steps" row with chips for the files it edited (opening their
 * diff) or created (opening the file).
 * VI: Chat của termi: điều bạn hỏi, câu trả lời của agent (hiển thị Markdown) và ở giữa là các lần
 * VI: gọi tool gộp thành một dòng "N bước", kèm chip cho file đã sửa (mở diff) hoặc đã tạo (mở file).
 */
export function ChatView({
   chat,
   onOpenFile,
   empty,
}: {
   chat: SandboxChat;
   onOpenFile: (file: SandboxFile) => void;
   empty?: string;
}) {
   const tx = useMessages(messages);
   const [diff, setDiff] = useState<{ title: string; diff: SandboxDiff } | null>(null);
   const end = useRef<HTMLDivElement>(null);
   const count = chat.items.length;
   // A block body on purpose: Chromium's scrollIntoView now returns a promise, which React
   // would take for this effect's cleanup and call on the next run.
   // VI: Cố ý dùng thân khối: scrollIntoView của Chromium giờ trả về promise, React sẽ tưởng đó là
   // VI: hàm dọn dẹp của effect và gọi nó ở lần chạy sau.
   useEffect(() => {
      end.current?.scrollIntoView({ block: 'end' });
   }, [count]);

   const openFile = (file: string, change: 'edit' | 'create') => {
      const failed = (error: Error) => toast.error(error.message);
      if (change === 'create' || !chat.dir) {
         void loadSandboxFile(file).then(onOpenFile, failed);
         return;
      }
      void loadSandboxDiff(chat.dir, { file }).then(
         (found) => setDiff({ title: file.split('/').pop() ?? file, diff: found }),
         failed
      );
   };

   return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="chat-view">
         {count === 0 && (
            <Text type="supporting">{empty ?? tx('No conversation yet in this session.')}</Text>
         )}
         <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {chat.items.map((item, index) =>
               item.kind === 'tools' ? (
                  <Steps key={index} steps={item.steps} onFile={openFile} />
               ) : item.who === 'user' ? (
                  <div
                     key={index}
                     className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-sm"
                  >
                     {item.text}
                  </div>
               ) : (
                  <div key={index} className="max-w-full text-sm">
                     <div className="mb-1 text-xs text-muted-foreground">
                        {chat.agent ? AGENT_NAMES[chat.agent] : tx('Agent')}
                     </div>
                     <MarkdownPreview content={item.text} appearance="chat" />
                  </div>
               )
            )}
            {chat.state === 'working' && (
               <div className="text-xs text-muted-foreground">{tx('Working…')}</div>
            )}
            <div ref={end} />
         </div>
         {diff && <DiffDialog title={diff.title} diff={diff.diff} onClose={() => setDiff(null)} />}
      </div>
   );
}

/** The open session's chat, refreshed every few seconds while it is shown.
 *  VI: Chat của phiên đang mở, làm mới vài giây một lần khi đang hiển thị. */
export function SessionChat({
   session,
   onOpenFile,
}: {
   session: string;
   onOpenFile: (file: SandboxFile) => void;
}) {
   const [chat, setChat] = useState<SandboxChat | null>(null);
   const load = useCallback(
      () => loadSandboxChat(session).then(setChat, () => undefined),
      [session]
   );
   useEffect(() => {
      setChat(null);
      void load();
      const timer = setInterval(() => void load(), CHAT_MS);
      return () => clearInterval(timer);
   }, [load]);
   return chat ? <ChatView chat={chat} onOpenFile={onOpenFile} /> : null;
}

/**
 * A past conversation, read without reopening it (termi's conversation viewer), with a button that
 * resumes it in a new session.
 * VI: Một hội thoại cũ, đọc mà không mở lại (trình xem hội thoại của termi), kèm nút mở lại nó trong
 * VI: một phiên mới.
 */
export function ConversationViewer({
   agent,
   id,
   title,
   onClose,
   onResume,
   onOpenFile,
}: {
   agent: SandboxAgent;
   id: string;
   title: string;
   onClose: () => void;
   onResume: () => void;
   onOpenFile: (file: SandboxFile) => void;
}) {
   const tx = useMessages(messages);
   const [chat, setChat] = useState<SandboxChat | null>(null);
   useEffect(() => {
      void loadSandboxConversation(agent, id).then(setChat, (error: Error) =>
         toast.error(error.message)
      );
   }, [agent, id]);
   return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="conversation-viewer">
         <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-sm">
            <button
               type="button"
               aria-label={tx('Close the conversation')}
               onClick={onClose}
               className="rounded p-1 hover:bg-accent"
            >
               <X className="size-4" />
            </button>
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <button
               type="button"
               onClick={onResume}
               className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
            >
               <History className="size-3.5" /> {tx('Resume')}
            </button>
         </div>
         {chat && <ChatView chat={chat} onOpenFile={onOpenFile} />}
      </div>
   );
}
