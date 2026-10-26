import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { AttachmentImage } from '@/components/common/attachment-image';
import { cn } from '@/lib/utils';

/** CommonMark/GFM rendering without raw HTML or executable URL protocols. */
export function MarkdownPreview({
   content,
   appearance = 'default',
}: {
   content: string;
   appearance?: 'default' | 'issue';
}) {
   const readable = appearance === 'issue';
   if (!content.trim()) return <Text type="supporting">This content is empty.</Text>;
   return (
      <VStack gap={4} className={cn('min-w-0', readable && 'text-sm leading-7 break-words')}>
         <Markdown
            skipHtml
            remarkPlugins={[remarkGfm]}
            components={{
               h1: ({ children }) => (
                  <Heading level={readable ? 2 : 1} accessibilityLevel={1}>
                     {children}
                  </Heading>
               ),
               h2: ({ children }) => (
                  <Heading level={readable ? 3 : 2} accessibilityLevel={2}>
                     {children}
                  </Heading>
               ),
               h3: ({ children }) => (
                  <Heading level={readable ? 4 : 3} accessibilityLevel={3}>
                     {children}
                  </Heading>
               ),
               h4: ({ children }) => <Heading level={4}>{children}</Heading>,
               h5: ({ children }) => <Heading level={5}>{children}</Heading>,
               h6: ({ children }) => <Heading level={6}>{children}</Heading>,
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
               pre: ({ children }) => (
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
               code: ({ children, className }) => (
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
