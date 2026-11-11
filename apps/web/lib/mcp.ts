import { responseData } from '@/lib/http';
import { authenticatedFetch } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type McpConfiguration = {
   enabled: boolean;
   writesEnabled: boolean;
   endpointPath: string;
   scopes: string[];
};

export type McpConnection = {
   ownedByCurrentUser: boolean;
   id: string;
   name: string;
   prefix: string;
   scopes: string[];
   teamIds: string[];
   projectIds: string[];
   expiresAt: string;
   revokedAt: string | null;
   lastUsedAt: string | null;
};

export type McpAudit = {
   id: string;
   action: string;
   createdAt: string;
   connectionId: string | null;
   connectionName: string | null;
   actorName?: string | null;
   metadata: {
      connectionId?: string;
      tool?: string;
      outcome?: string;
      durationMs?: number;
      correlationId?: string;
      statusCode?: number;
      error?: string;
      message?: string;
      arguments?: unknown;
   };
};

export type McpAuditWindow = '24h' | '7d' | '30d';

export type McpAuditOutcome = 'succeeded' | 'failed' | 'denied';

/**
 * Call-log filter. `statusCode` and `message` (normalized by the API, as returned in a Top
 * errors group) narrow the log to one error group.
 * VI: Bộ lọc Call log. `statusCode` và `message` (API đã chuẩn hoá, lấy từ một nhóm Top
 * errors) thu hẹp log về một nhóm lỗi.
 */
export type McpAuditFilter = {
   connectionId?: string;
   outcome?: McpAuditOutcome;
   tool?: string;
   statusCode?: number;
   message?: string;
   window?: McpAuditWindow;
};

/** One Top errors group: unsuccessful calls sharing tool, status, outcome and message. */
/** VI: Một nhóm Top errors: lời gọi không thành công cùng tool, mã, kết quả và thông báo. */
export type McpErrorGroup = {
   tool: string;
   statusCode: number | null;
   outcome: 'failed' | 'denied';
   message: string;
   count: number;
   connections: number;
   lastAt: string;
};

type McpCallCounts = { calls: number; failed: number; denied: number };

export type McpAuditSummary = {
   window: McpAuditWindow;
   totals: McpCallCounts & { p95Ms: number | null };
   tools: (McpCallCounts & {
      tool: string;
      p95Ms: number | null;
      avgResultBytes: number | null;
      totalResultBytes: number | null;
   })[];
   connections: (McpCallCounts & {
      connectionId: string | null;
      connectionName: string | null;
      ownerName: string | null;
      lastCallAt: string;
   })[];
};

export type ConnectionDraft = {
   name: string;
   scopes: string[];
   teamIds: string[];
   projectIds: string[];
   expiresInDays: number;
};

export type McpResources = {
   labels: { id: string; name: string }[];
   teams: { id: string; name: string }[];
   projects: { id: string; name: string; teamId: string | null }[];
   truncated: boolean;
};

export function getMcpResources(workspaceId: string): Promise<McpResources> {
   return request(`resources?workspaceId=${encodeURIComponent(workspaceId)}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
   const response = await authenticatedFetch(`${api}/mcp/${path}`, init);
   const body = (await response.json()) as { data: T; message?: string };
   if (!response.ok) throw new Error(body.message ?? 'The MCP request failed.');
   return body.data;
}

// Resolves the API's '/mcp/' against the API root (the URL before '/api/v1'),
// so a proxy prefix such as https://host/flowie/api/v1 yields
// https://host/flowie/mcp/ instead of https://host/mcp/.
// VI: Ghép '/mcp/' của API vào gốc API (phần URL trước '/api/v1'), để tiền tố
// proxy như https://host/flowie/api/v1 cho ra https://host/flowie/mcp/ thay vì
// https://host/mcp/.
export function mcpEndpoint(path: string): string {
   const root = api.replace(/\/api\/v1\/?$/, '/');
   return new URL(path.replace(/^\/+/, ''), root).toString();
}

export function getMcpConfiguration(): Promise<McpConfiguration> {
   return request('configuration');
}

export function listMcpConnections(workspaceId: string): Promise<McpConnection[]> {
   return request(`connections?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function createMcpConnection(
   workspaceId: string,
   draft: ConnectionDraft
): Promise<McpConnection & { token: string }> {
   return request(`connections?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
   });
}

export function revokeMcpConnection(workspaceId: string, connectionId: string): Promise<unknown> {
   return request(
      `connections/${encodeURIComponent(connectionId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: 'DELETE' }
   );
}

export function updateMcpConnection(
   workspaceId: string,
   connectionId: string,
   draft: Omit<ConnectionDraft, 'expiresInDays'>
): Promise<McpConnection> {
   return request(
      `connections/${encodeURIComponent(connectionId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
      {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(draft),
      }
   );
}

export function listMcpAudit(
   workspaceId: string,
   filter: McpAuditFilter = {},
   cursor?: string
): Promise<{ items: McpAudit[]; nextCursor: string | null }> {
   const query = new URLSearchParams({ workspaceId });
   if (filter.connectionId) query.set('connectionId', filter.connectionId);
   if (filter.outcome) query.set('outcome', filter.outcome);
   if (filter.tool) query.set('tool', filter.tool);
   if (filter.statusCode != null) query.set('statusCode', String(filter.statusCode));
   if (filter.message) query.set('message', filter.message);
   if (filter.window) query.set('window', filter.window);
   if (cursor) query.set('cursor', cursor);
   return request(`audit?${query}`);
}

/** Tool-call counts for the MCP logs dashboard, in the caller's log scope. */
/** VI: Số liệu lời gọi tool cho dashboard MCP logs, trong phạm vi log của người gọi. */
export function getMcpAuditSummary(
   workspaceId: string,
   window: McpAuditWindow
): Promise<McpAuditSummary> {
   return request(`audit/summary?${new URLSearchParams({ workspaceId, window })}`);
}

/** Top errors of MCP logs (at most 20 groups, most frequent first), in the log scope. */
/** VI: Top errors của MCP logs (tối đa 20 nhóm, nhiều nhất trước), trong phạm vi log. */
export async function getMcpAuditErrors(
   workspaceId: string,
   window: McpAuditWindow
): Promise<McpErrorGroup[]> {
   const data = await request<{ groups: McpErrorGroup[] }>(
      `audit/errors?${new URLSearchParams({ workspaceId, window })}`
   );
   return data.groups;
}

/** Workspace MCP tool-call budgets per minute; `tools` lists every tool name allowed. */
/** VI: Giới hạn lời gọi tool MCP mỗi phút của workspace; `tools` là mọi tên tool hợp lệ. */
export type McpLimits = {
   totalPerMinute: number;
   perTool: Record<string, number>;
   usage: number;
   tools: string[];
};

const limitsUrl = (workspaceId: string) =>
   `${api}/ai-operations/limits?${new URLSearchParams({ workspaceId })}`;

export async function getMcpLimits(workspaceId: string): Promise<McpLimits> {
   return responseData<McpLimits>(await authenticatedFetch(limitsUrl(workspaceId)));
}

export async function saveMcpLimits(
   workspaceId: string,
   limits: Pick<McpLimits, 'totalPerMinute' | 'perTool'>
): Promise<unknown> {
   return responseData(
      await authenticatedFetch(limitsUrl(workspaceId), {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(limits),
      })
   );
}

/** The workflow agents receive at MCP initialize, after the fixed preamble. */
/** VI: Quy trình agent nhận lúc MCP initialize, sau câu cố định. */
export type McpInstructions = {
   preamble: string;
   workflow: string;
   defaultWorkflow: string;
   custom: boolean;
};

export const MAX_MCP_WORKFLOW_LENGTH = 20000;

export function getMcpInstructions(workspaceId: string): Promise<McpInstructions> {
   return request(`instructions?workspaceId=${encodeURIComponent(workspaceId)}`);
}

/** Saves the workspace workflow; null resets it to the built-in one. */
/** VI: Lưu quy trình của workspace; null đặt lại về quy trình có sẵn. */
export function saveMcpInstructions(
   workspaceId: string,
   workflow: string | null
): Promise<McpInstructions> {
   return request(`instructions?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow }),
   });
}
