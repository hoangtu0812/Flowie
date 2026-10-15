export const securityApi = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/account-security`;
export const authApi = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/auth`;
export type AccountSession = {
   id: string;
   current: boolean;
   ipAddress: string | null;
   userAgent: string | null;
   method: string;
   authenticatedAt: string | null;
   createdAt: string;
   lastUsedAt: string;
   expiresAt: string;
};
export type SecurityEvent = {
   id: string;
   kind: string;
   method: string;
   ipAddress: string | null;
   userAgent: string | null;
   createdAt: string;
};
export type Credential = {
   id: string;
   credentialId: string;
   kind: 'MCP' | 'LEGACY_API_KEY';
   name: string;
   prefix: string;
   scopes: string[];
   workspaceId: string | null;
   workspaceName: string | null;
   createdAt: string;
   expiresAt: string | null;
   revokedAt: string | null;
   lastUsedAt: string | null;
};
export const securityDate = (value: string | null) =>
   value ? new Date(value).toLocaleString() : 'Unknown';
export function deviceLabel(agent: string | null) {
   const value = agent ?? '';
   const browser = value.includes('Edg/')
      ? 'Edge'
      : value.includes('Firefox/')
        ? 'Firefox'
        : value.includes('Chrome/')
          ? 'Chrome'
          : value.includes('Safari/')
            ? 'Safari'
            : 'Unknown browser';
   const platform = /iPhone|iPad|iPod/i.test(value)
      ? 'iOS'
      : /Android/i.test(value)
        ? 'Android'
        : /Windows/i.test(value)
          ? 'Windows'
          : /Mac OS|Macintosh/i.test(value)
            ? 'macOS'
            : /Linux/i.test(value)
              ? 'Linux'
              : 'device';
   return `${browser} on ${platform}`;
}
