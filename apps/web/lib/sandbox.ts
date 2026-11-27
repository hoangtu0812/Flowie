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
export function sandboxSessionUrl(session: string, fontSize?: number): string {
   const query = new URLSearchParams({ arg: session });
   // ttyd reads its client options from the page's query, so the font size travels with it.
   // VI: ttyd đọc tuỳ chọn client từ query của trang, nên cỡ chữ đi kèm URL.
   if (fontSize) query.set('fontSize', String(fontSize));
   return `${sandboxUiUrl}?${query}`;
}

/** A tmux session and the agent running in it (`state` is `shell` when there is none). */
/** VI: Một phiên tmux và agent chạy trong đó (`state` là `shell` khi không có agent). */
export type SandboxSession = {
   name: string;
   dir: string;
   agent: SandboxAgent | null;
   state: 'working' | 'waiting' | 'idle' | 'shell';
   preview: string;
   /** Branch and uncommitted files of the folder; null outside a repository. */
   branch?: string | null;
   changes?: number | null;
};

export type SandboxConversation = {
   agent: SandboxAgent;
   id: string;
   cwd: string;
   title: string;
   mtime: number;
};

/** The sandbox's tmux sessions, most recently used first; none while it is stopped. */
/** VI: Các phiên tmux của sandbox, phiên dùng gần nhất trước; rỗng khi sandbox đang dừng. */
export async function loadSandboxSessions(): Promise<SandboxSession[]> {
   return responseData<SandboxSession[]>(
      await authenticatedFetch(`${api}/sandbox/sessions`),
      'Could not load the sessions.'
   );
}

export async function createSandboxSession(input: {
   name: string;
   dir: string;
   agent: SandboxAgent | null;
   resume?: string;
}): Promise<string> {
   const response = await authenticatedFetch(`${api}/sandbox/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
   });
   return (await responseData<{ name: string }>(response, 'Could not create the session.')).name;
}

export async function renameSandboxSession(name: string, to: string): Promise<string> {
   const response = await authenticatedFetch(
      `${api}/sandbox/sessions/${encodeURIComponent(name)}/rename`,
      {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ to }),
      }
   );
   return (await responseData<{ name: string }>(response, 'Could not rename the session.')).name;
}

/** Folders to start a session in: the home first, then recent ones. */
/** VI: Thư mục để mở phiên: home trước, rồi các thư mục gần đây. */
export async function loadSandboxDirs(): Promise<{ home: string; recent: string[] }> {
   return responseData(await authenticatedFetch(`${api}/sandbox/dirs`), 'Could not load folders.');
}

export async function loadSandboxConversations(dir: string): Promise<SandboxConversation[]> {
   return responseData(
      await authenticatedFetch(`${api}/sandbox/conversations?${new URLSearchParams({ dir })}`),
      'Could not load conversations.'
   );
}

export async function closeSandboxSession(name: string): Promise<void> {
   const response = await authenticatedFetch(
      `${api}/sandbox/sessions/${encodeURIComponent(name)}`,
      { method: 'DELETE' }
   );
   if (!response.ok) await responseData(response, 'Could not close the session.');
}

export type SandboxKey =
   | 'Escape'
   | 'C-c'
   | 'C-d'
   | 'Tab'
   | 'BTab'
   | 'Up'
   | 'Down'
   | 'Left'
   | 'Right'
   | 'Enter'
   | 'PageUp'
   | 'PageDown';

/** Types into a session: a key, then text as one bracketed paste, then Enter if asked. */
/** VI: Gõ vào một phiên: một phím, rồi chữ dạng một lần bracketed paste, rồi Enter nếu cần. */
export async function sendToSandboxSession(
   name: string,
   input: { text?: string; key?: SandboxKey; enter?: boolean }
): Promise<void> {
   const response = await authenticatedFetch(
      `${api}/sandbox/sessions/${encodeURIComponent(name)}/send`,
      {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify(input),
      }
   );
   await responseData(response, 'Could not send to the session.');
}

export async function loadSandboxSessionText(name: string): Promise<string> {
   const response = await authenticatedFetch(
      `${api}/sandbox/sessions/${encodeURIComponent(name)}/text`
   );
   return (await responseData<{ text: string }>(response, 'Could not read the session.')).text;
}

/** Puts an attached file in the sandbox and returns its path there. */
/** VI: Đưa file đính kèm vào sandbox và trả đường dẫn của nó trong đó. */
export async function uploadToSandbox(file: File): Promise<string> {
   const response = await authenticatedFetch(`${api}/sandbox/uploads`, {
      method: 'POST',
      headers: { 'x-filename': encodeURIComponent(file.name) },
      body: file,
   });
   return (await responseData<{ path: string }>(response, 'Could not upload the file.')).path;
}

export type SandboxEntry = {
   name: string;
   path: string;
   dir: boolean;
   size: number;
   mtime: number;
   git?: string;
};

export type SandboxFile = { path: string; text?: string; image?: boolean; binary?: boolean };

export type SandboxCommit = {
   h: string;
   p: string[];
   refs: string[];
   s: string;
   a: string;
   t: number;
};

export type SandboxGit = {
   dir: string;
   head: string;
   files: { x: string; y: string; path: string }[];
   commits: SandboxCommit[];
   graph: { width: number; rows: { col: number; seg: [number, number, number, number][] }[] };
   branches: string[];
};

export type SandboxDiff = {
   text: string;
   files?: { path: string; add: number | null; del: number | null }[];
   commit?: { hash: string; author: string; t: number; subject: string; body: string } | null;
};

const query = (values: Record<string, string>) => new URLSearchParams(values).toString();

/** A folder of the sandbox's home (the home itself when `dir` is empty). */
/** VI: Một thư mục trong home của sandbox (chính home khi `dir` rỗng). */
export async function loadSandboxFolder(
   dir: string
): Promise<{ dir: string; parent: string | null; entries: SandboxEntry[] }> {
   return responseData(
      await authenticatedFetch(`${api}/sandbox/files${dir ? `?${query({ dir })}` : ''}`),
      'Could not open the folder.'
   );
}

export async function loadSandboxFile(path: string): Promise<SandboxFile> {
   return responseData(
      await authenticatedFetch(`${api}/sandbox/file?${query({ path })}`),
      'Could not open the file.'
   );
}

export const sandboxImageUrl = (path: string) => `${api}/sandbox/file/raw?${query({ path })}`;

export async function loadSandboxGit(dir: string): Promise<SandboxGit> {
   return responseData(
      await authenticatedFetch(`${api}/sandbox/git?${query({ dir })}`),
      'Could not read the repository.'
   );
}

export async function loadSandboxDiff(
   dir: string,
   options: { rev?: string; file?: string; staged?: boolean }
): Promise<SandboxDiff> {
   const values = { dir, rev: options.rev ?? '', file: options.file ?? '' };
   const staged = options.staged ? '&staged=true' : '';
   return responseData(
      await authenticatedFetch(`${api}/sandbox/git/diff?${query(values)}${staged}`),
      'Could not read the diff.'
   );
}

export type SandboxGitOp =
   | { op: 'stage' | 'unstage'; paths: string[] }
   | { op: 'commit'; message: string }
   | { op: 'switch'; branch: string }
   | { op: 'push' | 'pull' | 'fetch' };

/** One git operation in a repository of the sandbox; returns git's output. */
/** VI: Một thao tác git trong một repository của sandbox; trả output của git. */
export async function runSandboxGit(dir: string, op: SandboxGitOp): Promise<string> {
   const response = await authenticatedFetch(`${api}/sandbox/git`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dir, ...op }),
   });
   return (await responseData<{ output: string }>(response, 'The git operation failed.')).output;
}

type PlanWindow = { pct: number; resetsAt: number; minutes?: number } | null;

export type SandboxUsage = {
   cpu: number | null;
   memory: { used: number | null; limit: number | null };
   disk: { free: number; total: number };
   claude: { fiveHour: PlanWindow; sevenDay: PlanWindow; at?: number } | null;
   codex: { plan?: string | null; primary: PlanWindow; secondary: PlanWindow } | null;
};

/** CPU, memory, disk and plan limits of the sandbox; null while it is stopped. */
/** VI: CPU, bộ nhớ, ổ đĩa và giới hạn gói của sandbox; null khi đang dừng. */
export async function loadSandboxUsage(): Promise<SandboxUsage | null> {
   return responseData(await authenticatedFetch(`${api}/sandbox/usage`), 'Could not read usage.');
}

export type SandboxChatStep = {
   verb: string;
   detail: string;
   file?: string;
   change?: 'edit' | 'create';
   files?: { file: string; change: 'edit' | 'create' }[];
};

export type SandboxChatItem =
   | { kind: 'msg'; who: 'user' | 'assistant'; text: string; t: string | null }
   | { kind: 'tools'; steps: SandboxChatStep[]; t: string | null };

export type SandboxChat = {
   agent: SandboxAgent | null;
   state?: SandboxSession['state'];
   dir: string;
   items: SandboxChatItem[];
};

/** The session's conversation as termi's chat. VI: Hội thoại của phiên dạng chat của termi. */
export async function loadSandboxChat(name: string): Promise<SandboxChat> {
   return responseData(
      await authenticatedFetch(`${api}/sandbox/sessions/${encodeURIComponent(name)}/chat`),
      'Could not read the conversation.'
   );
}

export async function loadSandboxConversation(
   agent: SandboxAgent,
   id: string
): Promise<SandboxChat> {
   return responseData(
      await authenticatedFetch(`${api}/sandbox/conversations/${agent}/${encodeURIComponent(id)}`),
      'Could not read the conversation.'
   );
}

export type SandboxRun = {
   id: string;
   number: string;
   title: string;
   pipeline: string;
   pipelineId: string;
   status: 'queued' | 'running' | 'completed';
   result: 'success' | 'failure' | 'cancelled' | 'warning' | 'other' | null;
   trigger: string;
   branch: string;
   ref: string;
   sha: string;
   actor: string;
   queuedAt: number | null;
   startedAt: number | null;
   finishedAt: number | null;
   url: string;
};

export type SandboxCi =
   | { provider: null }
   | {
        provider: 'github' | 'azure';
        repo: string;
        page: string;
        branch: string;
        pipelines: { id: string; name: string; recent: string[] }[];
        runs: SandboxRun[];
     };

/** CI runs of a folder's repository, as termi's Pipelines. VI: Lần chạy CI của repo chứa thư mục. */
export async function loadSandboxCi(dir: string, fresh = false): Promise<SandboxCi> {
   const query = new URLSearchParams({ dir, ...(fresh ? { fresh: 'true' } : {}) });
   return responseData(
      await authenticatedFetch(`${api}/sandbox/ci?${query}`),
      'Could not read the pipelines.'
   );
}

export async function loadSandboxCiLog(dir: string, id: string): Promise<string> {
   const response = await authenticatedFetch(
      `${api}/sandbox/ci/log?${new URLSearchParams({ dir, id })}`
   );
   return (await responseData<{ text: string }>(response, 'Could not read the log.')).text;
}

export async function runSandboxCiAction(
   dir: string,
   id: string,
   action: 'rerun' | 'cancel'
): Promise<void> {
   const response = await authenticatedFetch(`${api}/sandbox/ci`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dir, id, action }),
   });
   await responseData(response, 'The pipeline action failed.');
}

/** The latest run on the branch: failure, running or ok, for badges. VI: Lần chạy mới nhất của nhánh. */
export function ciBadge(ci: SandboxCi | null): 'failure' | 'running' | 'ok' | null {
   if (!ci || !ci.provider) return null;
   const latest = ci.runs.find((run) => !ci.branch || run.branch === ci.branch);
   if (!latest) return null;
   if (latest.status !== 'completed') return 'running';
   return latest.result === 'failure' ? 'failure' : 'ok';
}
