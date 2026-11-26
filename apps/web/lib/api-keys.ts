import { responseData, responseEnvelope } from '@/lib/http';
import { authenticatedFetch } from '@/lib/workspaces';

export const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** A workspace API key for other systems (`flowie_api_...`); separate from MCP connections. */
/** VI: API key của workspace cho hệ thống khác (`flowie_api_...`); tách khỏi kết nối MCP. */
export type ApiKey = {
   id: string;
   name: string;
   prefix: string;
   scopes: string[];
   expiresAt: string;
   revokedAt: string | null;
   lastUsedAt: string | null;
   createdAt: string;
   createdBy: string | null;
};

export type ApiKeyDraft = { name: string; scopes: string[]; expiresInDays: number };

const url = (workspaceId: string, path = '') =>
   `${api}/api-keys${path}?workspaceId=${encodeURIComponent(workspaceId)}`;

export async function listApiKeys(
   workspaceId: string
): Promise<{ keys: ApiKey[]; scopes: string[] }> {
   const envelope = await responseEnvelope<ApiKey[], { scopes: string[] }>(
      await authenticatedFetch(url(workspaceId)),
      'Could not load API keys.'
   );
   return { keys: envelope.data, scopes: envelope.meta?.scopes ?? [] };
}

export async function createApiKey(
   workspaceId: string,
   draft: ApiKeyDraft
): Promise<ApiKey & { token: string }> {
   const response = await authenticatedFetch(url(workspaceId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
   });
   return responseData(response, 'Could not create the API key.');
}

export async function revokeApiKey(workspaceId: string, keyId: string): Promise<unknown> {
   const response = await authenticatedFetch(url(workspaceId, `/${encodeURIComponent(keyId)}`), {
      method: 'DELETE',
   });
   return responseData(response, 'Could not revoke the API key.');
}

/** Permanently deletes a revoked or expired key; an active one must be revoked first. */
export async function deleteApiKey(workspaceId: string, keyId: string): Promise<unknown> {
   const response = await authenticatedFetch(
      url(workspaceId, `/${encodeURIComponent(keyId)}/record`),
      { method: 'DELETE' }
   );
   return responseData(response, 'Could not delete the API key.');
}
