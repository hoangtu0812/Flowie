export type OrderedItem = { id: string; manualOrder?: string; parentIssueId?: string | null };

export function compareManual(a: OrderedItem, b: OrderedItem) {
   // API positions are decimal strings because PostgreSQL BIGINT exceeds safe JavaScript numbers.
   // VI: Vị trí API là chuỗi thập phân vì BIGINT PostgreSQL vượt giới hạn số an toàn của JavaScript.
   const left = BigInt(a.manualOrder ?? '0');
   const right = BigInt(b.manualOrder ?? '0');
   return left < right ? -1 : left > right ? 1 : a.id.localeCompare(b.id);
}
