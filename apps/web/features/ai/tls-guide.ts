import type { ClientOs } from './client-config';

/** Builds a certificate-only check; shell quoting keeps endpoint characters literal and no token is accepted.
 * VI: Tạo kiểm tra chỉ chứng chỉ; quote shell giữ ký tự endpoint nguyên nghĩa và hàm không nhận token. */
export function tlsProbeCommand(endpoint: string, os: ClientOs): string | undefined {
   try {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:' || url.username || url.password) return undefined;
   } catch {
      return undefined;
   }
   const quote = (value: string) =>
      os === 'Windows' ? `'${value.replace(/'/g, "''")}'` : `'${value.replace(/'/g, "'\\''")}'`;
   const file =
      os === 'Windows' ? 'C:\\Certificates\\company-ca.pem' : '/absolute/path/company-ca.pem';
   return `${os === 'Windows' ? 'curl.exe' : 'curl'} --cacert ${quote(file)} --head -- ${quote(endpoint)}`;
}
