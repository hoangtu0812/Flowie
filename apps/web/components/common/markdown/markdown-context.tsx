'use client';
import { createContext } from 'react';
import type { DocumentMermaidConfig } from '@/lib/document-front-matter';
export const MarkdownContext = createContext<{
   documentMedia: boolean;
   config?: DocumentMermaidConfig;
}>({ documentMedia: false });
