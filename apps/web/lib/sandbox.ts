import { ApiRequestError, responseData } from '@/lib/http';
import { authenticatedFetch } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Docker's container state, or 'none' before the first start (docs/sandbox.md). */
/** VI: Trạng thái container của Docker, hoặc 'none' trước lần khởi động đầu (docs/sandbox.md). */
export type SandboxState =
   'none' | 'created' | 'running' | 'paused' | 'restarting' | 'exited' | 'dead' | string;

/** The terminal (ttyd) inside the caller's own sandbox, proxied by the API. */
/** VI: Terminal (ttyd) trong sandbox của chính người gọi, đi qua proxy của API. */
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

export type SandboxAgent = 'claude' | 'codex';
export type SandboxRepository = { id: string; name: string };

/** Repositories of the issue's project that "Open with Claude/Codex" can use. */
/** VI: Các repository của dự án chứa task mà "Mở bằng Claude/Codex" dùng được. */
export async function loadSandboxRepositories(issueId: string): Promise<SandboxRepository[]> {
   const response = await authenticatedFetch(
      `${api}/sandbox/repositories?issueId=${encodeURIComponent(issueId)}`
   );
   return responseData<SandboxRepository[]>(response, 'Could not load the repositories.');
}

/** Starts the sandbox and opens the issue's terminal session; returns the session name. */
/** VI: Khởi động sandbox và mở phiên terminal của task; trả về tên phiên. */
export async function openInSandbox(
   issueId: string,
   repositoryId: string,
   agent: SandboxAgent
): Promise<string> {
   const response = await authenticatedFetch(`${api}/sandbox/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ issueId, repositoryId, agent }),
   });
   return (await responseData<{ session: string }>(response, 'Could not open the sandbox.'))
      .session;
}

/** The terminal (ttyd) attached to one tmux session; ttyd creates the session if it is new. */
/** VI: Terminal (ttyd) gắn vào một phiên tmux; ttyd tạo phiên nếu chưa có. */
export function sandboxSessionUrl(session: string): string {
   return `${sandboxUiUrl}?${new URLSearchParams({ arg: session })}`;
}

/** The sandbox's tmux sessions, most recently used first; none while it is stopped. */
/** VI: Các phiên tmux của sandbox, phiên dùng gần nhất trước; rỗng khi sandbox đang dừng. */
export async function loadSandboxSessions(): Promise<string[]> {
   const response = await authenticatedFetch(`${api}/sandbox/sessions`);
   const sessions = await responseData<{ name: string }[]>(
      response,
      'Could not load the sessions.'
   );
   return sessions.map((session) => session.name);
}

export async function closeSandboxSession(name: string): Promise<void> {
   const response = await authenticatedFetch(
      `${api}/sandbox/sessions/${encodeURIComponent(name)}`,
      { method: 'DELETE' }
   );
   if (!response.ok) await responseData(response, 'Could not close the session.');
}
