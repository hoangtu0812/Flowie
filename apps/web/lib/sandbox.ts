import { ApiRequestError, responseData } from '@/lib/http';
import { authenticatedFetch } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Docker's container state, or 'none' before the first start (docs/sandbox.md). */
/** VI: Trạng thái container của Docker, hoặc 'none' trước lần khởi động đầu (docs/sandbox.md). */
export type SandboxState =
   'none' | 'created' | 'running' | 'paused' | 'restarting' | 'exited' | 'dead' | string;

/** termi inside the caller's own sandbox, proxied by the API. */
/** VI: termi trong sandbox của chính người gọi, đi qua proxy của API. */
export const sandboxUiUrl = `${api}/sandbox/ui/`;

async function call(method: string, path = ''): Promise<SandboxState> {
   const response = await authenticatedFetch(`${api}/sandbox${path}`, { method });
   return (await responseData<{ state: SandboxState }>(response, 'Could not reach the sandbox.'))
      .state;
}

export const loadSandbox = () => call('GET');
export const startSandbox = () => call('PUT');
export const stopSandbox = () => call('POST', '/stop');

let enabled: Promise<boolean> | undefined;

/**
 * Whether the signed-in user may use a sandbox (their email is in SANDBOX_USERS). Asked once per
 * page load; only a 403 means no, so a passing error retries on the next load.
 * VI: Người đang đăng nhập có được dùng sandbox không (email nằm trong SANDBOX_USERS). Chỉ hỏi
 * VI: một lần mỗi lần tải trang; chỉ 403 mới là không, lỗi thoáng qua sẽ hỏi lại lần tải sau.
 */
export function sandboxEnabled(): Promise<boolean> {
   enabled ??= loadSandbox().then(
      () => true,
      (error: unknown) => {
         if (!(error instanceof ApiRequestError && error.status === 403)) enabled = undefined;
         return false;
      }
   );
   return enabled;
}
