import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { JSONContent } from '@tiptap/core';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

function semantic(value: unknown): unknown {
   if (Array.isArray(value)) return value.map(semantic);
   if (!value || typeof value !== 'object') return value;
   return Object.fromEntries(
      Object.entries(value)
         .filter(([key, val]) => !['position', 'data', 'spread'].includes(key) && val != null)
         .map(([key, val]) => [key, semantic(val)])
   );
}

export function sameMarkdownMeaning(left: string, right: string): boolean {
   return (
      JSON.stringify(semantic(parser.parse(left))) === JSON.stringify(semantic(parser.parse(right)))
   );
}

export function safeDescriptionLink(url: string): boolean {
   return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(url) && !/[\u0000-\u0020]/.test(url);
}

function needsSource(node: { type: string; children?: unknown[]; url?: string }): boolean {
   if (
      [
         'math',
         'inlineMath',
         'html',
         'definition',
         'footnoteDefinition',
         'footnoteReference',
         'linkReference',
         'imageReference',
      ].includes(node.type)
   )
      return true;
   if (node.type === 'link' && node.url && !safeDescriptionLink(node.url)) return true;
   return (node.children ?? []).some((child) => needsSource(child as typeof node));
}

/**
 * Imports each complete Markdown block only when serialization preserves its AST semantics.
 * Unknown syntax, HTML, math and unresolved references remain inert source nodes, so editing
 * another paragraph cannot silently remove them. Opening or switching modes never serializes.
 * VI: Chỉ nhập từng khối Markdown khi serialize giữ nguyên ngữ nghĩa AST. Cú pháp lạ, HTML,
 * toán và tham chiếu chưa giải quyết giữ thành node nguồn bất hoạt để sửa đoạn khác không
 * âm thầm xóa chúng. Mở editor hoặc đổi chế độ không tự serialize.
 */
export function descriptionDocument(
   source: string,
   converter: { parse: (source: string) => JSONContent; serialize: (doc: JSONContent) => string }
): JSONContent {
   const tree = parser.parse(source);
   const content = tree.children.flatMap((block): JSONContent[] => {
      const raw = source.slice(block.position!.start.offset, block.position!.end.offset);
      try {
         if (!needsSource(block)) {
            const parsed = converter.parse(raw);
            if (sameMarkdownMeaning(raw, converter.serialize(parsed))) return parsed.content ?? [];
         }
      } catch {
         // Preserve the source when a third-party parser rejects a block.
         // VI: Giữ nguyên nguồn khi parser thư viện từ chối khối nội dung.
      }
      return [{ type: 'markdownSource', attrs: { source: raw } }];
   });
   const doc = { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
   // References may resolve across blocks; verify the entire document before accepting conversion.
   // VI: Tham chiếu có thể trỏ qua nhiều khối; kiểm tra toàn tài liệu trước khi nhận chuyển đổi.
   if (!sameMarkdownMeaning(source, converter.serialize(doc)))
      return { type: 'doc', content: [{ type: 'markdownSource', attrs: { source } }] };
   return doc;
}
