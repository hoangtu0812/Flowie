import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import { safeDescriptionLink } from './description-markdown';

const MarkdownSource = Node.create({
   name: 'markdownSource',
   group: 'block',
   atom: true,
   addAttributes: () => ({ source: { default: '' } }),
   parseHTML: () => [],
   renderHTML: ({ node }) => [
      'pre',
      {
         'data-markdown-source': '',
         'class': 'whitespace-pre-wrap break-words rounded bg-muted p-2 text-sm',
      },
      node.attrs.source,
   ],
   renderMarkdown: (node) => node.attrs?.source ?? '',
});

export const descriptionExtensions = [
   StarterKit.configure({
      underline: false,
      link: { openOnClick: false, autolink: false, isAllowedUri: safeDescriptionLink },
   }),
   Markdown.configure({ markedOptions: { gfm: true } }),
   TableKit.configure({ table: { resizable: false } }),
   TaskList,
   TaskItem.configure({ nested: true }),
   Image.configure({ inline: true }),
   MarkdownSource,
];
