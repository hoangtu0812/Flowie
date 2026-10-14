import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';

/** CommonMark/GFM rendering without raw HTML or executable URL protocols. */
export function MarkdownPreview({ content }: { content: string }) {
   if (!content.trim()) return <Text type="supporting">This content is empty.</Text>;
   return (
      <VStack gap={4}>
         <Markdown
            skipHtml
            remarkPlugins={[remarkGfm]}
            components={{
               h1: ({ children }) => <Heading level={1}>{children}</Heading>,
               h2: ({ children }) => <Heading level={2}>{children}</Heading>,
               h3: ({ children }) => <Heading level={3}>{children}</Heading>,
               h4: ({ children }) => <Heading level={4}>{children}</Heading>,
               h5: ({ children }) => <Heading level={5}>{children}</Heading>,
               h6: ({ children }) => <Heading level={6}>{children}</Heading>,
               p: ({ children }) => <Text as="p">{children}</Text>,
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
                  <pre className="overflow-auto rounded bg-muted p-4">{children}</pre>
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
                  <blockquote className="border-l-2 border-border pl-4">{children}</blockquote>
               ),
               table: ({ children }) => (
                  <VStack className="overflow-x-auto">
                     <table className="w-full border-collapse">{children}</table>
                  </VStack>
               ),
               th: ({ children }) => (
                  <th className="border border-border p-2 text-left">{children}</th>
               ),
               td: ({ children }) => <td className="border border-border p-2">{children}</td>,
               img: ({ src, alt }) => (
                  <img src={src} alt={alt ?? ''} loading="lazy" className="max-w-full rounded" />
               ),
            }}
         >
            {content}
         </Markdown>
      </VStack>
   );
}
