'use client';

import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useMessages } from '@/features/shared/use-messages';
import { tlsProbeCommand } from './tls-guide';
import type { ClientName, ClientOs } from './client-config';

const messages = {
   'Certificates (.crt / TLS)': 'Chứng chỉ (.crt / TLS)',
   'Publicly trusted HTTPS usually needs no extra certificate. For an internal CA or a TLS error, complete these steps before connecting.':
      'HTTPS dùng CA công khai thường không cần thêm chứng chỉ. Với CA nội bộ hoặc lỗi TLS, hoàn thành các bước sau trước khi kết nối.',
   'Setup steps': 'Các bước cài đặt',
   'Get the approved CA': 'Lấy CA được phê duyệt',
   'Ask IT for the root CA and any intermediate certificates, verify their source and SHA-256 fingerprint, and check expiry and the endpoint hostname. A .crt file may be PEM or DER; ask for a PEM bundle for Node.js or curl. Never use a private key or trust an arbitrary server certificate as a CA.':
      'Nhờ IT cung cấp root CA và chứng chỉ trung gian, xác minh nguồn cùng fingerprint SHA-256, kiểm tra hạn và hostname endpoint. File .crt có thể là PEM hoặc DER; xin bundle PEM cho Node.js/curl. Không dùng private key hoặc tin chứng chỉ máy chủ bất kỳ như CA.',
   'Trust the CA on {os}': 'Tin cậy CA trên {os}',
   'Open Keychain Access, select login or System as IT requires, then import the CA. Open the approved root certificate and set its SSL trust according to company policy. Administrator permission may be required.':
      'Mở Keychain Access, chọn login hoặc System theo IT, rồi import CA. Mở root CA đã phê duyệt và đặt trust SSL theo chính sách công ty. Có thể cần quyền quản trị.',
   'Open certmgr.msc for Current User. Import the approved root into Trusted Root Certification Authorities → Certificates; put intermediate CAs in Intermediate Certification Authorities. Follow IT policy if the client runs under another account or needs machine-wide trust.':
      'Mở certmgr.msc cho Current User. Import root đã phê duyệt vào Trusted Root Certification Authorities → Certificates; CA trung gian vào Intermediate Certification Authorities. Theo chính sách IT nếu client chạy bằng tài khoản khác hoặc cần trust toàn máy.',
   'On Ubuntu/Debian, IT can place a PEM root CA with a .crt extension in /usr/local/share/ca-certificates and run sudo update-ca-certificates. Other distributions use different trust-store tools.':
      'Trên Ubuntu/Debian, IT có thể đặt root CA dạng PEM có đuôi .crt vào /usr/local/share/ca-certificates và chạy sudo update-ca-certificates. Distro khác dùng công cụ trust store khác.',
   'Restart the actual client': 'Khởi động lại đúng client',
   'Fully quit and reopen {client}, including background processes. Browser trust and client trust can differ. Apps opened from the Dock or Start menu do not automatically inherit variables set in a terminal. Repeat CA setup on a new machine or when IT rotates the CA.':
      'Thoát hẳn và mở lại {client}, kể cả tiến trình nền. Trust của trình duyệt và client có thể khác nhau. App mở từ Dock/Start không tự nhận biến đã đặt trong terminal. Cấu hình lại CA khi đổi máy hoặc IT thay CA.',
   'Check TLS, then check MCP': 'Kiểm tra TLS, rồi kiểm tra MCP',
   'Replace the CA path below and run it in Terminal or PowerShell. It sends no token. An HTTP response, including 401/403/405, confirms TLS completed, not that MCP or the grant works. Then use the connection check and confirm tool discovery inside your AI client.':
      'Thay đường dẫn CA bên dưới rồi chạy trong Terminal/PowerShell. Lệnh không gửi token. Có phản hồi HTTP, kể cả 401/403/405, nghĩa là TLS đã hoàn tất, chưa chứng minh MCP/quyền hoạt động. Sau đó kiểm tra kết nối và xác nhận khám phá tool trong AI client.',
   'This endpoint is not HTTPS. Certificate checks apply to HTTPS; use HTTPS outside local development.':
      'Endpoint này không phải HTTPS. Kiểm tra chứng chỉ áp dụng cho HTTPS; dùng HTTPS ngoài môi trường phát triển local.',
   'Only for Node.js clients or bridges': 'Chỉ dành cho client hoặc bridge Node.js',
   'If the actual process uses Node.js, set NODE_EXTRA_CA_CERTS to the absolute PEM bundle path before starting it, then restart. This is not a universal setting for Codex or native clients; follow their documented CA settings.':
      'Nếu tiến trình thực sự dùng Node.js, đặt NODE_EXTRA_CA_CERTS trỏ tới bundle PEM tuyệt đối trước khi khởi chạy, rồi khởi động lại. Đây không phải cấu hình chung cho Codex/client native; theo hướng dẫn CA riêng của client.',
   'Troubleshooting': 'Xử lý lỗi',
   'Certificate / issuer errors': 'Lỗi certificate / issuer',
   'Check the CA file, process environment and full server chain. Expired certificates and hostname mismatches must be fixed by IT on the server. Keep TLS verification enabled.':
      'Kiểm tra file CA, môi trường tiến trình và chain đầy đủ trên server. Chứng chỉ hết hạn hoặc sai hostname cần IT sửa phía server. Giữ bật xác thực TLS.',
   'HTTP 401 / 403 / 404 / 405': 'HTTP 401 / 403 / 404 / 405',
   '401: check token expiry or revocation. 403: check scopes, team/project grants and write permissions. 404/405: check the exact MCP endpoint and transport. The web check uses browser trust, so also test in the AI client.':
      '401: kiểm tra token hết hạn/thu hồi. 403: kiểm tra scope, quyền team/project và quyền ghi. 404/405: kiểm tra đúng endpoint MCP và transport. Web check dùng trust của trình duyệt nên cần thử cả trong AI client.',
   'Official references': 'Tài liệu chính thức',
} as const;
const sources = [
   ['Apple Keychain', 'https://support.apple.com/guide/keychain-access/kyca2431/mac'],
   [
      'Windows certificates',
      'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/certutil',
   ],
   [
      'Ubuntu trust store',
      'https://ubuntu.com/server/docs/how-to/security/install-a-root-ca-certificate-in-the-trust-store/',
   ],
   ['Node.js CA', 'https://nodejs.org/api/cli.html#node_extra_ca_certsfile'],
   ['curl TLS', 'https://curl.se/docs/sslcerts.html'],
   ['Codex MCP', 'https://developers.openai.com/learn/docs-mcp'],
] as const;

export function McpTlsGuide({
   endpoint,
   client,
   os,
}: {
   endpoint: string;
   client: ClientName;
   os: ClientOs;
}) {
   const tx = useMessages(messages);
   const command = tlsProbeCommand(endpoint, os);
   const trust =
      os === 'macOS'
         ? 'Open Keychain Access, select login or System as IT requires, then import the CA. Open the approved root certificate and set its SSL trust according to company policy. Administrator permission may be required.'
         : os === 'Windows'
           ? 'Open certmgr.msc for Current User. Import the approved root into Trusted Root Certification Authorities → Certificates; put intermediate CAs in Intermediate Certification Authorities. Follow IT policy if the client runs under another account or needs machine-wide trust.'
           : 'On Ubuntu/Debian, IT can place a PEM root CA with a .crt extension in /usr/local/share/ca-certificates and run sudo update-ca-certificates. Other distributions use different trust-store tools.';
   return (
      <VStack
         as="section"
         gap={3}
         className="min-w-0 w-full"
         aria-label={tx('Certificates (.crt / TLS)')}
      >
         <Heading level={4}>{tx('Certificates (.crt / TLS)')}</Heading>
         <Text>
            {tx(
               'Publicly trusted HTTPS usually needs no extra certificate. For an internal CA or a TLS error, complete these steps before connecting.'
            )}
         </Text>
         <List listStyle="decimal" density="compact" header={tx('Setup steps')}>
            <ListItem
               label={tx('Get the approved CA')}
               description={
                  <Text>
                     {tx(
                        'Ask IT for the root CA and any intermediate certificates, verify their source and SHA-256 fingerprint, and check expiry and the endpoint hostname. A .crt file may be PEM or DER; ask for a PEM bundle for Node.js or curl. Never use a private key or trust an arbitrary server certificate as a CA.'
                     )}
                  </Text>
               }
            />
            <ListItem
               label={tx('Trust the CA on {os}', { os })}
               description={<Text>{tx(trust)}</Text>}
            />
            <ListItem
               label={tx('Restart the actual client')}
               description={
                  <Text>
                     {tx(
                        'Fully quit and reopen {client}, including background processes. Browser trust and client trust can differ. Apps opened from the Dock or Start menu do not automatically inherit variables set in a terminal. Repeat CA setup on a new machine or when IT rotates the CA.',
                        { client }
                     )}
                  </Text>
               }
            />
            <ListItem
               label={tx('Check TLS, then check MCP')}
               description={
                  <Text>
                     {tx(
                        'Replace the CA path below and run it in Terminal or PowerShell. It sends no token. An HTTP response, including 401/403/405, confirms TLS completed, not that MCP or the grant works. Then use the connection check and confirm tool discovery inside your AI client.'
                     )}
                  </Text>
               }
            />
         </List>
         {command ? (
            <pre className="max-w-full overflow-auto rounded bg-muted p-3">
               <code>{command}</code>
            </pre>
         ) : (
            <Text type="supporting">
               {tx(
                  'This endpoint is not HTTPS. Certificate checks apply to HTTPS; use HTTPS outside local development.'
               )}
            </Text>
         )}
         <Heading level={4}>{tx('Only for Node.js clients or bridges')}</Heading>
         <Text>
            {tx(
               'If the actual process uses Node.js, set NODE_EXTRA_CA_CERTS to the absolute PEM bundle path before starting it, then restart. This is not a universal setting for Codex or native clients; follow their documented CA settings.'
            )}
         </Text>
         <pre className="max-w-full overflow-auto rounded bg-muted p-3">
            <code>
               {os === 'Windows'
                  ? "$env:NODE_EXTRA_CA_CERTS = 'C:\\Certificates\\company-ca.pem'"
                  : "export NODE_EXTRA_CA_CERTS='/absolute/path/company-ca.pem'"}
            </code>
         </pre>
         <List density="compact" header={tx('Troubleshooting')}>
            <ListItem
               label={tx('Certificate / issuer errors')}
               description={
                  <Text>
                     {tx(
                        'Check the CA file, process environment and full server chain. Expired certificates and hostname mismatches must be fixed by IT on the server. Keep TLS verification enabled.'
                     )}
                  </Text>
               }
            />
            <ListItem
               label={tx('HTTP 401 / 403 / 404 / 405')}
               description={
                  <Text>
                     {tx(
                        '401: check token expiry or revocation. 403: check scopes, team/project grants and write permissions. 404/405: check the exact MCP endpoint and transport. The web check uses browser trust, so also test in the AI client.'
                     )}
                  </Text>
               }
            />
         </List>
         <HStack gap={1} wrap="wrap" aria-label={tx('Official references')}>
            {sources.map(([label, href]) => (
               <Button
                  key={label}
                  label={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  size="sm"
                  variant="ghost"
               />
            ))}
         </HStack>
      </VStack>
   );
}
