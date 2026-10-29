'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';

import { useRef, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { IconButton } from '@astryxdesign/core/IconButton';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import {
   Bold,
   Code,
   Columns2,
   Eye,
   Heading,
   Image as ImageIcon,
   Italic,
   Link,
   List,
   ListOrdered,
   Pencil,
   Quote,
   Strikethrough,
} from 'lucide-react';
import { MarkdownPreview } from './markdown-preview';
import { formatMarkdown, type MarkdownAction } from '@/lib/markdown-format';
import { cn } from '@/lib/utils';

type Mode = 'edit' | 'split' | 'preview';

const HEADINGS = [1, 2, 3, 4, 5, 6] as const;

function Separator() {
   return <span aria-hidden className="mx-1 h-5 w-px bg-border" />;
}

/**
 * Markdown source editor with a formatting toolbar, line numbers and edit / split / preview
 * modes. The text stays a plain controlled string; the toolbar only rewrites the selection.
 * VI: Trình soạn mã Markdown có thanh công cụ định dạng, số dòng và chế độ sửa / chia đôi /
 * VI: xem trước. Nội dung vẫn là chuỗi controlled; toolbar chỉ viết lại vùng đang chọn.
 */
export function MarkdownEditor({
   value,
   onChange,
}: {
   value: string;
   onChange: (value: string) => void;
}) {
   const tx = useMessages(messages);
   const [mode, setMode] = useState<Mode>('split');
   const area = useRef<HTMLTextAreaElement>(null);

   /**
    * Applies a toolbar edit through `execCommand('insertText')` so the browser records it in
    * the undo stack and fires a normal input event. Browsers that refuse fall back to
    * `setRangeText`, which keeps the text correct but cannot be undone with Ctrl/Cmd+Z.
    * VI: Áp thay đổi của toolbar qua `execCommand('insertText')` để trình duyệt ghi vào lịch sử
    * VI: hoàn tác và phát sự kiện input bình thường. Trình duyệt từ chối thì dùng `setRangeText`:
    * VI: văn bản vẫn đúng nhưng không hoàn tác được bằng Ctrl/Cmd+Z.
    */
   const apply = (action: MarkdownAction) => {
      const field = area.current;
      if (!field) return;
      const edit = formatMarkdown(field.value, field.selectionStart, field.selectionEnd, action);
      field.focus();
      field.setSelectionRange(edit.from, edit.to);
      if (!document.execCommand('insertText', false, edit.text)) {
         field.setRangeText(edit.text, edit.from, edit.to);
         onChange(field.value);
      }
      field.setSelectionRange(edit.selectionStart, edit.selectionEnd);
   };

   const tool = (label: string, icon: ReactNode, action: MarkdownAction) => (
      <IconButton
         label={label}
         tooltip={label}
         icon={icon}
         variant="ghost"
         size="sm"
         isDisabled={mode === 'preview'}
         onClick={() => apply(action)}
      />
   );
   // Menu items run after the menu has returned focus to its trigger, so the edit can refocus
   // the textarea instead of leaving the caret on the toolbar.
   // VI: Mục menu chạy sau khi menu trả focus về nút mở, để thao tác focus lại textarea thay vì
   // VI: để con trỏ ở thanh công cụ.
   const later = (action: MarkdownAction) => () => requestAnimationFrame(() => apply(action));
   const lines = value.split('\n');
   const pane = 'h-[65vh] min-h-64 overflow-auto rounded-md border border-border/60';

   return (
      <VStack gap={2}>
         <HStack
            role="toolbar"
            aria-label={tx('Formatting')}
            gap={0.5}
            vAlign="center"
            wrap="wrap"
            className="rounded-md border border-border/60 p-1"
         >
            {tool(tx('Bold'), <Bold size={16} />, 'bold')}
            {tool(tx('Italic'), <Italic size={16} />, 'italic')}
            {tool(tx('Strikethrough'), <Strikethrough size={16} />, 'strike')}
            <DropdownMenu
               button={{
                  label: tx('Heading'),
                  tooltip: tx('Heading'),
                  icon: <Heading size={16} />,
                  isIconOnly: true,
                  variant: 'ghost',
                  size: 'sm',
                  isDisabled: mode === 'preview',
               }}
               items={HEADINGS.map((level) => ({
                  label: `H${level}`,
                  onClick: later(`h${level}`),
               }))}
            />
            <Separator />
            {tool(tx('Bulleted list'), <List size={16} />, 'bullet')}
            {tool(tx('Numbered list'), <ListOrdered size={16} />, 'ordered')}
            <Separator />
            <DropdownMenu
               button={{
                  label: tx('Code'),
                  tooltip: tx('Code'),
                  icon: <Code size={16} />,
                  isIconOnly: true,
                  variant: 'ghost',
                  size: 'sm',
                  isDisabled: mode === 'preview',
               }}
               items={[
                  { label: tx('Inline code'), onClick: later('code') },
                  { label: tx('Code block'), onClick: later('codeBlock') },
               ]}
            />
            {tool(tx('Quote'), <Quote size={16} />, 'quote')}
            <Separator />
            {tool(tx('Link'), <Link size={16} />, 'link')}
            {tool(tx('Image'), <ImageIcon size={16} />, 'image')}
            <SegmentedControl
               className="ml-auto"
               label={tx('View mode')}
               value={mode}
               onChange={(next) => setMode(next as Mode)}
               size="sm"
            >
               <SegmentedControlItem
                  value="edit"
                  label={tx('Edit')}
                  icon={<Pencil size={14} />}
                  isLabelHidden
               />
               <SegmentedControlItem
                  value="split"
                  label={tx('Split view')}
                  icon={<Columns2 size={14} />}
                  isLabelHidden
               />
               <SegmentedControlItem
                  value="preview"
                  label={tx('Preview')}
                  icon={<Eye size={14} />}
                  isLabelHidden
               />
            </SegmentedControl>
         </HStack>
         <div className={cn('grid gap-4', mode === 'split' && 'md:grid-cols-2')}>
            {mode !== 'preview' && (
               <div className={cn(pane, 'focus-within:ring-1 focus-within:ring-ring')}>
                  {/*
                   * Line numbers: each logical line is mirrored invisibly in the right column with
                   * the textarea's font and wrapping, so a wrapped line grows its row and the
                   * number on the left stays aligned. The textarea sits on top of that column.
                   * The font reads `--font-geist-mono` directly: the `font-mono` utility resolves
                   * `--font-mono` on :root, where next/font has not defined the Geist variable.
                   * VI: Số dòng: mỗi dòng logic được sao ẩn ở cột phải với cùng font và cách xuống
                   * VI: dòng của textarea, nên dòng dài tự xuống dòng làm cao hàng của nó và số ở
                   * VI: cột trái vẫn thẳng hàng. Textarea nằm chồng lên cột đó.
                   * VI: Font đọc thẳng `--font-geist-mono`: utility `font-mono` lấy `--font-mono` ở
                   * VI: :root, nơi next/font chưa khai báo biến Geist.
                   */}
                  <div className="relative grid min-h-full content-start grid-cols-[3.5rem_minmax(0,1fr)] py-2 [font-family:var(--font-geist-mono),ui-monospace,monospace] text-sm leading-6 [tab-size:4]">
                     {lines.map((line, index) => (
                        <div key={index} className="contents">
                           <div
                              aria-hidden
                              className="select-none pr-3 text-right text-muted-foreground/70"
                           >
                              {index + 1}
                           </div>
                           <div
                              aria-hidden
                              className="invisible px-3 break-words whitespace-pre-wrap"
                           >
                              {line || ' '}
                           </div>
                        </div>
                     ))}
                     <textarea
                        ref={area}
                        aria-label={tx('Markdown content')}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        spellCheck={false}
                        className="absolute inset-y-0 right-0 left-[3.5rem] resize-none overflow-hidden bg-transparent px-3 py-2 [font-family:inherit] text-sm leading-6 break-words whitespace-pre-wrap outline-none"
                     />
                  </div>
               </div>
            )}
            {mode !== 'edit' && (
               <article aria-label={tx('Preview')} className={cn(pane, 'p-4')}>
                  <MarkdownPreview content={value} />
               </article>
            )}
         </div>
      </VStack>
   );
}
