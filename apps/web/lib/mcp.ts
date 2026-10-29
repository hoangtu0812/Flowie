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
   metadata: { connectionId?: string; tool?: string; outcome?: string; durationMs?: number };
};

export type McpAuditFilter = { connectionId?: string; outcome?: 'succeeded' | 'failed' };

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
   if (cursor) query.set('cursor', cursor);
   return request(`audit?${query}`);
}
