import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { AttachmentImage } from '@/components/common/attachment-image';
import { splitMentions } from '@/features/issues/mention-text';
import { createSlugger } from '@/lib/markdown-headings';
import { MermaidDiagram } from './mermaid-diagram';
import { cn } from '@/lib/utils';

type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[]; data?: object };

/**
 * Remark plugin that wraps `@Name` for the given names in a highlighted span. It rewrites
 * text nodes only, so code spans, code blocks and link labels keep their literal text.
 * VI: Plugin remark bọc `@Tên` của các tên được truyền vào trong span có highlight. Chỉ sửa
 * VI: node text, nên inline code, code block và nhãn link giữ nguyên văn bản.
 */
function remarkMentions(names: string[]) {
   return () => (tree: MarkdownNode) => {
      const walk = (node: MarkdownNode) => {
         if (!node.children || node.type === 'link' || node.type === 'linkReference') return;
         node.children = node.children.flatMap((child): MarkdownNode[] => {
            if (child.type !== 'text') {
               walk(child);
               return [child];
            }
            return splitMentions(child.value ?? '', names).map((part) =>
               typeof part === 'string'
                  ? { type: 'text', value: part }
                  : {
                       type: 'strong',
                       data: {
                          hName: 'span',
                          hProperties: {
                             className: 'rounded bg-primary/10 px-0.5 font-medium text-primary',
                          },
                       },
                       children: [{ type: 'text', value: part.mention }],
                    }
            );
         });
      };
      walk(tree);
   };
}

type HtmlNode = {
   type: string;
   tagName?: string;
   value?: string;
   properties?: Record<string, unknown>;
   children?: HtmlNode[];
};

const textOf = (node: HtmlNode): string =>
   node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(textOf).join('');

/**
 * Rehype plugin giving every heading an anchor id from its text, in document order, with
 * the same slugs `markdownHeadings` produces for the table of contents.
 * VI: Plugin rehype gán id neo cho mọi heading theo văn bản, theo thứ tự trong tài liệu,
 * VI: dùng cùng slug mà `markdownHeadings` tạo cho mục lục.
 */
function rehypeHeadingIds() {
   return (tree: HtmlNode) => {
      const slug = createSlugger();
      const walk = (node: HtmlNode) => {
         if (node.type === 'element' && /^h[1-6]$/.test(node.tagName ?? ''))
            node.properties = { ...node.properties, id: slug(textOf(node)) };
         node.children?.forEach(walk);
      };
      walk(tree);
   };
}

const isMermaid = (className: unknown) =>
   (Array.isArray(className) ? className : [className]).includes('language-mermaid');

/**
 * CommonMark/GFM rendering without raw HTML or executable URL protocols. `mentions` lists the
 * member names whose `@Name` should be highlighted.
 * VI: Hiển thị CommonMark/GFM không có HTML thô hay giao thức URL thực thi được. `mentions` là
 * VI: danh sách tên thành viên cần highlight `@Tên`.
 */
export function MarkdownPreview({
   content,
   appearance = 'default',
   mentions = [],
}: {
   content: string;
   appearance?: 'default' | 'issue';
   mentions?: string[];
}) {
   const readable = appearance === 'issue';
   if (!content.trim()) return <Text type="supporting">This content is empty.</Text>;
   return (
      <VStack gap={4} className={cn('min-w-0', readable && 'text-sm leading-7 break-words')}>
         <Markdown
            skipHtml
            remarkPlugins={mentions.length ? [remarkGfm, remarkMentions(mentions)] : [remarkGfm]}
            rehypePlugins={[rehypeHeadingIds]}
            components={{
               h1: ({ children, id }) => (
                  <Heading id={id} level={readable ? 2 : 1} accessibilityLevel={1}>
                     {children}
                  </Heading>
               ),
               h2: ({ children, id }) => (
                  <Heading id={id} level={readable ? 3 : 2} accessibilityLevel={2}>
                     {children}
                  </Heading>
               ),
               h3: ({ children, id }) => (
                  <Heading id={id} level={readable ? 4 : 3} accessibilityLevel={3}>
                     {children}
                  </Heading>
               ),
               h4: ({ children, id }) => (
                  <Heading id={id} level={4}>
                     {children}
                  </Heading>
               ),
               h5: ({ children, id }) => (
                  <Heading id={id} level={5}>
                     {children}
                  </Heading>
               ),
               h6: ({ children, id }) => (
                  <Heading id={id} level={6}>
                     {children}
                  </Heading>
               ),
               p: ({ children }) => (
                  <Text as="p" type={readable ? 'inherit' : 'body'}>
                     {children}
                  </Text>
               ),
               a: ({ children, href }) => (
                  <a
                     href={href}
                     target="_blank"
                     rel="noopener noreferrer"
                     className="text-primary underline"
                  >
                     {children}
                  </a>
               ),
               // A mermaid block renders as a diagram, so it must not sit inside <pre>.
               // VI: Khối mermaid được vẽ thành sơ đồ nên không được nằm trong <pre>.
               pre: ({ children, node }) =>
                  isMermaid(
                     (node?.children?.[0] as HtmlNode | undefined)?.properties?.className
                  ) ? (
                     <>{children}</>
                  ) : (
                     <pre
                        className={cn(
                           'overflow-auto rounded bg-muted p-4',
                           readable &&
                              'max-w-full border border-border/60 bg-muted/30 text-xs leading-6'
                        )}
                     >
                        {children}
                     </pre>
                  ),
               code: ({ children, className }) =>
                  className === 'language-mermaid' ? (
                     <MermaidDiagram code={String(children).replace(/\n$/, '')} />
                  ) : (
                     <code className={className ?? 'rounded bg-muted px-1 font-mono'}>
                        {children}
                     </code>
                  ),
               ul: ({ children }) => <ul className="list-disc space-y-1 pl-6">{children}</ul>,
               ol: ({ children, start }) => (
                  <ol start={start} className="list-decimal space-y-1 pl-6">
                     {children}
                  </ol>
               ),
               blockquote: ({ children }) => (
                  <blockquote
                     className={cn(
                        'border-l-2 border-border pl-4',
                        readable && 'text-muted-foreground italic'
                     )}
                  >
                     {children}
                  </blockquote>
               ),
               table: ({ children }) => (
                  <VStack className="overflow-x-auto">
                     <table className="w-full border-collapse">{children}</table>
                  </VStack>
               ),
               th: ({ children }) => (
                  <th scope="col" className="border border-border p-2 text-left">
                     {children}
                  </th>
               ),
               td: ({ children }) => <td className="border border-border p-2">{children}</td>,
               input: ({ checked }) => (
                  <input
                     type="checkbox"
                     checked={checked}
                     disabled
                     readOnly
                     aria-label={checked ? 'Completed task list item' : 'Incomplete task list item'}
                  />
               ),
               img: ({ src, alt }) =>
                  typeof src === 'string' ? (
                     // Attachment URLs are private and need the session on the
                     // request, which a bare `<img src>` cannot carry.
                     <AttachmentImage
                        src={src}
                        alt={alt ?? ''}
                        className={cn(
                           'max-h-[28rem] w-auto object-contain',
                           readable && 'border-border/50'
                        )}
                     />
                  ) : null,
            }}
         >
            {content}
         </Markdown>
      </VStack>
   );
}
