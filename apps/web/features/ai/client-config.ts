export type ClientName = 'Claude Code' | 'Codex' | 'Cursor' | 'VS Code' | 'Antigravity';
export type ClientOs = 'macOS' | 'Windows';
export const CLIENTS: ClientName[] = ['Claude Code', 'Codex', 'Cursor', 'VS Code', 'Antigravity'];
export const TOKEN_PLACEHOLDER = '<FLOWIE_MCP_TOKEN>';
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

// User-level files only: a project file such as `.mcp.json` would put the embedded token
// into a repository where it can be committed.
// VI: Chỉ dùng file cấp user: file của project như `.mcp.json` sẽ đưa token vào repository
// và có thể bị commit.
export const CLIENT_FILES: Record<ClientName, string> = {
   'Claude Code': 'the user configuration of Claude Code',
   'Codex': '~/.codex/config.toml',
   'Cursor': '~/.cursor/mcp.json',
   'VS Code': 'your user mcp.json (MCP: Open User Configuration)',
   'Antigravity': 'the raw MCP config (Manage MCP Servers → View raw config)',
};

export function defaultOs(): ClientOs {
   return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
      ? 'Windows'
      : 'macOS';
}

const bearer = (token?: string) => `Bearer ${token ?? TOKEN_PLACEHOLDER}`;

// Manual configuration with the token embedded, so GUI clients need no environment variable
// (macOS apps started from the Dock never read ~/.zshrc). Values go through JSON.stringify;
// a JSON string is also a valid TOML basic string.
// VI: Cấu hình dán tay có sẵn token, để client GUI không cần biến môi trường (app macOS mở
// từ Dock không đọc ~/.zshrc). Giá trị đi qua JSON.stringify; chuỗi JSON cũng là basic
// string hợp lệ của TOML.
export function clientConfig(client: ClientName, endpoint: string, token?: string): string {
   const headers = { Authorization: bearer(token) };
   if (client === 'Codex')
      return `[mcp_servers.flowie]\nurl = ${JSON.stringify(endpoint)}\nhttp_headers = { Authorization = ${JSON.stringify(bearer(token))} }\nstartup_timeout_sec = 20\ntool_timeout_sec = 45\n`;
   const server =
      client === 'VS Code'
         ? { servers: { flowie: { type: 'http', url: endpoint, headers } } }
         : client === 'Antigravity'
           ? { mcpServers: { flowie: { serverUrl: endpoint, headers } } }
           : {
                mcpServers: {
                   flowie: {
                      ...(client === 'Claude Code' ? { type: 'http' } : {}),
                      url: endpoint,
                      headers,
                   },
                },
             };
   return JSON.stringify(server, null, 2);
}

// One command that the user pastes into Terminal (macOS) or PowerShell (Windows). It first
// removes an existing `flowie` server, so running it again with a new token does not fail.
// For Codex it never appends a second `[mcp_servers.flowie]` table, because Codex refuses to
// start with a duplicate TOML table. PowerShell writes ASCII so Windows PowerShell 5.1 adds
// no BOM; the URL and the `flowie_mcp_` + urlsafe token are ASCII and safe inside quotes.
// Returns undefined for clients without a command-line install.
// VI: Một lệnh để người dùng dán vào Terminal (macOS) hoặc PowerShell (Windows). Lệnh xoá
// server `flowie` cũ trước, nên chạy lại với token mới không bị lỗi. Với Codex, lệnh không
// bao giờ thêm bảng `[mcp_servers.flowie]` thứ hai, vì Codex không khởi động khi TOML có bảng
// trùng. PowerShell ghi ASCII để Windows PowerShell 5.1 không thêm BOM; URL và token
// `flowie_mcp_` + urlsafe đều là ASCII, an toàn trong dấu nháy.
// Trả về undefined với client không cài được bằng dòng lệnh.
export function installCommand(
   client: ClientName,
   os: ClientOs,
   endpoint: string,
   token?: string
): string | undefined {
   const windows = os === 'Windows';
   const quiet = (command: string) =>
      windows ? `try { ${command} *> $null } catch {}` : `${command} >/dev/null 2>&1`;
   if (client === 'Claude Code')
      return `${quiet('claude mcp remove --scope user flowie')}${windows ? '\n' : ';\n'}claude mcp add --transport http --scope user flowie ${JSON.stringify(endpoint)} --header ${JSON.stringify(`Authorization: ${bearer(token)}`)}`;
   if (client !== 'Codex') return undefined;
   const block = `\n${clientConfig('Codex', endpoint, token)}`;
   const exists =
      'Remove the existing [mcp_servers.flowie] block from the Codex config.toml, then run this again.';
   if (windows)
      return `${quiet('codex mcp remove flowie')}
$config = Join-Path $HOME '.codex\\config.toml'
New-Item -ItemType Directory -Force -Path (Split-Path $config) | Out-Null
if ((Test-Path $config) -and (Select-String -Path $config -Pattern '^\\[mcp_servers\\.flowie\\]' -Quiet)) {
   Write-Host '${exists}'
} else {
   Add-Content -Path $config -Encoding ascii -Value @'
${block}'@
}`;
   return `${quiet('codex mcp remove flowie')}
mkdir -p ~/.codex
if grep -q '^\\[mcp_servers\\.flowie\\]' ~/.codex/config.toml 2>/dev/null; then
   echo '${exists}'
else
   cat >> ~/.codex/config.toml <<'EOF'
${block}EOF
fi`;
}

// One-click install links handled by the desktop client. Formats follow Cursor's
// "MCP install links" (base64 server object, name passed separately) and VS Code's MCP
// developer guide (URL-encoded object that includes `name`).
// VI: Link cài một chạm do client desktop xử lý. Định dạng theo "MCP install links" của
// Cursor (object server mã hoá base64, tên truyền riêng) và MCP developer guide của VS Code
// (object mã hoá URL, có `name`).
export function installLink(client: ClientName, endpoint: string, token?: string) {
   const headers = { Authorization: bearer(token) };
   if (client === 'Cursor')
      return `cursor://anysphere.cursor-deeplink/mcp/install?name=flowie&config=${encodeURIComponent(btoa(JSON.stringify({ url: endpoint, headers })))}`;
   if (client === 'VS Code')
      return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: 'flowie', type: 'http', url: endpoint, headers }))}`;
   return undefined;
}
