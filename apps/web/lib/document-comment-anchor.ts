/**
 * Where a document comment sits: the text of the rendered block (paragraph, heading, list item,
 * table row, code block), its index among the blocks and, for a selection, the selected phrase.
 * VI: Vị trí của comment tài liệu: chữ của đoạn đã render (đoạn văn, heading, mục danh sách, dòng
 * VI: bảng, khối code), thứ tự của nó trong các đoạn và, nếu bôi đen, cụm chữ được chọn.
 */
export type DocumentCommentAnchor = {
   blockText: string;
   blockIndex: number;
   quote?: string | null;
};

/** Block elements a comment can attach to. VI: Các phần tử đoạn mà comment gắn vào được. */
export const COMMENT_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, tr, pre, blockquote';

/** Collapsed whitespace, cut to the length the server stores. VI: Gộp khoảng trắng, cắt theo độ dài server lưu. */
export const blockKey = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 500);

/**
 * Index of the block the anchor points at after edits: a block with the same text, else one
 * containing the quoted phrase, the one nearest the old position winning; -1 when the text is
 * gone, so the thread shows as "content changed" instead of landing on the wrong line.
 * `contains[i]` lists the blocks nested inside block i, so a list item never wins over its own
 * paragraph for a quote.
 * VI: Thứ tự đoạn mà comment trỏ tới sau khi tài liệu bị sửa: đoạn cùng chữ, nếu không thì đoạn
 * VI: chứa cụm chữ được trích, ưu tiên đoạn gần vị trí cũ nhất; -1 khi chữ không còn, để thread
 * VI: hiện "nội dung đã thay đổi" thay vì gắn nhầm dòng. `contains[i]` là các đoạn nằm trong đoạn
 * VI: i, để mục danh sách không thắng chính đoạn văn bên trong nó khi tìm cụm trích.
 */
export function resolveBlock(
   texts: string[],
   anchor: DocumentCommentAnchor,
   contains: number[][] = []
): number {
   const keys = texts.map(blockKey);
   let candidates = keys.flatMap((key, index) => (key === anchor.blockText ? [index] : []));
   const quote = anchor.quote ? blockKey(anchor.quote) : '';
   if (!candidates.length && quote) {
      const found = keys.flatMap((_, index) =>
         texts[index].replace(/\s+/g, ' ').includes(quote) ? [index] : []
      );
      candidates = found.filter(
         (index) => !(contains[index] ?? []).some((inner) => found.includes(inner))
      );
   }
   if (!candidates.length) return -1;
   return candidates.reduce((best, index) =>
      Math.abs(index - anchor.blockIndex) < Math.abs(best - anchor.blockIndex) ? index : best
   );
}
