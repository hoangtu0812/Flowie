export type ClientName = 'Codex' | 'Cursor' | 'Claude Code';
export const READ_PRESET = [
   'context:read',
   'projects:read',
   'issues:read',
   'comments:read',
   'documents:read',
   'activities:read',
   'reviews:read',
   'runs:read',
];
export const CODING_PRESET = [
   ...READ_PRESET,
   'issues:write',
   'issues:transition',
   'comments:write',
   'documents:write',
   'runs:write',
];
export function clientConfig(client: ClientName, endpoint: string): string {
   if (client === 'Codex')
      return `[mcp_servers.flowie]\nurl = ${JSON.stringify(endpoint)}\nbearer_token_env_var = "FLOWIE_MCP_TOKEN"\nstartup_timeout_sec = 20\ntool_timeout_sec = 45\n`;
   return JSON.stringify(
      {
         mcpServers: {
            flowie: {
               ...(client === 'Claude Code' ? { type: 'http' } : {}),
               url: endpoint,
               headers: {
                  Authorization:
                     client === 'Cursor'
                        ? 'Bearer ${env:FLOWIE_MCP_TOKEN}'
                        : 'Bearer ${FLOWIE_MCP_TOKEN}',
               },
            },
         },
      },
      null,
      2
   );
}
export const CLIENT_FILES: Record<ClientName, string> = {
   'Codex': '~/.codex/config.toml',
   'Cursor': '.cursor/mcp.json',
   'Claude Code': '.mcp.json',
};
