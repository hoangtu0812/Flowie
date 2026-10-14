import type { ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading } from '@astryxdesign/core/Text';

function InlineMarkdown({ value }: { value: string }) {
   const parts: ReactNode[] = [];
   const token = /(\*\*[^*]+\*\*|\x60[^\x60]+\x60|\[[^\]]+\]\([^\s)]+\))/g;
   let cursor = 0;

   for (const match of value.matchAll(token)) {
      const index = match.index ?? 0;
      if (index > cursor) parts.push(value.slice(cursor, index));
      const item = match[0];
      if (item.startsWith('**')) {
         parts.push(<strong key={index + '-bold'}>{item.slice(2, -2)}</strong>);
      } else if (item.startsWith('\x60')) {
         parts.push(
            <code key={index + '-code'} className="rounded bg-muted px-1 py-0.5 font-mono text-sm">
               {item.slice(1, -1)}
            </code>
         );
      } else {
         const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(item);
         if (link && /^https?:\/\//.test(link[2])) {
            parts.push(
               <a
                  key={index + '-link'}
                  href={link[2]}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-4"
               >
                  {link[1]}
               </a>
            );
         } else {
            parts.push(item);
         }
      }
      cursor = index + item.length;
   }
   if (cursor < value.length) parts.push(value.slice(cursor));
   return <>{parts}</>;
}

/** Safe, dependency-free Markdown preview for the native editor. */
export function MarkdownPreview({ content }: { content: string }) {
   const blocks: ReactNode[] = [];
   const lines = content.replace(/\r\n/g, '\n').split('\n');
   let paragraph: string[] = [];
   const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push(
         <p key={'p-' + blocks.length} className="whitespace-pre-wrap leading-7">
            <InlineMarkdown value={paragraph.join('\n')} />
         </p>
      );
      paragraph = [];
   };

   for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.trim()) {
         flushParagraph();
         continue;
      }
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
         flushParagraph();
         blocks.push(
            <Heading key={'heading-' + blocks.length} level={heading[1].length as 1 | 2 | 3}>
               <InlineMarkdown value={heading[2]} />
            </Heading>
         );
         continue;
      }
      if (/^[-*]\s+/.test(line)) {
         flushParagraph();
         const items: string[] = [];
         while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
            items.push(lines[index].replace(/^[-*]\s+/, ''));
            index += 1;
         }
         index -= 1;
         blocks.push(
            <ul key={'list-' + blocks.length} className="list-disc space-y-1 pl-6">
               {items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                     <InlineMarkdown value={item} />
                  </li>
               ))}
            </ul>
         );
         continue;
      }
      if (line.startsWith('> ')) {
         flushParagraph();
         blocks.push(
            <blockquote
               key={'quote-' + blocks.length}
               className="border-l-2 border-primary/50 pl-4 text-muted-foreground"
            >
               <InlineMarkdown value={line.slice(2)} />
            </blockquote>
         );
         continue;
      }
      if (/^---+$/.test(line.trim())) {
         flushParagraph();
         blocks.push(<hr key={'rule-' + blocks.length} className="my-5 border-border" />);
         continue;
      }
      paragraph.push(line);
   }
   flushParagraph();
   return blocks.length ? (
      <VStack gap={4}>{blocks}</VStack>
   ) : (
      <p className="text-muted-foreground">This document is empty.</p>
   );
}
