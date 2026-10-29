export type AuditOutcome = 'succeeded' | 'failed' | 'denied';

const OUTCOMES = new Set<string>(['succeeded', 'failed', 'denied']);

/**
 * Turns an audit action such as "mcp.read_attachment_text.denied" into a sentence-case
 * label ("Read attachment text") and its outcome. Management actions such as
 * "mcp.connection.updated" have no outcome and read as "Connection updated".
 * VI: Đổi action audit như "mcp.read_attachment_text.denied" thành nhãn viết hoa chữ
 * VI: đầu ("Read attachment text") kèm kết quả. Action quản trị như
 * VI: "mcp.connection.updated" không có kết quả và đọc là "Connection updated".
 */
export function describeAuditEvent(action: string): { label: string; outcome?: AuditOutcome } {
   const parts = action.replace(/^mcp\./, '').split('.');
   const last = parts[parts.length - 1];
   const outcome = OUTCOMES.has(last) ? (parts.pop() as AuditOutcome) : undefined;
   const words = parts.join(' ').replace(/_/g, ' ').trim() || action;
   return { label: words.charAt(0).toUpperCase() + words.slice(1), outcome };
}
