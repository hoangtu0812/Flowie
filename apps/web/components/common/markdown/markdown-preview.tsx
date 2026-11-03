'use client';

import { useContext, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { AttachmentImage } from '@/components/common/attachment-image';
import { splitMentions } from '@/features/issues/mention-text';
import { createSlugger } from '@/lib/markdown-headings';
import { rehypeMathPlugin, remarkMathPlugin } from '@/lib/markdown-math';
import { MermaidDiagram } from './mermaid-diagram';
import { cn } from '@/lib/utils';
import { documentFrontMatter } from '@/lib/document-front-matter';
import { MarkdownContext } from './markdown-context';
import { useMessages } from '@/features/shared/use-messages';

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

const hasImage = (node?: HtmlNode): boolean =>
   node?.tagName === 'img' || (node?.children ?? []).some(hasImage);

function MarkdownImage({ src, alt }: { src: string; alt: string }) {
   const { documentMedia } = useContext(MarkdownContext);
   return (
      <AttachmentImage
         src={src}
         alt={alt}
         inlineExpansion={documentMedia}
         className="max-h-112 w-auto object-contain"
      />
   );
}

function MarkdownLink({
   children,
   href,
   node,
}: {
   children?: React.ReactNode;
   href?: string;
   node?: HtmlNode;
}) {
   const { documentMedia } = useContext(MarkdownContext);
   const tx = useMessages({ 'Open linked page': 'Mở trang liên kết' });
   const link = (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
         {documentMedia && hasImage(node) ? tx('Open linked page') : children}
      </a>
   );
   return documentMedia && hasImage(node) ? (
      <VStack gap={1}>
         {children}
         {link}
      </VStack>
   ) : (
      link
   );
}

/**
 * Element renderers for both appearances, built once at module load. react-markdown compares
 * component identity on every render, so an inline object would remount each element on any
 * parent update — an embedded screenshot would then fetch again and fall back to its loading
 * placeholder, making the page jump while someone types a comment.
 * VI: Bộ renderer cho cả hai kiểu hiển thị, tạo một lần khi nạp module. react-markdown so sánh
 * VI: định danh component ở mỗi lần render, nên object tạo trực tiếp sẽ làm mọi phần tử bị
 * VI: mount lại khi component cha cập nhật — ảnh chụp màn hình nhúng sẽ tải lại và về khung chờ,
 * VI: làm trang nhảy khi người dùng đang gõ bình luận.
 */
function markdownComponents(readable: boolean): Components {
   return {
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
      p: ({ children, node }) =>
         hasImage(node as HtmlNode) ? (
            <VStack gap={2}>{children}</VStack>
         ) : (
            <Text as="p" type={readable ? 'inherit' : 'body'}>
               {children}
            </Text>
         ),
      a: MarkdownLink,
      // A mermaid block renders as a diagram, so it must not sit inside <pre>.
      // VI: Khối mermaid được vẽ thành sơ đồ nên không được nằm trong <pre>.
      pre: ({ children, node }) =>
         isMermaid((node?.children?.[0] as HtmlNode | undefined)?.properties?.className) ? (
            <>{children}</>
         ) : (
            <pre
               className={cn(
                  'overflow-auto rounded bg-muted p-4',
                  readable && 'max-w-full border border-border/60 bg-muted/30 text-xs leading-6'
               )}
            >
               {children}
            </pre>
         ),
      code: ({ children, className }) =>
         className === 'language-mermaid' ? (
            <MermaidDiagram code={String(children).replace(/\n$/, '')} />
         ) : (
            <code className={className ?? 'rounded bg-muted px-1 font-mono'}>{children}</code>
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
            // Resolve private attachments before either the gallery or inline viewport uses them.
            // VI: Tải attachment riêng tư trước khi gallery hoặc viewport inline sử dụng.
            <MarkdownImage src={src} alt={alt ?? ''} />
         ) : null,
   };
}

const COMPONENTS = { default: markdownComponents(false), issue: markdownComponents(true) };

/**
 * CommonMark/GFM rendering with TeX math, without raw HTML or executable URL protocols.
 * `mentions` lists the member names whose `@Name` should be highlighted.
 * VI: Hiển thị CommonMark/GFM kèm công thức TeX, không có HTML thô hay giao thức URL thực thi
 * VI: được. `mentions` là danh sách tên thành viên cần highlight `@Tên`.
 */
export function MarkdownPreview({
   content,
   appearance = 'default',
   mentions = [],
   documentMedia = false,
}: {
   content: string;
   appearance?: 'default' | 'issue';
   mentions?: string[];
   documentMedia?: boolean;
}) {
   const readable = appearance === 'issue';
   const parsed = useMemo(
      () =>
         documentMedia
            ? documentFrontMatter(content)
            : { body: content, config: undefined, error: false },
      [content, documentMedia]
   );
   const configKey = JSON.stringify(parsed.config ?? {});
   const context = useMemo(
      () => ({ documentMedia, config: documentMedia ? JSON.parse(configKey) : undefined }),
      [documentMedia, configKey]
   );
   const tx = useMessages({
      'Invalid document front matter. Default diagram settings are used.':
         'Front matter tài liệu không hợp lệ. Dùng cấu hình sơ đồ mặc định.',
   });
   if (!content.trim()) return <Text type="supporting">This content is empty.</Text>;
   return (
      <MarkdownContext.Provider value={context}>
         <VStack
            gap={4}
            data-document-reading={documentMedia ? '' : undefined}
            className={cn(
               'min-w-0',
               readable && 'text-sm leading-7 break-words',
               documentMedia &&
                  '[&>*]:mx-auto [&>*]:w-full [&>*]:max-w-3xl [&>*:has([data-media-expanded=true])]:max-w-none [&>[data-media-expanded=true]]:max-w-none'
            )}
         >
            {parsed.error && (
               <Text role="alert">
                  {tx('Invalid document front matter. Default diagram settings are used.')}
               </Text>
            )}
            <Markdown
               skipHtml
               remarkPlugins={
                  mentions.length
                     ? [remarkGfm, remarkMathPlugin, remarkMentions(mentions)]
                     : [remarkGfm, remarkMathPlugin]
               }
               rehypePlugins={[rehypeMathPlugin, rehypeHeadingIds]}
               components={COMPONENTS[appearance]}
            >
               {parsed.body}
            </Markdown>
         </VStack>
      </MarkdownContext.Provider>
   );
}
