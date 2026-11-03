'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Text } from '@astryxdesign/core/Text';
import { Bold, Italic, List, ListOrdered, Link } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { imagesFromClipboard, insertAtCursor } from '@/lib/attachments';
import { useMessages } from '@/features/shared/use-messages';
import { descriptionDocument, safeDescriptionLink } from './description-markdown';
import { descriptionExtensions } from './description-schema';

const modeKey = 'flowie.issue-description-mode';
const messages = {
   'Issue description': 'Mô tả công việc',
   'Add description...': 'Thêm mô tả...',
   'Rich Text': 'Trực quan',
   'Markdown': 'Markdown',
   'Preview': 'Xem trước',
   'Edit Markdown': 'Sửa Markdown',
   'Bold': 'In đậm',
   'Italic': 'In nghiêng',
   'Bullet list': 'Danh sách gạch đầu dòng',
   'Numbered list': 'Danh sách đánh số',
   'Insert link': 'Chèn liên kết',
   'Link URL': 'URL liên kết',
   'Apply link': 'Áp dụng liên kết',
   'Remove link': 'Gỡ liên kết',
   'Cancel': 'Hủy',
   'Use an https, http, mailto or relative link.':
      'Dùng liên kết https, http, mailto hoặc đường dẫn tương đối.',
   'Some blocks keep their original source. Edit them in Markdown.':
      'Một số khối giữ nguyên nguồn gốc. Hãy sửa chúng trong Markdown.',
} as const;

type StagedImage = { url: string; name: string };
export function DescriptionEditor({
   value,
   onChange,
   isDisabled,
   onImages,
}: {
   value: string;
   onChange: (value: string) => void;
   isDisabled: boolean;
   onImages: (files: File[]) => StagedImage[];
}) {
   const tx = useMessages(messages);
   const [mode, setMode] = useState<'rich' | 'markdown'>('rich');
   const [preview, setPreview] = useState(false);
   const [linkOpen, setLinkOpen] = useState(false);
   const [url, setUrl] = useState('');
   const [linkError, setLinkError] = useState(false);
   const lastValue = useRef<string | undefined>(undefined);
   const callbacks = useRef({ onChange, onImages, isDisabled });
   callbacks.current = { onChange, onImages, isDisabled };
   useEffect(() => {
      try {
         if (localStorage.getItem(modeKey) === 'markdown') setMode('markdown');
      } catch {
         // Private browsers may reject storage; the editor still works with an in-memory mode.
         // VI: Trình duyệt riêng tư có thể chặn lưu trữ; editor vẫn dùng chế độ trong bộ nhớ.
      }
   }, []);
   const editor = useEditor({
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      extensions: descriptionExtensions,
      content: '',
      editorProps: {
         attributes: {
            'role': 'textbox',
            'aria-multiline': 'true',
            'aria-label': tx('Issue description'),
            'class':
               'min-h-28 max-h-64 overflow-y-auto outline-none p-2 text-sm leading-relaxed break-words [&_p]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_pre]:whitespace-pre-wrap [&_pre]:bg-muted [&_pre]:p-2 [&_table]:w-full [&_td]:border [&_th]:border [&_td]:p-1 [&_th]:p-1 [&_img]:max-h-32 [&_img]:max-w-full [&_a]:text-primary [&_a]:underline',
         },
         handlePaste(view, event) {
            const files = event.clipboardData && imagesFromClipboard(event.clipboardData);
            if (!files?.length) return false;
            event.preventDefault();
            if (callbacks.current.isDisabled) return true;
            const staged = callbacks.current.onImages(files);
            if (staged.length) {
               const nodes = staged.map((image) =>
                  view.state.schema.nodes.image.create({ src: image.url, alt: image.name })
               );
               const { from, to } = view.state.selection;
               view.dispatch(view.state.tr.replaceWith(from, to, nodes));
            }
            return true;
         },
      },
      onUpdate({ editor }) {
         const markdown = editor.getMarkdown();
         lastValue.current = markdown;
         callbacks.current.onChange(markdown);
      },
   });
   useEffect(() => {
      if (!editor || value === lastValue.current) return;
      editor.commands.setContent(descriptionDocument(value, editor.markdown!), {
         emitUpdate: false,
      });
      lastValue.current = value;
   }, [editor, value]);
   useEffect(() => {
      editor?.setEditable(!isDisabled, false);
   }, [editor, isDisabled]);

   const chooseMode = (next: typeof mode) => {
      setMode(next);
      setPreview(false);
      setLinkOpen(false);
      try {
         localStorage.setItem(modeKey, next);
      } catch {
         // Storage is optional and never contains the draft or files.
         // VI: Lưu trữ là tùy chọn và không chứa bản nháp hay file.
      }
   };
   const applyLink = () => {
      if (!safeDescriptionLink(url)) return setLinkError(true);
      editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      setLinkOpen(false);
   };
   const hasSource = editor?.getJSON().content?.some((node) => node.type === 'markdownSource');
   return (
      <VStack gap={1} className="min-w-0 rounded border border-border">
         <HStack gap={1} wrap="wrap" justify="end" className="p-1 border-b border-border">
            <Button
               size="sm"
               label={tx('Rich Text')}
               variant={mode === 'rich' ? 'secondary' : 'ghost'}
               aria-pressed={mode === 'rich'}
               isDisabled={isDisabled}
               onClick={() => chooseMode('rich')}
            />
            <Button
               size="sm"
               label={tx('Markdown')}
               variant={mode === 'markdown' ? 'secondary' : 'ghost'}
               aria-pressed={mode === 'markdown'}
               isDisabled={isDisabled}
               onClick={() => chooseMode('markdown')}
            />
            {mode === 'markdown' && (
               <Button
                  size="sm"
                  label={tx(preview ? 'Edit Markdown' : 'Preview')}
                  variant="ghost"
                  aria-pressed={preview}
                  onClick={() => setPreview(!preview)}
               />
            )}
         </HStack>
         {mode === 'rich' ? (
            <>
               <HStack
                  gap={1}
                  wrap="wrap"
                  className="px-1"
                  onMouseDown={(event) => {
                     // Keep the text selection during pointer formatting; keyboard focus remains native.
                     // VI: Giữ vùng chọn khi bấm định dạng bằng chuột; focus bàn phím vẫn theo trình duyệt.
                     if ((event.target as HTMLElement).closest('button')) event.preventDefault();
                  }}
               >
                  <Button
                     size="sm"
                     isIconOnly
                     label={tx('Bold')}
                     icon={<Bold />}
                     variant="ghost"
                     aria-pressed={editor?.isActive('bold')}
                     isDisabled={isDisabled || !editor}
                     onClick={() => editor?.chain().focus().toggleBold().run()}
                  />
                  <Button
                     size="sm"
                     isIconOnly
                     label={tx('Italic')}
                     icon={<Italic />}
                     variant="ghost"
                     aria-pressed={editor?.isActive('italic')}
                     isDisabled={isDisabled || !editor}
                     onClick={() => editor?.chain().focus().toggleItalic().run()}
                  />
                  <Button
                     size="sm"
                     isIconOnly
                     label={tx('Bullet list')}
                     icon={<List />}
                     variant="ghost"
                     aria-pressed={editor?.isActive('bulletList')}
                     isDisabled={isDisabled || !editor}
                     onClick={() => editor?.chain().focus().toggleBulletList().run()}
                  />
                  <Button
                     size="sm"
                     isIconOnly
                     label={tx('Numbered list')}
                     icon={<ListOrdered />}
                     variant="ghost"
                     aria-pressed={editor?.isActive('orderedList')}
                     isDisabled={isDisabled || !editor}
                     onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                  />
                  <Button
                     size="sm"
                     isIconOnly
                     label={tx('Insert link')}
                     icon={<Link />}
                     variant="ghost"
                     isDisabled={isDisabled || !editor}
                     onClick={() => {
                        setUrl(editor?.getAttributes('link').href ?? '');
                        setLinkError(false);
                        setLinkOpen(!linkOpen);
                     }}
                  />
               </HStack>
               {linkOpen && (
                  <VStack gap={1} className="px-2">
                     <TextInput
                        label={tx('Link URL')}
                        value={url}
                        onChange={setUrl}
                        onEnter={applyLink}
                        placeholder="https://example.com"
                        size="sm"
                        status={
                           linkError
                              ? {
                                   type: 'error',
                                   message: tx('Use an https, http, mailto or relative link.'),
                                }
                              : undefined
                        }
                     />
                     <HStack gap={1} wrap="wrap">
                        <Button size="sm" label={tx('Apply link')} onClick={applyLink} />
                        <Button
                           size="sm"
                           label={tx('Remove link')}
                           variant="ghost"
                           onClick={() => {
                              editor?.chain().focus().extendMarkRange('link').unsetLink().run();
                              setLinkOpen(false);
                           }}
                        />
                        <Button
                           size="sm"
                           label={tx('Cancel')}
                           variant="ghost"
                           onClick={() => setLinkOpen(false)}
                        />
                     </HStack>
                  </VStack>
               )}
               {hasSource && (
                  <Text type="supporting" className="px-2">
                     {tx('Some blocks keep their original source. Edit them in Markdown.')}
                  </Text>
               )}
               <EditorContent editor={editor} className="min-w-0" />
            </>
         ) : preview ? (
            <VStack
               className="min-h-28 max-h-64 overflow-y-auto p-2 min-w-0"
               data-testid="description-preview"
            >
               <MarkdownPreview content={value} appearance="issue" />
            </VStack>
         ) : (
            <Textarea
               aria-label={tx('Issue description')}
               placeholder={tx('Add description...')}
               className="min-h-28 max-h-64 border-none shadow-none resize-y font-mono text-sm"
               value={value}
               disabled={isDisabled}
               onChange={(event) => onChange(event.target.value)}
               onPaste={(event) => {
                  const files = imagesFromClipboard(event.clipboardData);
                  if (!files.length) return;
                  event.preventDefault();
                  if (isDisabled) return;
                  const staged = onImages(files);
                  if (!staged.length) return;
                  let current = value;
                  let start = event.currentTarget.selectionStart;
                  let end = event.currentTarget.selectionEnd;
                  for (const image of staged) {
                     const next = insertAtCursor(
                        current,
                        start,
                        end,
                        `![${image.name}](${image.url})`
                     );
                     current = next.value;
                     start = end = next.caret;
                  }
                  onChange(current);
               }}
            />
         )}
      </VStack>
   );
}
