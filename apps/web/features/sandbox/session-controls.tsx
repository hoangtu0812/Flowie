'use client';

import { useRef, useState } from 'react';
import { Copy, Paperclip, Send, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { useMessages } from '@/features/shared/use-messages';
import {
   loadSandboxSessionText,
   sendToSandboxSession,
   uploadToSandbox,
   type SandboxAgent,
   type SandboxKey,
} from '@/lib/sandbox';
import { messages } from './messages.vi';

type Tx = ReturnType<typeof useMessages<typeof messages>>;

const KEYS: [string, SandboxKey][] = [
   ['Esc', 'Escape'],
   ['⇧Tab', 'BTab'],
   ['^C', 'C-c'],
   ['↑', 'Up'],
   ['↓', 'Down'],
   ['←', 'Left'],
   ['→', 'Right'],
   ['Tab', 'Tab'],
   ['⏎', 'Enter'],
   ['PgUp', 'PageUp'],
   ['PgDn', 'PageDown'],
   ['^D', 'C-d'],
];

type Quick = {
   label: keyof typeof messages;
   hint: keyof typeof messages;
   text: keyof typeof messages | Partial<Record<SandboxAgent | '*', string>>;
   ask?: boolean;
};

// termi's quick actions (public/js/quick.mjs): one tap sends a prepared request to the agent.
// VI: Thao tác nhanh của termi (public/js/quick.mjs): một lần bấm gửi yêu cầu soạn sẵn cho agent.
const QUICK: Quick[] = [
   {
      label: 'Status',
      hint: 'Branch, changes, unpushed commits',
      text: 'Tell me briefly: which branch this is, what is changed and not committed, and which commits are not pushed.',
   },
   {
      label: 'Commit',
      hint: 'Review the changes and commit',
      text: 'Look at the current changes and commit them with clear messages (split into several commits where it makes sense).',
   },
   {
      label: 'Push',
      hint: 'Push the branch',
      text: 'Push the current branch to the remote.',
      ask: true,
   },
   {
      label: 'Create PR',
      hint: 'Pull request with a description',
      text: 'Create a pull request for the current branch with gh, with a title and a description summarising the changes.',
      ask: true,
   },
   {
      label: 'Merge PR',
      hint: 'Check CI, then merge',
      text: "Check the CI of the current branch's pull request; if everything passes merge it, otherwise report the failures.",
      ask: true,
   },
   {
      label: 'Review',
      hint: 'Look for problems in the changes',
      text: { claude: '/code-review', codex: '/review' },
   },
   {
      label: 'Run tests',
      hint: 'Report results, explain failures',
      text: "Run the project's tests and report the results; explain the cause of any failure.",
   },
   {
      label: 'Compact',
      hint: 'Shrink the conversation context',
      text: { claude: '/compact', codex: '/compact' },
   },
];

function quickText(quick: Quick, agent: SandboxAgent | null, tx: Tx): string | null {
   if (typeof quick.text === 'string') return tx(quick.text);
   return (agent && quick.text[agent]) || quick.text['*'] || null;
}

/** Keys an on-screen keyboard lacks, plus font size, as termi's key row. */
/** VI: Các phím bàn phím ảo không có, cùng cỡ chữ, như hàng phím của termi. */
export function KeyRow({ session, onFont }: { session: string; onFont: (delta: number) => void }) {
   const tx = useMessages(messages);
   const press = (key: SandboxKey) =>
      void sendToSandboxSession(session, { key }).catch((error: Error) =>
         toast.error(error.message)
      );
   return (
      <div
         role="toolbar"
         aria-label={tx('Terminal keys')}
         className="flex shrink-0 gap-1 overflow-x-auto border-t px-2 py-1"
      >
         {KEYS.map(([label, key]) => (
            <button
               key={key}
               type="button"
               aria-label={key}
               onClick={() => press(key)}
               className="shrink-0 rounded border px-2 py-0.5 font-mono text-xs hover:bg-accent"
            >
               {label}
            </button>
         ))}
         <button
            type="button"
            aria-label={tx('Smaller text')}
            onClick={() => onFont(-1)}
            className="ml-auto shrink-0 rounded border px-2 py-0.5 text-xs hover:bg-accent"
         >
            A−
         </button>
         <button
            type="button"
            aria-label={tx('Larger text')}
            onClick={() => onFont(1)}
            className="shrink-0 rounded border px-2 py-0.5 text-xs hover:bg-accent"
         >
            A+
         </button>
         <CopyText session={session} />
      </div>
   );
}

/** The session as plain text (screen and history) to select and copy, as termi's 📋. */
/** VI: Phiên dạng chữ thường (màn hình và lịch sử) để chọn và copy, như nút 📋 của termi. */
function CopyText({ session }: { session: string }) {
   const tx = useMessages(messages);
   const [text, setText] = useState<string | null>(null);
   const open = () =>
      void loadSandboxSessionText(session).then(setText, (error: Error) =>
         toast.error(error.message)
      );
   return (
      <>
         <button
            type="button"
            aria-label={tx('Session text')}
            onClick={open}
            className="shrink-0 rounded border px-2 py-0.5 hover:bg-accent"
         >
            <Copy className="size-3.5" />
         </button>
         {text !== null && (
            <Dialog
               isOpen
               aria-label={tx('Session text')}
               width={900}
               onOpenChange={(isOpen) => !isOpen && setText(null)}
            >
               <Layout
                  height="auto"
                  padding={4}
                  header={
                     <DialogHeader title={tx('Session text')} onOpenChange={() => setText(null)} />
                  }
               >
                  <LayoutContent>
                     <Button
                        label={tx('Copy all')}
                        icon={<Copy className="size-4" />}
                        size="sm"
                        onClick={() =>
                           void navigator.clipboard
                              .writeText(text)
                              .then(() => toast.success(tx('Copied')))
                              .catch(() => toast.error(tx('Could not copy.')))
                        }
                     />
                     <pre
                        data-testid="session-text"
                        className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 font-mono text-xs"
                     >
                        {text}
                     </pre>
                  </LayoutContent>
               </Layout>
            </Dialog>
         )}
      </>
   );
}

/**
 * termi's message box: the phone's or computer's own keyboard (Vietnamese input methods work),
 * Enter sends and Shift+Enter starts a new line, attached files go into the sandbox first and
 * their paths are added to the message, and quick actions send a prepared request.
 * VI: Ô soạn tin của termi: dùng bàn phím của máy (bộ gõ tiếng Việt chạy được), Enter gửi và
 * VI: Shift+Enter xuống dòng, file đính kèm được đưa vào sandbox trước và đường dẫn được thêm
 * VI: vào tin, còn thao tác nhanh gửi một yêu cầu soạn sẵn.
 */
export function Composer({ session, agent }: { session: string; agent: SandboxAgent | null }) {
   const tx = useMessages(messages);
   const [text, setText] = useState('');
   const [files, setFiles] = useState<File[]>([]);
   const [busy, setBusy] = useState(false);
   const picker = useRef<HTMLInputElement>(null);

   const deliver = async (message: string) => {
      setBusy(true);
      try {
         const paths = [];
         for (const file of files) paths.push(await uploadToSandbox(file));
         const body = [message.trim(), ...paths].filter(Boolean).join('\n\n');
         await sendToSandboxSession(session, { text: body, enter: true });
         setText('');
         setFiles([]);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : String(error));
      } finally {
         setBusy(false);
      }
   };

   const quick = (item: Quick) => {
      const message = quickText(item, agent, tx);
      if (!message) return;
      if (
         item.ask &&
         !window.confirm(tx('Send “{action}” to the agent?', { action: tx(item.label) }))
      )
         return;
      void deliver(message);
   };

   return (
      <div className="shrink-0 border-t p-2">
         {files.length > 0 && (
            <ul aria-label={tx('Attachments')} className="mb-2 flex flex-wrap gap-1">
               {files.map((file, index) => (
                  <li
                     key={`${file.name}-${index}`}
                     className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"
                  >
                     {file.type.startsWith('image/') && (
                        // eslint-disable-next-line @next/next/no-img-element -- a local preview, not a page asset
                        <img
                           src={URL.createObjectURL(file)}
                           alt=""
                           className="size-6 rounded object-cover"
                        />
                     )}
                     <span className="max-w-40 truncate">{file.name}</span>
                     <button
                        type="button"
                        aria-label={tx('Remove {name}', { name: file.name })}
                        onClick={() => setFiles((list) => list.filter((_, i) => i !== index))}
                     >
                        <X className="size-3" />
                     </button>
                  </li>
               ))}
            </ul>
         )}
         <div className="flex items-end gap-1">
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <button
                     type="button"
                     aria-label={tx('Quick actions')}
                     disabled={busy}
                     className="shrink-0 rounded p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                     <Zap className="size-4" />
                  </button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="start" side="top" className="w-72">
                  {QUICK.filter((item) => quickText(item, agent, tx)).map((item) => (
                     <DropdownMenuItem key={item.label} onClick={() => quick(item)}>
                        <span className="flex flex-col">
                           <span>{tx(item.label)}</span>
                           <span className="text-xs text-muted-foreground">{tx(item.hint)}</span>
                        </span>
                     </DropdownMenuItem>
                  ))}
               </DropdownMenuContent>
            </DropdownMenu>
            <button
               type="button"
               aria-label={tx('Attach files')}
               disabled={busy}
               onClick={() => picker.current?.click()}
               className="shrink-0 rounded p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
               <Paperclip className="size-4" />
            </button>
            <input
               ref={picker}
               type="file"
               multiple
               hidden
               data-testid="attach-input"
               onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  setFiles((list) => [...list, ...picked]);
                  event.target.value = '';
               }}
            />
            <Textarea
               aria-label={tx('Message to the session')}
               placeholder={tx('Message… (Enter sends, Shift+Enter for a new line)')}
               value={text}
               rows={1}
               onChange={(event) => setText(event.target.value)}
               onKeyDown={(event) => {
                  // An input method composing Vietnamese also presses Enter; that one is not a send.
                  // VI: Bộ gõ tiếng Việt đang ghép chữ cũng nhấn Enter; lần đó không phải gửi.
                  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing)
                     return;
                  event.preventDefault();
                  if (!busy && (text.trim() || files.length)) void deliver(text);
               }}
               className="max-h-40 min-h-9 flex-1 resize-none"
            />
            <button
               type="button"
               aria-label={tx('Send')}
               disabled={busy || !(text.trim() || files.length)}
               onClick={() => void deliver(text)}
               className="shrink-0 rounded p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
               <Send className="size-4" />
            </button>
         </div>
      </div>
   );
}
