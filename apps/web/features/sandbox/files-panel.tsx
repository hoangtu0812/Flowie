'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUp, File, Folder, Home, TextCursorInput } from 'lucide-react';
import { Text } from '@astryxdesign/core/Text';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { useMessages } from '@/features/shared/use-messages';
import {
   loadSandboxFile,
   loadSandboxFolder,
   sandboxImageUrl,
   type SandboxEntry,
   type SandboxFile,
} from '@/lib/sandbox';
import { cn } from '@/lib/utils';
import { messages } from './messages.vi';
import { shortDir } from './session-list';

// The colours termi gives git letters: modified, added, deleted, untracked, changes below.
// VI: Màu termi dùng cho chữ cái git: sửa, thêm, xoá, chưa theo dõi, có thay đổi bên dưới.
const MARK_STYLE: Record<string, string> = {
   'M': 'text-amber-600',
   'A': 'text-emerald-600',
   'D': 'text-red-600',
   'U': 'text-emerald-600',
   'R': 'text-sky-600',
   '•': 'text-amber-600',
};

/**
 * termi's file browser: folders first with git change letters, text and Markdown (rendered by
 * Flowie's own preview) and images, and a button that adds the file's path to the message box.
 * VI: Trình duyệt file của termi: thư mục trước kèm chữ cái thay đổi git, xem chữ và Markdown
 * VI: (dùng bộ hiển thị của Flowie) và ảnh, và nút thêm đường dẫn file vào ô soạn tin.
 */
export function FilesPanel({
   start,
   home,
   onInsert,
}: {
   start: string;
   home: string;
   onInsert: (path: string) => void;
}) {
   const tx = useMessages(messages);
   const [dir, setDir] = useState(start);
   const [listing, setListing] = useState<{
      dir: string;
      parent: string | null;
      entries: SandboxEntry[];
   } | null>(null);
   const [open, setOpen] = useState<SandboxFile | null>(null);
   const [error, setError] = useState('');

   useEffect(() => setDir(start), [start]);
   useEffect(() => {
      setError('');
      loadSandboxFolder(dir).then(setListing, (failure: Error) => setError(failure.message));
   }, [dir]);

   const openFile = (path: string) =>
      void loadSandboxFile(path).then(setOpen, (failure: Error) => setError(failure.message));

   if (open) {
      const markdown = /\.(md|markdown)$/i.test(open.path);
      return (
         <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-sm">
               <button
                  type="button"
                  aria-label={tx('Back to the folder')}
                  onClick={() => setOpen(null)}
                  className="rounded p-1 hover:bg-accent"
               >
                  <ArrowLeft className="size-4" />
               </button>
               <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {shortDir(open.path, home)}
               </span>
               <button
                  type="button"
                  onClick={() => onInsert(open.path)}
                  className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
               >
                  <TextCursorInput className="size-3.5" /> {tx('Add to message')}
               </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3" data-testid="file-view">
               {open.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- served by the API from the sandbox
                  <img src={sandboxImageUrl(open.path)} alt={open.path} className="max-w-full" />
               )}
               {open.binary && <Text type="supporting">{tx('This file is binary.')}</Text>}
               {open.text !== undefined &&
                  (markdown ? (
                     <MarkdownPreview content={open.text} />
                  ) : (
                     <pre className="whitespace-pre-wrap break-all font-mono text-xs">
                        {open.text}
                     </pre>
                  ))}
            </div>
         </div>
      );
   }

   return (
      <div className="flex min-h-0 flex-1 flex-col">
         <div className="flex shrink-0 items-center gap-1 border-b px-3 py-1.5 text-sm">
            <button
               type="button"
               aria-label={tx('Home folder')}
               onClick={() => setDir(home)}
               className="rounded p-1 hover:bg-accent"
            >
               <Home className="size-4" />
            </button>
            <button
               type="button"
               aria-label={tx('Parent folder')}
               disabled={!listing?.parent}
               onClick={() => listing?.parent && setDir(listing.parent)}
               className="rounded p-1 hover:bg-accent disabled:opacity-40"
            >
               <ArrowUp className="size-4" />
            </button>
            <span className="min-w-0 truncate font-mono text-xs" data-testid="folder-path">
               {listing ? shortDir(listing.dir, home) : ''}
            </span>
         </div>
         {error && (
            <Text type="supporting" role="alert" className="px-3 py-2">
               {error}
            </Text>
         )}
         <ul aria-label={tx('Files')} className="min-h-0 flex-1 overflow-y-auto py-1">
            {listing?.entries.map((entry) => (
               <li key={entry.path}>
                  <button
                     type="button"
                     onClick={() => (entry.dir ? setDir(entry.path) : openFile(entry.path))}
                     className="flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-accent"
                  >
                     {entry.dir ? (
                        <Folder className="size-4 shrink-0 text-sky-600" />
                     ) : (
                        <File className="size-4 shrink-0 text-muted-foreground" />
                     )}
                     <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                     {entry.git && (
                        <span
                           className={cn('w-3 shrink-0 font-mono text-xs', MARK_STYLE[entry.git])}
                        >
                           {entry.git}
                        </span>
                     )}
                  </button>
               </li>
            ))}
         </ul>
      </div>
   );
}
