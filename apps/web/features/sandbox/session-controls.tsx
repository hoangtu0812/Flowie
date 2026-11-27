'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Paperclip, Pencil, Plus, Send, Trash2, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Checkbox } from '@/components/ui/checkbox';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { useMessages } from '@/features/shared/use-messages';
import {
   loadSandboxQuick,
   loadSandboxSessionText,
   saveSandboxQuick,
   sendToSandboxSession,
   uploadToSandbox,
   type SandboxAgent,
   type SandboxKey,
   type SandboxQuick,
   type SandboxQuickAction,
} from '@/lib/sandbox';
import { cn } from '@/lib/utils';
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

const MAX_QUICK = 30;

/** The built-in actions for this agent, in the saved form. VI: Thao tác mặc định cho agent này. */
function builtInQuick(
   agent: SandboxAgent | null,
   tx: Tx
): (SandboxQuickAction & { hint: string })[] {
   return QUICK.flatMap((item) => {
      const text = quickText(item, agent, tx);
      return text
         ? [{ label: tx(item.label), hint: tx(item.hint), text, ask: Boolean(item.ask) }]
         : [];
   });
}

/**
 * termi's quick-action editor (v1.12): the shared list, which replaces the built-in one, or the
 * list of the session's repository, shown above it. Editing the built-in list starts from it in
 * this agent's wording.
 * VI: Hộp sửa thao tác nhanh của termi (v1.12): danh sách dùng chung, thay cho danh sách mặc định,
 * VI: hoặc danh sách của repository chứa phiên, hiện phía trên. Sửa danh sách mặc định thì bắt đầu
 * VI: từ chính nó theo cách gọi của agent này.
 */
function QuickEditor({
   saved,
   dir,
   agent,
   onClose,
   onSaved,
}: {
   saved: SandboxQuick;
   dir: string;
   agent: SandboxAgent | null;
   onClose: () => void;
   onSaved: () => void;
}) {
   const tx = useMessages(messages);
   const listOf = (scope: 'shared' | 'project'): SandboxQuickAction[] =>
      scope === 'project'
         ? saved.project
         : (saved.shared ??
           builtInQuick(agent, tx).map(({ label, text, ask }) => ({ label, text, ask })));
   const [scope, setScope] = useState<'shared' | 'project'>('shared');
   const [rows, setRows] = useState(() => listOf('shared'));
   const [busy, setBusy] = useState(false);

   const pick = (next: 'shared' | 'project') => {
      setScope(next);
      setRows(listOf(next));
   };
   const change = (index: number, patch: Partial<SandboxQuickAction>) =>
      setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
   const save = async (actions: SandboxQuickAction[] | null) => {
      setBusy(true);
      try {
         await saveSandboxQuick({ scope, dir, actions });
         toast.success(tx('Quick actions saved'));
         onSaved();
      } catch (error) {
         toast.error(error instanceof Error ? error.message : String(error));
      } finally {
         setBusy(false);
      }
   };
   const cleaned = rows
      .map((row) => ({ ...row, label: row.label.trim().slice(0, 40), text: row.text.trim() }))
      .filter((row) => row.label && row.text);

   return (
      <Dialog
         isOpen
         aria-label={tx('Edit quick actions')}
         width={720}
         onOpenChange={(isOpen) => !isOpen && onClose()}
      >
         <Layout
            height="auto"
            padding={4}
            header={<DialogHeader title={tx('Edit quick actions')} onOpenChange={onClose} />}
            footer={
               <LayoutFooter>
                  <HStack gap={2} hAlign="end">
                     <Button
                        label={scope === 'shared' ? tx('Restore defaults') : tx('Remove all')}
                        variant="ghost"
                        isDisabled={busy}
                        onClick={() => void save(null)}
                     />
                     <Button label={tx('Cancel')} variant="ghost" onClick={onClose} />
                     <Button
                        label={tx('Save')}
                        variant="primary"
                        isDisabled={busy}
                        onClick={() => void save(cleaned)}
                     />
                  </HStack>
               </LayoutFooter>
            }
         >
            <LayoutContent>
               <div role="group" aria-label={tx('Which list')} className="mb-3 flex gap-1">
                  {(['shared', 'project'] as const).map((item) => (
                     <button
                        key={item}
                        type="button"
                        aria-pressed={scope === item}
                        disabled={item === 'project' && !saved.projectDir}
                        onClick={() => pick(item)}
                        className={cn(
                           'rounded border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50',
                           scope === item && 'bg-accent'
                        )}
                     >
                        {item === 'shared' ? tx('Shared') : tx('This project')}
                     </button>
                  ))}
                  <span className="ml-2 self-center truncate text-xs text-muted-foreground">
                     {scope === 'shared'
                        ? tx('Used in every project.')
                        : tx('Shown first in {folder}.', {
                             folder: saved.projectDir?.split('/').pop() ?? '',
                          })}
                  </span>
               </div>
               <ol
                  aria-label={tx('Quick actions')}
                  className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto"
               >
                  {rows.map((row, index) => (
                     <li key={index} className="flex gap-2 rounded border p-2">
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                           <TextInput
                              label={tx('Name')}
                              value={row.label}
                              width="100%"
                              onChange={(label) => change(index, { label })}
                           />
                           <Textarea
                              aria-label={tx('Message to the agent')}
                              value={row.text}
                              maxLength={2000}
                              rows={2}
                              onChange={(event) => change(index, { text: event.target.value })}
                           />
                           <label className="flex items-center gap-2 text-xs">
                              <Checkbox
                                 checked={row.ask}
                                 onCheckedChange={(checked) =>
                                    change(index, { ask: checked === true })
                                 }
                              />
                              {tx('Ask before sending')}
                           </label>
                        </div>
                        <button
                           type="button"
                           aria-label={tx('Remove {name}', {
                              name: row.label || String(index + 1),
                           })}
                           onClick={() => setRows((list) => list.filter((_, i) => i !== index))}
                           className="self-start rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                           <Trash2 className="size-4" />
                        </button>
                     </li>
                  ))}
               </ol>
               <button
                  type="button"
                  disabled={rows.length >= MAX_QUICK}
                  onClick={() => setRows((list) => [...list, { label: '', text: '', ask: false }])}
                  className="mt-2 flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
               >
                  <Plus className="size-3.5" /> {tx('Add an action')}
               </button>
            </LayoutContent>
         </Layout>
      </Dialog>
   );
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
         {/* The key row is for on-screen keyboards, as termi shows it on touch devices only. */}
         {/* VI: Hàng phím dành cho bàn phím ảo, như termi chỉ hiện trên thiết bị cảm ứng. */}
         <span className="flex gap-1 lg:hidden">
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
         </span>
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
export function Composer({
   session,
   agent,
   dir,
   text,
   setText,
}: {
   session: string;
   agent: SandboxAgent | null;
   /** The session's folder; its repository may have its own quick actions. */
   dir: string;
   /** Held by the page, so the file browser can add paths to it. */
   text: string;
   setText: (text: string) => void;
}) {
   const tx = useMessages(messages);
   const [files, setFiles] = useState<File[]>([]);
   const [busy, setBusy] = useState(false);
   const picker = useRef<HTMLInputElement>(null);
   const [saved, setSaved] = useState<SandboxQuick | null>(null);
   const [editing, setEditing] = useState(false);
   const loadQuick = () => loadSandboxQuick(dir).then(setSaved, () => undefined);
   useEffect(() => {
      void loadSandboxQuick(dir).then(setSaved, () => undefined);
   }, [dir]);
   const builtIn = builtInQuick(agent, tx);
   // The project's own actions first, then the shared list (or the built-in one).
   // VI: Thao tác của dự án trước, rồi danh sách dùng chung (hoặc mặc định).
   const actions: (SandboxQuickAction & { hint?: string })[] = [
      ...(saved?.project ?? []),
      ...(saved?.shared ?? builtIn),
   ];

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

   const quick = (item: SandboxQuickAction) => {
      if (item.ask && !window.confirm(tx('Send “{action}” to the agent?', { action: item.label })))
         return;
      void deliver(item.text);
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
                  {actions.map((item, index) => (
                     <DropdownMenuItem key={`${index}-${item.label}`} onClick={() => quick(item)}>
                        <span className="flex min-w-0 flex-col">
                           <span>{item.label}</span>
                           <span className="truncate text-xs text-muted-foreground">
                              {item.hint ?? item.text}
                           </span>
                        </span>
                     </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!saved} onClick={() => setEditing(true)}>
                     <Pencil className="size-4" /> {tx('Edit quick actions…')}
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
            {editing && saved && (
               <QuickEditor
                  saved={saved}
                  dir={dir}
                  agent={agent}
                  onClose={() => setEditing(false)}
                  onSaved={() => {
                     setEditing(false);
                     void loadQuick();
                  }}
               />
            )}
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
