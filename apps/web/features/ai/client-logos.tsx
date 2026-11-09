import { SiClaude, SiGoogle, SiOpenai } from 'react-icons/si';
import { VscVscode } from 'react-icons/vsc';
import type { ClientName } from './client-config';

// Brand marks drawn in currentColor so they follow the light and dark theme. Codex and
// Antigravity show their vendor's mark (OpenAI, Google): neither has a licensed icon of its own.
// Sources: simple-icons (CC0) through react-icons, and VS Code codicons (CC BY 4.0).
// VI: Logo vẽ bằng currentColor để theo theme sáng và tối. Codex và Antigravity dùng logo của
// VI: hãng (OpenAI, Google) vì chưa có biểu tượng riêng được cấp phép. Nguồn: simple-icons
// VI: (CC0) qua react-icons, và codicons của VS Code (CC BY 4.0).

// Cursor and Model Context Protocol paths come from simple-icons 15 (CC0); react-icons 5.5
// predates both icons.
// VI: Path của Cursor và Model Context Protocol lấy từ simple-icons 15 (CC0); react-icons 5.5
// VI: ra đời trước khi có hai biểu tượng này.
const CURSOR_PATH =
   'M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23';
const MCP_PATH =
   'M13.85 0a4.16 4.16 0 0 0-2.95 1.217L1.456 10.66a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l9.442-9.442a2.49 2.49 0 0 1 3.541 0 2.49 2.49 0 0 1 0 3.541L8.59 12.97l-.1.1a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l.1-.098 7.03-7.034a2.49 2.49 0 0 1 3.542 0l.049.05a2.49 2.49 0 0 1 0 3.54l-8.54 8.54a1.96 1.96 0 0 0 0 2.755l1.753 1.753a.835.835 0 0 0 1.18 0 .835.835 0 0 0 0-1.18l-1.753-1.753a.266.266 0 0 1 0-.394l8.54-8.54a4.185 4.185 0 0 0 0-5.9l-.05-.05a4.16 4.16 0 0 0-2.95-1.218c-.2 0-.401.02-.6.048a4.17 4.17 0 0 0-1.17-3.552A4.16 4.16 0 0 0 13.85 0m0 3.333a.84.84 0 0 0-.59.245L6.275 10.56a4.186 4.186 0 0 0 0 5.902 4.186 4.186 0 0 0 5.902 0L19.16 9.48a.835.835 0 0 0 0-1.18.835.835 0 0 0-1.18 0l-6.985 6.984a2.49 2.49 0 0 1-3.54 0 2.49 2.49 0 0 1 0-3.54l6.983-6.985a.835.835 0 0 0 0-1.18.84.84 0 0 0-.59-.245';

function PathIcon({ d, className }: { d: string; className: string }) {
   return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
         <path d={d} />
      </svg>
   );
}

export function ClientLogo({ client }: { client: ClientName }) {
   const className = 'size-4 shrink-0';
   switch (client) {
      case 'Claude Code':
         return <SiClaude aria-hidden className={className} />;
      case 'Codex':
         return <SiOpenai aria-hidden className={className} />;
      case 'Cursor':
         return <PathIcon d={CURSOR_PATH} className={className} />;
      case 'VS Code':
         return <VscVscode aria-hidden className={className} />;
      case 'Antigravity':
         return <SiGoogle aria-hidden className={className} />;
   }
}

export function McpLogo({ className = 'size-5 shrink-0' }: { className?: string }) {
   return <PathIcon d={MCP_PATH} className={className} />;
}
